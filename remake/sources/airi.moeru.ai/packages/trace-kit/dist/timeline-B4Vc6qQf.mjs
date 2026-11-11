import { k as aggregate, q as matchTrackPath } from "./conventions-DLiC8rkL.mjs";
import { t as ClockGraph } from "./clock-hjTPEs21.mjs";
import { i as streamClockOf, n as recordKey, r as spanKeyOf, t as epochKeyOf } from "./keys-DD_VE8Fk.mjs";
import { n as SeriesRing, t as DEFAULT_SERIES_RETENTION } from "./series-ring-CaKfvyWQ.mjs";
import { groupBy, mapValues } from "es-toolkit";
//#region src/projections/event-log.ts
/**
* A list of records in apply order, with their converted time. The viewer filters it.
*
* Series records are left out, because they are many and the timeline draws them.
*/
function createEventLogProjection(options) {
	const limit = options?.limit ?? 2e4;
	return {
		key: "event-log",
		reset: () => ({
			entries: [],
			keys: /* @__PURE__ */ new Set(),
			dropped: 0
		}),
		handleRecord(state, record, context) {
			if (record.type === "sample" || record.type === "sample.chunk") return state;
			const key = recordKey(record);
			if (state.keys.has(key)) return state;
			state.keys.add(key);
			state.entries.push({
				key,
				time: context.time,
				record,
				...context.late ? { late: true } : {},
				...context.pinned ? { pinned: true } : {},
				...context.estimated ? { estimated: true } : {}
			});
			if (state.entries.length > limit) {
				const removed = state.entries.splice(0, state.entries.length - limit);
				for (const entry of removed) state.keys.delete(entry.key);
				state.dropped += removed.length;
			}
			return state;
		},
		select: (state) => state
	};
}
//#endregion
//#region src/projections/metrics.ts
function exclusionOf(record) {
	if (record.attrs?.["censored"] === true) return "censored";
	if (record.attrs?.["warmup"] === true) return "warmup";
	if (record.type === "span.end" && record.status !== "ok") return "failed";
}
/**
* Collects the samples of metrics of kind `attribute`.
*
* A metric definition record names a track pattern, a record type, and an attribute. Each matching record with a number
* value adds one sample. A metric of kind `derived` comes from its own projection.
*/
function createAttributeMetricsProjection() {
	return {
		key: "metrics.attribute",
		reset: () => ({
			definitions: /* @__PURE__ */ new Map(),
			samples: {}
		}),
		handleRecord(state, record, context) {
			if (record.type === "definition") {
				if (record.kind === "metric") {
					const definition = record.data;
					if (definition.value.kind === "attribute") state.definitions.set(definition.key, definition);
				}
				return state;
			}
			if (!("track" in record) || !record.attrs) return state;
			for (const definition of state.definitions.values()) {
				const source = definition.value;
				if (source.kind !== "attribute" || source.record !== record.type) continue;
				const params = matchTrackPath(source.track, record.track);
				const value = record.attrs[source.attribute];
				if (!params || typeof value !== "number") continue;
				const dimensions = definition.dimensions ? Object.fromEntries(definition.dimensions.map((key) => [key, String(record.ids?.[key] ?? params[key] ?? "")])) : void 0;
				(state.samples[definition.key] ??= []).push({
					time: context.time,
					value,
					dimensions,
					excluded: exclusionOf(record)
				});
			}
			return state;
		},
		evict(state, range) {
			for (const [key, list] of Object.entries(state.samples)) {
				if (state.definitions.get(key)?.scope === "session") continue;
				state.samples[key] = list.filter((sample) => sample.time > range.to);
			}
			return state;
		},
		select: (state) => state.samples
	};
}
/** Summarizes samples with the aggregates of their definition. The default aggregates are p50 and p95. */
function summarizeMetric(key, samples, definition) {
	const kinds = definition?.aggregate ?? ["p50", "p95"];
	const included = samples.filter((sample) => !sample.excluded);
	const excluded = {
		censored: 0,
		warmup: 0,
		failed: 0
	};
	for (const sample of samples) if (sample.excluded) excluded[sample.excluded]++;
	let byDimension;
	if (definition?.dimensions?.length) {
		const dimensions = definition.dimensions;
		const groups = groupBy(included, (sample) => dimensions.map((dimension) => sample.dimensions?.[dimension] ?? "").join("|"));
		byDimension = mapValues(groups, (group) => aggregate(group.map((sample) => sample.value), kinds));
	}
	return {
		key,
		definition,
		values: aggregate(included.map((sample) => sample.value), kinds),
		count: included.length,
		excluded,
		byDimension
	};
}
//#endregion
//#region src/projections/reader.ts
/**
* Records by source, epoch, and seq.
*
* A map from `source/epoch` to a map from `seq` keeps one number per record. A map with `source/epoch/seq` strings as
* keys keeps one string per record, and costs about five times the memory for the same lookups.
*/
var RecordIndex = class {
	epochs = /* @__PURE__ */ new Map();
	count = 0;
	get size() {
		return this.count;
	}
	get(ref) {
		return this.epochs.get(epochKeyOf(ref.source, ref.epoch))?.get(ref.seq);
	}
	has(ref) {
		return this.epochs.get(epochKeyOf(ref.source, ref.epoch))?.has(ref.seq) ?? false;
	}
	/** Adds a record. A record with the same source, epoch, and seq stays, and the call returns false. */
	add(record) {
		const epochKey = epochKeyOf(record.source, record.epoch);
		let records = this.epochs.get(epochKey);
		if (!records) {
			records = /* @__PURE__ */ new Map();
			this.epochs.set(epochKey, records);
		}
		if (records.has(record.seq)) return false;
		records.set(record.seq, record);
		this.count++;
		return true;
	}
	clear() {
		this.epochs.clear();
		this.count = 0;
	}
};
/** The index key of a link target. */
function linkTargetKey(to) {
	if ("spanId" in to) return `span:${to.spanId}`;
	if ("key" in to) return `id:${to.key}=${to.id}`;
	return recordKey(to);
}
function pushTo(map, key, value) {
	const list = map.get(key);
	if (list) list.push(value);
	else map.set(key, [value]);
}
/**
* Feeds collector messages to projections in apply order.
*
* Apply order is the arrival order of the feed. For one epoch, it is the `seq` order, as the transports deliver it.
* Display order is the converted time, which each projection reads from the context.
*
* The reader keeps its own clock graph from the snapshot records in the feed, so a replay of a file converts times in
* the same way as the live view. `version` changes on each handled message. A view reads through selectors keyed on it.
*/
var TraceReader = class {
	projections;
	clocks;
	indexes = {
		byKey: new RecordIndex(),
		bySpanId: /* @__PURE__ */ new Map(),
		linksTo: /* @__PURE__ */ new Map(),
		byId: /* @__PURE__ */ new Map()
	};
	version = 0;
	caughtUp = false;
	states = /* @__PURE__ */ new Map();
	constructor(projections, traceClock = "mono:collector") {
		this.projections = projections;
		this.clocks = new ClockGraph(traceClock);
		for (const projection of projections) this.states.set(projection.key, projection.reset());
	}
	handle(message) {
		this.version++;
		switch (message.kind) {
			case "record":
				this.apply(message.record, message.pinned ?? false, message.late ?? false);
				break;
			case "series":
				for (const projection of this.projections) if (projection.handleSeries) this.states.set(projection.key, projection.handleSeries(this.stateOf(projection), message));
				break;
			case "gap":
				for (const projection of this.projections) if (projection.evict) this.states.set(projection.key, projection.evict(this.stateOf(projection), {
					from: message.from,
					to: message.to
				}));
				break;
			case "caughtUp": this.caughtUp = true;
		}
	}
	/** Feeds records without a collector, for example the lines of a file or the records of a test. */
	handleRecords(records) {
		for (const record of records) this.handle({
			kind: "record",
			record
		});
		this.handle({
			kind: "caughtUp",
			cursor: {},
			traceClock: this.clocks.traceClock
		});
	}
	/** The view of a projection of this reader. */
	view(projection) {
		if (!this.projections.includes(projection)) throw new Error(`No projection ${projection.key} in this reader`);
		const state = this.states.get(projection.key);
		return projection.select(projection.finalize ? projection.finalize(state) : state);
	}
	/** The state of a projection, typed for the call. Each state was created by the same projection. */
	stateOf(projection) {
		return this.states.get(projection.key);
	}
	reset() {
		this.version++;
		this.caughtUp = false;
		this.indexes.byKey.clear();
		this.indexes.bySpanId.clear();
		this.indexes.linksTo.clear();
		this.indexes.byId.clear();
		this.clocks.clear();
		for (const projection of this.projections) this.states.set(projection.key, projection.reset());
	}
	/** The event time of a record on the trace clock. */
	timeOf(record) {
		const converted = this.clocks.convert(record.clock, record.ts);
		if (converted) return {
			time: converted.value,
			estimated: converted.estimated
		};
		return {
			time: record.observedTs ?? record.ts,
			estimated: true
		};
	}
	apply(record, pinned, late) {
		if (!this.indexes.byKey.add(record)) return;
		if (record.type === "clock.snapshot") this.clocks.addSnapshot(record.values, record.uncertaintyMs, record.attrs?.estimated === true);
		else if (record.type === "clock.discontinuity") this.clocks.addDiscontinuity(record.of);
		else if (record.type === "stream.started" && record.rate) this.clocks.setUnitsPerMs(streamClockOf(record.streamId), record.rate / 1e3);
		if ((record.type === "span.begin" || record.type === "span.complete") && !this.indexes.bySpanId.has(record.spanId)) this.indexes.bySpanId.set(record.spanId, record);
		if ("links" in record) for (const link of record.links ?? []) pushTo(this.indexes.linksTo, linkTargetKey(link.to), record);
		for (const [idKey, value] of Object.entries(record.ids ?? {})) pushTo(this.indexes.byId, `${idKey}=${value}`, record);
		const { time, estimated } = this.timeOf(record);
		const context = {
			pinned,
			late,
			time,
			estimated,
			indexes: this.indexes
		};
		for (const projection of this.projections) this.states.set(projection.key, projection.handleRecord(this.stateOf(projection), record, context));
	}
};
//#endregion
//#region src/projections/timeline.ts
/** The series rings compact at most this often, on the trace clock. The collector ticks about as often. */
const SERIES_COMPACT_INTERVAL_MS = 1e3;
function emptyState(seriesRetention = DEFAULT_SERIES_RETENTION) {
	return {
		tracks: /* @__PURE__ */ new Map(),
		spans: /* @__PURE__ */ new Map(),
		definitions: /* @__PURE__ */ new Map(),
		trackDefinitions: [],
		markers: [],
		gaps: [],
		sources: /* @__PURE__ */ new Map(),
		annotations: [],
		start: Number.POSITIVE_INFINITY,
		end: Number.NEGATIVE_INFINITY,
		counters: {
			records: 0,
			late: 0,
			orphanUpdates: 0,
			reordered: 0
		},
		pendingUpdates: /* @__PURE__ */ new Map(),
		seriesRings: /* @__PURE__ */ new Map(),
		seriesRetention,
		seriesCompactedAt: Number.NEGATIVE_INFINITY
	};
}
/** The ring of one series of a track. A new ring also becomes the series that the track shows. */
function seriesRingOf(state, track, valueKey) {
	const ringKey = `${track.path}\u0000${valueKey}`;
	let ring = state.seriesRings.get(ringKey);
	if (!ring) {
		const retention = state.seriesRetention;
		const created = retention ? new SeriesRing(retention.maxAgeMs, retention.fullRateMs) : new SeriesRing(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
		state.seriesRings.set(ringKey, created);
		track.series[valueKey] = seriesView(created);
		ring = created;
	}
	return ring;
}
function seriesView(ring) {
	return {
		get times() {
			return ring.timesView();
		},
		get values() {
			return ring.valuesView();
		},
		get revision() {
			return ring.revision;
		}
	};
}
/** Compacts every series ring at the newest time of the trace, about once a second of trace time. */
function compactSeries(state) {
	if (!state.seriesRetention || state.end - state.seriesCompactedAt < SERIES_COMPACT_INTERVAL_MS) return;
	state.seriesCompactedAt = state.end;
	for (const ring of state.seriesRings.values()) ring.compact(state.end);
}
function trackOf(state, path) {
	let track = state.tracks.get(path);
	if (!track) {
		let definition;
		let params = {};
		for (const candidate of state.trackDefinitions) {
			const match = matchTrackPath(candidate.path, path);
			if (match) {
				definition = candidate;
				params = match;
				break;
			}
		}
		track = {
			path,
			definition,
			params,
			spans: [],
			instants: [],
			states: [],
			series: {},
			lanes: [],
			hasError: false
		};
		state.tracks.set(path, track);
	}
	return track;
}
/** A new or changed track definition matches existing tracks again. */
function rematchTracks(state) {
	for (const track of state.tracks.values()) {
		track.definition = void 0;
		track.params = {};
		for (const candidate of state.trackDefinitions) {
			const match = matchTrackPath(candidate.path, track.path);
			if (match) {
				track.definition = candidate;
				track.params = match;
				break;
			}
		}
	}
}
/**
* Moves an effect after its cause in the view when clock conversion put it earlier.
* Only `caused-by` links to a known record or span count.
*/
function repairCausality(time, links, state, context) {
	let repaired = time;
	for (const link of links ?? []) {
		if (link.rel !== "caused-by") continue;
		let causeTime;
		if ("spanId" in link.to) {
			const begin = context.indexes.bySpanId.get(link.to.spanId);
			causeTime = begin ? state.spans.get(spanKeyOf(begin.source, begin.epoch, link.to.spanId))?.start : void 0;
		} else if ("seq" in link.to) {
			const cause = context.indexes.byKey.get(link.to);
			if (cause) causeTime = findRecordTime(state, cause);
		}
		if (causeTime !== void 0 && causeTime > repaired) repaired = causeTime;
	}
	return {
		time: repaired,
		reordered: repaired !== time
	};
}
function findRecordTime(state, record) {
	const key = recordKey(record);
	if ("spanId" in record && record.spanId && (record.type === "span.begin" || record.type === "span.complete")) return state.spans.get(spanKeyOf(record.source, record.epoch, record.spanId))?.start;
	if (!("track" in record)) return void 0;
	const track = state.tracks.get(record.track);
	return track?.instants.find((instant) => instant.key === key)?.time ?? track?.states.find((change) => change.key === key)?.time;
}
/** Assigns the sub-lane of a new span: the first lane at its depth that is free at its start. */
function assignLane(track, depth, start) {
	const busyUntil = track.lanes[depth] ??= [];
	let lane = busyUntil.findIndex((end) => end <= start);
	if (lane === -1) lane = busyUntil.length;
	busyUntil[lane] = Number.POSITIVE_INFINITY;
	return lane;
}
/** Frees the lane of a span that ended or was abandoned. */
function releaseLane(state, span, end) {
	const busyUntil = state.tracks.get(span.track)?.lanes[span.depth];
	if (busyUntil && busyUntil[span.lane] === Number.POSITIVE_INFINITY) busyUntil[span.lane] = end;
}
function abandonEpoch(state, source, epoch) {
	for (const span of state.spans.values()) if (span.source === source && span.epoch === epoch && span.end === void 0 && !span.abandoned) {
		span.abandoned = true;
		releaseLane(state, span, state.end);
	}
}
function extend(state, time) {
	if (time < state.start) state.start = time;
	if (time > state.end) state.end = time;
}
/**
* The empty list and the empty attributes that spans share. Most spans have no instants, annotations, or links, so
* one frozen value saves an array or an object on each span. The helpers below never change them in place.
*/
const NO_ITEMS = Object.freeze([]);
const NO_ATTRS = Object.freeze({});
/** A list with the items added. It copies the list, so a shared or published list never changes. */
function appendTo(list, items) {
	if (!items || items.length === 0) return list;
	return list.length === 0 ? [...items] : [...list, ...items];
}
/**
* Attributes with an update merged in. Without an update the attributes stay, and attributes without a merge are the
* record's own object. Records do not change, so the span can share it.
*/
function mergeAttrs(attrs, update) {
	if (!update) return attrs;
	return attrs === NO_ATTRS ? update : {
		...attrs,
		...update
	};
}
function annotate(span, annotation) {
	if (span) span.annotations = appendTo(span.annotations, [annotation]);
}
function beginSpan(state, record, context) {
	const key = spanKeyOf(record.source, record.epoch, record.spanId);
	const existing = state.spans.get(key);
	if (existing) {
		existing.attrs = mergeAttrs(existing.attrs, record.attrs);
		if (existing.startMissing) {
			existing.start = context.time;
			existing.startMissing = false;
		}
		return existing;
	}
	const track = trackOf(state, record.track);
	const parentKey = record.parentSpanId ? spanKeyOf(record.source, record.epoch, record.parentSpanId) : void 0;
	const parent = parentKey ? state.spans.get(parentKey) : void 0;
	const depth = parent && parent.track === record.track ? parent.depth + 1 : 0;
	const { time, reordered } = repairCausality(context.time, record.links, state, context);
	const pending = state.pendingUpdates.get(key)?.attrs;
	state.pendingUpdates.delete(key);
	const span = {
		key,
		spanId: record.spanId,
		source: record.source,
		epoch: record.epoch,
		track: record.track,
		name: record.name,
		parentKey,
		depth,
		lane: assignLane(track, depth, time),
		ids: record.ids,
		attrs: mergeAttrs(record.attrs ?? NO_ATTRS, pending),
		links: record.links ?? NO_ITEMS,
		start: time,
		deadlineMs: record.type === "span.begin" ? record.deadlineMs : void 0,
		estimated: context.estimated || void 0,
		reordered: reordered || void 0,
		late: context.late || void 0,
		instants: NO_ITEMS,
		annotations: NO_ITEMS
	};
	if (reordered) state.counters.reordered++;
	state.spans.set(key, span);
	track.spans.push(span);
	extend(state, time);
	return span;
}
/** How long an update without its begin waits, and how far a watermark trails its source. */
const ALLOWED_LATENESS_MS = 5e3;
/** Drops the updates that waited for their begin longer than the allowed lateness. */
function expirePendingUpdates(state, time) {
	for (const [key, pending] of state.pendingUpdates) if (pending.time < time - ALLOWED_LATENESS_MS) state.pendingUpdates.delete(key);
}
/**
* Marks the state tracks of a source unknown, because the source that owns them stopped or was lost.
* A `single` track belongs to its first writer. On an `any` track, the source of the latest state owns the current value,
* so the stop of an earlier writer leaves a newer value of another source.
*/
function markOwnedStatesUnknown(state, source, key, time) {
	for (const track of state.tracks.values()) {
		const latest = track.states.at(-1);
		if ((track.definition?.stateOwner === "any" ? latest?.source : track.stateOwner) === source && latest?.value !== "unknown") track.states.push({
			key,
			track: track.path,
			time,
			value: "unknown",
			source
		});
	}
}
function handleRecord(state, record, context) {
	state.counters.records++;
	if (context.late) state.counters.late++;
	if (state.pendingUpdates.size > 0) expirePendingUpdates(state, context.time);
	const source = state.sources.get(record.source);
	if (source && source.epoch === record.epoch) source.newestTime = Math.max(source.newestTime, context.time);
	switch (record.type) {
		case "source.started": {
			const previous = state.sources.get(record.source);
			if (previous && previous.epoch !== record.epoch) abandonEpoch(state, previous.source, previous.epoch);
			state.sources.set(record.source, {
				source: record.source,
				epoch: record.epoch,
				runtime: record.runtime,
				live: true,
				newestTime: context.time
			});
			break;
		}
		case "source.stopped": {
			abandonEpoch(state, record.source, record.epoch);
			const current = state.sources.get(record.source);
			if (current?.epoch === record.epoch) current.live = false;
			markOwnedStatesUnknown(state, record.source, recordKey(record), context.time);
			break;
		}
		case "source.lost": {
			abandonEpoch(state, record.of.source, record.of.epoch);
			const current = state.sources.get(record.of.source);
			if (current?.epoch === record.of.epoch) current.live = false;
			state.markers.push({
				kind: "source-lost",
				time: context.time,
				label: `${record.of.source}: ${record.reason}`
			});
			markOwnedStatesUnknown(state, record.of.source, recordKey(record), context.time);
			break;
		}
		case "clock.discontinuity":
			state.markers.push({
				kind: "clock-discontinuity",
				time: context.time,
				label: `${record.of}: ${record.reason}`
			});
			break;
		case "clock.snapshot":
			for (const marker of state.markers) if (marker.kind === "clock-discontinuity" && marker.until === void 0 && record.values.some((value) => marker.label.startsWith(`${value.clock}:`))) marker.until = context.time;
			break;
		case "definition":
			state.definitions.set(`${record.kind}/${record.key}`, record.data);
			if (record.kind === "track") {
				const definition = record.data;
				state.trackDefinitions = [...state.trackDefinitions.filter((candidate) => candidate.path !== definition.path), definition];
				rematchTracks(state);
			}
			break;
		case "span.begin":
		case "span.complete": {
			const span = beginSpan(state, record, context);
			if (record.type === "span.complete") {
				span.end = span.start + record.durationMs;
				releaseLane(state, span, span.end);
				span.status = record.status;
				span.reason = record.reason;
				extend(state, span.end);
				if (record.status === "error") trackOf(state, record.track).hasError = true;
			}
			break;
		}
		case "span.update": {
			const key = spanKeyOf(record.source, record.epoch, record.spanId);
			const span = state.spans.get(key);
			if (span) {
				span.attrs = mergeAttrs(span.attrs, record.attrs);
				span.links = appendTo(span.links, record.links);
			} else {
				state.counters.orphanUpdates++;
				state.pendingUpdates.set(key, {
					attrs: {
						...state.pendingUpdates.get(key)?.attrs,
						...record.attrs
					},
					time: context.time
				});
			}
			break;
		}
		case "span.end": {
			const key = spanKeyOf(record.source, record.epoch, record.spanId);
			let span = state.spans.get(key);
			if (!span) {
				const name = typeof record.attrs?.name === "string" ? record.attrs.name : record.spanId;
				span = beginSpan(state, {
					...record,
					type: "span.begin",
					name
				}, {
					...context,
					time: Number.isFinite(state.start) ? state.start : context.time
				});
				span.startMissing = true;
			}
			if (span.end !== void 0) break;
			span.end = Math.max(context.time, span.start);
			span.status = record.status;
			span.reason = record.reason;
			span.message = record.message;
			span.abandoned = void 0;
			releaseLane(state, span, span.end);
			span.attrs = mergeAttrs(span.attrs, record.attrs);
			span.links = appendTo(span.links, record.links);
			if (record.status === "error") trackOf(state, record.track).hasError = true;
			extend(state, span.end);
			break;
		}
		case "instant":
		case "log": {
			const track = trackOf(state, record.track);
			const { time, reordered } = repairCausality(context.time, record.links, state, context);
			const instant = {
				key: recordKey(record),
				name: record.type === "log" ? record.message : record.name,
				track: record.track,
				time,
				ids: record.ids,
				attrs: record.attrs,
				links: record.links,
				reordered: reordered || void 0,
				estimated: context.estimated || void 0,
				late: context.late || void 0,
				level: record.type === "log" ? record.level : void 0
			};
			if (reordered) state.counters.reordered++;
			if (record.type === "instant" && record.spanId) {
				instant.spanKey = spanKeyOf(record.source, record.epoch, record.spanId);
				const span = state.spans.get(instant.spanKey);
				if (span) span.instants = appendTo(span.instants, [instant]);
			}
			if (!track.instants.some((existing) => existing.key === instant.key)) track.instants.push(instant);
			extend(state, time);
			break;
		}
		case "state": {
			const track = trackOf(state, record.track);
			const owner = track.definition?.stateOwner ?? "single";
			track.stateOwner ??= record.source;
			const { time, reordered } = repairCausality(context.time, record.links, state, context);
			const change = {
				key: recordKey(record),
				track: record.track,
				time,
				value: record.value,
				from: record.from,
				rule: typeof record.attrs?.rule === "string" ? record.attrs.rule : void 0,
				links: record.links,
				source: record.source,
				foreignOwner: owner === "single" && track.stateOwner !== record.source ? true : void 0
			};
			if (reordered) state.counters.reordered++;
			let index = track.states.length;
			while (index > 0 && track.states[index - 1].time > time) index--;
			if (!track.states.some((existing) => existing.key === change.key)) track.states.splice(index, 0, change);
			extend(state, time);
			break;
		}
		case "sample":
		case "sample.chunk": {
			const track = trackOf(state, record.track);
			const entries = record.type === "sample" ? Object.entries(record.values).map(([key, value]) => [key, [value]]) : Object.entries(record.values);
			for (const [valueKey, values] of entries) {
				const ring = seriesRingOf(state, track, valueKey);
				for (const [index, value] of values.entries()) {
					const offset = record.type === "sample.chunk" ? record.offsetsMs?.[index] ?? index * (record.intervalMs ?? 0) : 0;
					ring.append(context.time + offset, value);
				}
			}
			extend(state, context.time);
			compactSeries(state);
			break;
		}
		case "annotation": if (record.target.spanId) {
			const begin = context.indexes.bySpanId.get(record.target.spanId);
			if (begin) annotate(state.spans.get(spanKeyOf(begin.source, begin.epoch, record.target.spanId)), record);
		} else if (record.target.ref) {
			const target = context.indexes.byKey.get(record.target.ref);
			if (target && "spanId" in target && target.spanId) annotate(state.spans.get(spanKeyOf(target.source, target.epoch, target.spanId)), record);
		} else state.annotations.push(record);
	}
	return state;
}
/**
* The timeline: tracks with spans, instants, state changes, and series, plus global markers and gaps.
*
* Display times are converted times. A span keeps the sub-lane that it got at begin, so lanes do not jump while the
* view is live. Each series is a {@link SeriesRing} with the retention of the collector, so a live view of a long
* session stays bounded. A file replay passes `seriesRetention: false`.
*/
function createTimelineProjection(options = {}) {
	return {
		key: "timeline",
		reset: () => emptyState(options.seriesRetention),
		handleRecord,
		handleSeries: (state, series) => {
			const ring = seriesRingOf(state, trackOf(state, series.track), series.key);
			for (const [index, time] of series.times.entries()) ring.append(time, series.values[index]);
			if (series.times.length > 0) extend(state, series.times.at(-1));
			compactSeries(state);
			return state;
		},
		evict: (state, range) => {
			state.gaps.push(range);
			return state;
		},
		select: (state) => state
	};
}
/**
* The start of the provisional region: the earliest watermark of the live sources.
* A watermark trails the newest record of its source by the allowed lateness.
*/
function provisionalFrom(state, allowedLatenessMs = ALLOWED_LATENESS_MS) {
	let earliest;
	for (const source of state.sources.values()) {
		if (!source.live || source.source === "collector") continue;
		const watermark = source.newestTime - allowedLatenessMs;
		earliest = earliest === void 0 ? watermark : Math.min(earliest, watermark);
	}
	return earliest;
}
/** Records that link to a span, and the targets that the span links to. */
function linksOfSpan(span, indexes) {
	return {
		incoming: indexes.linksTo.get(linkTargetKey({ spanId: span.spanId })) ?? [],
		outgoing: span.links
	};
}
//#endregion
export { TraceReader as a, summarizeMetric as c, RecordIndex as i, createEventLogProjection as l, linksOfSpan as n, linkTargetKey as o, provisionalFrom as r, createAttributeMetricsProjection as s, createTimelineProjection as t };
