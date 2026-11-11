import { A as applyContentPolicy, j as conventionAttributes } from "../conventions-DLiC8rkL.mjs";
import { t as ClockGraph } from "../clock-hjTPEs21.mjs";
import { i as streamClockOf, r as spanKeyOf, t as epochKeyOf } from "../keys-DD_VE8Fk.mjs";
import { f as isTrackedRecord, l as traceRecordSchema, n as TraceSource } from "../sink-BoftsA-W.mjs";
import { n as SeriesRing, t as DEFAULT_SERIES_RETENTION } from "../series-ring-CaKfvyWQ.mjs";
import { safeParse } from "valibot";
import { DemandUnion, RetentionBuffer, SequenceTracker, Watermark, createCatchUpFeed, createCooldown, createLeaseTable } from "@proj-airi/stream-kit";
//#region src/collector/collector.ts
const DEFAULTS = {
	clock: "mono:collector",
	maxAgeMs: DEFAULT_SERIES_RETENTION.maxAgeMs,
	maxBytes: 16777216,
	seriesFullRateMs: DEFAULT_SERIES_RETENTION.fullRateMs,
	allowedLatenessMs: 5e3,
	heartbeatTimeoutMs: 6e4,
	flightWindowMs: 6e4,
	flightCooldownMs: 6e4,
	flightMaxBytes: 2097152
};
/** Counts the JSON bytes of a buffered record. UTF-16 length undercounts CJK text up to three times. */
const utf8 = new TextEncoder();
/** The newest snapshots of each clock set in the pinned set. The drift fit uses this many. */
const PINNED_SNAPSHOTS_PER_CLOCK_SET = 16;
/**
* The most gaps that the collector keeps for late viewers. The buffer drops records oldest first, so the oldest gaps
* lie before every kept record, and merging them loses no kept record.
*/
const MAX_GAPS = 64;
/**
* Receives the records of every source in one place, keeps recent records, and feeds viewers.
*
* State model:
* - Epochs: one {@link EpochState} for each `source/epoch`. A record with a seen seq is dropped.
* - Heartbeats: one lease for each `source/epoch`. Each new record and each `touch` renews it. A live epoch whose
*   lease expires is lost.
* - Event buffer: every record except series, limited by age and bytes. Eviction records a gap.
* - Series rings: one {@link SeriesRing} for each `track` and value key of `sample` and `sample.chunk` records.
* - Pinned set: the latest `source.started` of each live epoch, live streams, recent clock snapshots and the
*   discontinuities between them, open spans with merged updates, the latest state of each state track, and the latest
*   definition of each kind and key. It stays outside the limits, so a late viewer and a dump can describe themselves.
* - Clock records: a reader picks the clock segment of a value from the snapshots and discontinuities that it applied
*   before. So a backlog or a dump sends a pinned clock record only when it does not also send its buffered copy, and
*   the clock history keeps its arrival order.
* - The collector is a source too. It writes `source.lost` with its own identity.
*
* The host calls {@link TraceCollector.tick} about once a second. It compacts series, evicts old records, checks
* heartbeats, and checks span deadlines. The collector reads no clock except `now`.
*/
var TraceCollector = class {
	traceClock;
	clocks;
	options;
	self;
	epochs = /* @__PURE__ */ new Map();
	/** The live epoch of each source. */
	liveEpochBySource = /* @__PURE__ */ new Map();
	heartbeats;
	buffer;
	/** The groups that the buffer dropped in the current push or eviction. They become one gap. */
	evicted = [];
	gaps = [];
	seriesRings = /* @__PURE__ */ new Map();
	pinnedStarts = /* @__PURE__ */ new Map();
	pinnedStreams = /* @__PURE__ */ new Map();
	pinnedSnapshots = /* @__PURE__ */ new Map();
	pinnedDiscontinuities = [];
	arrivals = 0;
	pinnedSpans = /* @__PURE__ */ new Map();
	pinnedStates = /* @__PURE__ */ new Map();
	pinnedDefinitions = /* @__PURE__ */ new Map();
	attributeSensitivity = /* @__PURE__ */ new Map();
	feed;
	/** The tracks of each viewer, by subscription ID. */
	demand;
	nextSubscriptionId = 0;
	/** The open spans that already triggered an overdue dump. A key goes when its span ends or its epoch ends. */
	dumpedSpans = /* @__PURE__ */ new Set();
	/** The flight recorder cooldown of each source. */
	dumpCooldown;
	lastDumpEnd = Number.NEGATIVE_INFINITY;
	lateCount = 0;
	droppedCount = 0;
	/** Off: the collector forwards records to viewers but keeps only the pinned set and the flight window. */
	buffering = true;
	/**
	* The records of the last flight window while buffering is off, for the flight recorder only. Viewers never read it,
	* so a view that opens while buffering is off still has no history.
	*/
	flightWindow;
	constructor(options) {
		this.options = options;
		this.traceClock = options.clock ?? DEFAULTS.clock;
		this.clocks = new ClockGraph(this.traceClock);
		for (const attribute of conventionAttributes) this.attributeSensitivity.set(attribute.key, attribute.sensitivity);
		this.heartbeats = createLeaseTable({ ttlMs: options.heartbeatTimeoutMs ?? DEFAULTS.heartbeatTimeoutMs });
		this.buffer = new RetentionBuffer({
			maxBytes: options.maxBytes ?? DEFAULTS.maxBytes,
			maxAgeMs: options.maxAgeMs ?? DEFAULTS.maxAgeMs,
			sizeOf: (entry) => entry.bytes,
			ageOf: (entry) => entry.observedAt,
			onEvict: (entries) => {
				this.evicted.push(entries);
				this.keepLinksOfEvictedUpdates(entries);
			}
		});
		this.feed = createCatchUpFeed({
			backlog: () => this.backlog(),
			caughtUp: () => ({
				kind: "caughtUp",
				cursor: this.cursor(),
				traceClock: this.traceClock,
				now: this.options.now()
			})
		});
		this.demand = new DemandUnion({ onChange: (union) => this.options.onWantedChange?.(union) });
		this.dumpCooldown = createCooldown({ ms: options.flightRecorder?.cooldownMs ?? DEFAULTS.flightCooldownMs });
		if (options.flightRecorder) this.flightWindow = new RetentionBuffer({
			maxBytes: options.flightRecorder.maxBytes ?? DEFAULTS.flightMaxBytes,
			maxAgeMs: options.flightRecorder.windowMs ?? DEFAULTS.flightWindowMs,
			sizeOf: (entry) => entry.bytes,
			ageOf: (entry) => entry.observedAt
		});
		this.self = new TraceSource({
			source: "collector",
			clock: this.traceClock,
			runtime: "collector",
			now: options.now,
			createEpoch: options.createEpoch,
			send: (record) => this.accept(record)
		});
	}
	get stats() {
		return {
			bufferedRecords: this.buffer.size,
			bufferedBytes: this.buffer.bytes,
			openSpans: this.pinnedSpans.size,
			seriesTracks: this.seriesRings.size,
			late: this.lateCount,
			dropped: this.droppedCount,
			maxAgeMs: this.options.maxAgeMs ?? DEFAULTS.maxAgeMs,
			maxBytes: this.options.maxBytes ?? DEFAULTS.maxBytes
		};
	}
	/**
	* Validates a record from a trust boundary, such as IPC from a window, then ingests it.
	* Returns false and counts the record as dropped when it is not a valid record.
	*/
	ingestUntrusted(value) {
		const result = safeParse(traceRecordSchema, value);
		if (!result.success) {
			this.droppedCount++;
			return false;
		}
		this.ingest(result.output);
		return true;
	}
	/**
	* Turns the event buffer and the series rings on or off. Off drops what they hold. Viewers still get live records,
	* and the pinned set stays, so a viewer that opens later still knows the live sources and open spans. With a flight
	* recorder, off keeps the last flight window of events for dumps only.
	*/
	setBuffering(enabled) {
		this.buffering = enabled;
		this.flightWindow?.clear();
		if (enabled) return;
		this.buffer.clear();
		this.gaps = [];
		this.seriesRings.clear();
	}
	/** Writes a record of the collector itself, for example a discontinuity of its clock after a system resume. */
	record(input) {
		this.self.emit(input);
	}
	/** Ingests a record of a trusted producer in the same process. */
	ingest(record) {
		this.accept(record);
	}
	/** Records that a source is alive without a record, for example on a clock ping. */
	touch(source) {
		const epoch = this.liveEpochBySource.get(source);
		if (epoch && this.epochs.has(epochKeyOf(source, epoch))) this.heartbeats.touch(epochKeyOf(source, epoch), this.options.now());
	}
	/** The transport of a source closed. Its live epoch is lost unless it stopped first. */
	closeSource(source) {
		this.loseSource(source, "ipc-closed");
	}
	/**
	* Adds a viewer. It receives the pinned set, the gaps, the buffer, the series, `caughtUp`, and then each later
	* record, in that order. Nothing arrives between the backlog and the first live record, because one call does both.
	*/
	subscribe(listener, tracks = "*") {
		const id = String(this.nextSubscriptionId++);
		let wanted = tracks === "*" ? "*" : new Set(tracks);
		const { unsubscribe } = this.feed.subscribe((message) => {
			if (message.kind === "record" && !wantsRecord(wanted, message.record)) return;
			if (message.kind === "series" && wanted !== "*" && !wanted.has(message.track)) return;
			listener(message);
		});
		this.demand.set(id, wanted);
		return {
			unsubscribe: () => {
				unsubscribe();
				this.demand.delete(id);
			},
			setTracks: (next) => {
				wanted = next === "*" ? "*" : new Set(next);
				this.demand.set(id, wanted);
			}
		};
	}
	/**
	* Runs the periodic work: series compaction, buffer eviction, heartbeat checks, and span deadline checks.
	* The host calls it about once a second.
	*/
	tick() {
		const now = this.options.now();
		for (const { ring } of this.seriesRings.values()) ring.compact(now);
		this.buffer.evict(now);
		this.flightWindow?.evict(now);
		this.reportGap();
		const expired = new Set(this.heartbeats.expired(now));
		for (const [source, epoch] of this.liveEpochBySource) if (source !== this.self.source && expired.has(epochKeyOf(source, epoch))) this.loseSource(source, "heartbeat-timeout");
		for (const [key, { begin }] of this.pinnedSpans) {
			if (begin.deadlineMs === void 0) continue;
			const start = this.timeOf(begin);
			if (start !== void 0 && now - start > begin.deadlineMs) this.triggerDump(key, begin.source, "overdue", now);
		}
	}
	/**
	* The current state for a manual save: the pinned set and the buffer as records, and the series rings in the shape
	* of the backlog. Samples go to the rings, not to the buffer, so the records alone do not hold them. A reader
	* replays the save with `handleRecords(records)` and then `handle(message)` for each series message.
	*/
	snapshot() {
		const entries = [...this.buffer.values()];
		return {
			records: [...this.pinnedRecords(entries[0]?.order), ...entries.map((entry) => entry.record)],
			series: [...this.seriesMessages()]
		};
	}
	/** The sensitivity of an attribute key, from the conventions and the announced definitions. */
	sensitivityOf = (key) => this.attributeSensitivity.get(key);
	accept(incoming) {
		const now = this.options.now();
		const epochKey = epochKeyOf(incoming.source, incoming.epoch);
		let state = this.epochs.get(epochKey);
		if (incoming.type === "source.started" && !state) {
			const previous = this.liveEpochBySource.get(incoming.source);
			if (previous && previous !== incoming.epoch) this.loseSource(incoming.source, "epoch-replaced");
			state = this.createEpoch(incoming, now);
			this.liveEpochBySource.set(incoming.source, incoming.epoch);
		}
		if (!state) {
			state = this.createEpoch(incoming, now);
			if (!this.liveEpochBySource.has(incoming.source)) this.liveEpochBySource.set(incoming.source, incoming.epoch);
		}
		if (!state.seqs.accept(incoming.seq)) return;
		this.heartbeats.touch(epochKey, now);
		const record = applyContentPolicy({
			...incoming,
			observedTs: now
		}, {
			keepContent: true,
			sensitivityOf: this.sensitivityOf
		});
		this.updateClocks(record);
		this.updateDefinitions(record);
		const time = this.timeOf(record) ?? now;
		const { late } = state.watermark.observe(time);
		if (late) this.lateCount++;
		const order = this.arrivals++;
		this.updatePinned(record, time, order);
		if (record.type === "source.stopped") {
			state.live = false;
			if (this.liveEpochBySource.get(record.source) === record.epoch) this.liveEpochBySource.delete(record.source);
			this.heartbeats.delete(epochKey);
			this.unpinEpoch(record.source, record.epoch);
		}
		const isSample = record.type === "sample" || record.type === "sample.chunk";
		if (!this.buffering) {
			if (!isSample && this.flightWindow) {
				this.flightWindow.push({
					record,
					order,
					time,
					observedAt: now,
					bytes: utf8.encode(JSON.stringify(record)).byteLength
				});
				this.flightWindow.evict(now);
			}
		} else if (isSample) this.appendSeries(record, time);
		else {
			const bytes = utf8.encode(JSON.stringify(record)).byteLength;
			const overLimit = this.buffer.bytes + bytes > (this.options.maxBytes ?? DEFAULTS.maxBytes);
			this.buffer.push({
				record,
				order,
				time,
				observedAt: now,
				bytes
			});
			if (overLimit) this.buffer.evict(now);
			this.reportGap();
		}
		this.feed.publish({
			kind: "record",
			record,
			...late ? { late } : {}
		});
		if (record.type === "span.end" && record.status === "error") this.triggerDump(spanKeyOf(record.source, record.epoch, record.spanId), record.source, "error", now);
	}
	createEpoch(record, now) {
		const state = {
			source: record.source,
			epoch: record.epoch,
			seqs: new SequenceTracker(),
			live: true,
			watermark: new Watermark({ allowedLatenessMs: this.options.allowedLatenessMs ?? DEFAULTS.allowedLatenessMs })
		};
		const epochKey = epochKeyOf(record.source, record.epoch);
		this.epochs.set(epochKey, state);
		this.heartbeats.touch(epochKey, now);
		return state;
	}
	/** The last seq of each `source/epoch`. */
	cursor() {
		const cursor = {};
		for (const [key, state] of this.epochs) cursor[key] = state.seqs.nextSeq - 1;
		return cursor;
	}
	/** The backlog of a new viewer: the pinned set, the gaps, the buffer, and the series. */
	*backlog() {
		for (const record of this.pinnedRecords(this.buffer.values().next().value?.order)) yield {
			kind: "record",
			record,
			pinned: true
		};
		for (const gap of this.gaps) yield {
			kind: "gap",
			...gap
		};
		for (const entry of this.buffer.values()) yield {
			kind: "record",
			record: entry.record
		};
		yield* this.seriesMessages();
	}
	/** One message for each series ring that has points. */
	*seriesMessages() {
		for (const { source, track, key, ring } of this.seriesRings.values()) {
			const { times, values } = ring.read();
			if (times.length > 0) yield {
				kind: "series",
				source,
				track,
				key,
				times,
				values
			};
		}
	}
	/** Converts the event time of a record to the trace clock. */
	timeOf(record) {
		return this.clocks.convert(record.clock, record.ts)?.value;
	}
	updateClocks(record) {
		if (record.type === "clock.snapshot") this.clocks.addSnapshot(record.values, record.uncertaintyMs, record.attrs?.estimated === true);
		else if (record.type === "clock.discontinuity") this.clocks.addDiscontinuity(record.of);
		else if (record.type === "stream.started" && record.rate) this.clocks.setUnitsPerMs(streamClockOf(record.streamId), record.rate / 1e3);
	}
	updateDefinitions(record) {
		if (record.type !== "definition") return;
		this.pinnedDefinitions.set(`${record.kind}/${record.key}`, record);
		if (record.kind === "attribute") {
			const data = record.data;
			if (data?.sensitivity) this.attributeSensitivity.set(record.key, data.sensitivity);
		}
	}
	updatePinned(record, time, order) {
		const spanKey = "spanId" in record && record.spanId ? spanKeyOf(record.source, record.epoch, record.spanId) : void 0;
		switch (record.type) {
			case "source.started":
				this.pinnedStarts.set(epochKeyOf(record.source, record.epoch), record);
				break;
			case "stream.started":
				this.pinnedStreams.set(record.streamId, record);
				break;
			case "stream.stopped":
				this.pinnedStreams.delete(record.streamId);
				break;
			case "clock.snapshot": {
				const key = record.values.map((value) => value.clock).sort().join("|");
				const list = this.pinnedSnapshots.get(key) ?? [];
				list.push({
					record,
					order
				});
				if (list.length > PINNED_SNAPSHOTS_PER_CLOCK_SET) {
					list.shift();
					this.prunePinnedDiscontinuities();
				}
				this.pinnedSnapshots.set(key, list);
				break;
			}
			case "clock.discontinuity":
				this.pinnedDiscontinuities.push({
					record,
					order
				});
				this.prunePinnedDiscontinuities();
				break;
			case "span.begin":
				this.pinnedSpans.set(spanKey, {
					begin: record,
					updated: record
				});
				break;
			case "span.update": {
				const open = this.pinnedSpans.get(spanKey);
				if (open) open.updated = {
					...open.updated,
					attrs: {
						...open.updated.attrs,
						...record.attrs
					}
				};
				break;
			}
			case "span.end":
				this.pinnedSpans.delete(spanKey);
				this.dumpedSpans.delete(spanKey);
				break;
			case "state": {
				const current = this.pinnedStates.get(record.track);
				if (!current || current.time <= time) this.pinnedStates.set(record.track, {
					record,
					time
				});
				break;
			}
		}
	}
	/**
	* Moves the links of evicted updates into the pinned copy of their open span. The pinned copy merges the attributes
	* of each update on arrival. Links append, so they move only when the update leaves the buffer, and a late viewer
	* does not get a link twice.
	*/
	keepLinksOfEvictedUpdates(entries) {
		for (const { record } of entries) {
			if (record.type !== "span.update" || !record.links?.length) continue;
			const open = this.pinnedSpans.get(spanKeyOf(record.source, record.epoch, record.spanId));
			if (open) open.updated = {
				...open.updated,
				links: [...open.updated.links ?? [], ...record.links]
			};
		}
	}
	/** A discontinuity matters only after a pinned snapshot of its clock. A reader has no earlier segment otherwise. */
	prunePinnedDiscontinuities() {
		this.pinnedDiscontinuities = this.pinnedDiscontinuities.filter(({ record, order }) => {
			for (const list of this.pinnedSnapshots.values()) if (list[0] && list[0].order < order && list[0].record.values.some((value) => value.clock === record.of)) return true;
			return false;
		});
	}
	unpinEpoch(source, epoch) {
		this.pinnedStarts.delete(epochKeyOf(source, epoch));
		for (const [key, { begin }] of this.pinnedSpans) if (begin.source === source && begin.epoch === epoch) {
			this.pinnedSpans.delete(key);
			this.dumpedSpans.delete(key);
		}
		for (const [track, { record }] of this.pinnedStates) if (record.source === source && record.epoch === epoch) this.pinnedStates.delete(track);
		for (const [streamId, record] of this.pinnedStreams) if (record.source === source && record.epoch === epoch) this.pinnedStreams.delete(streamId);
	}
	loseSource(source, reason) {
		const epoch = this.liveEpochBySource.get(source);
		if (!epoch || source === this.self.source) return;
		const state = this.epochs.get(epochKeyOf(source, epoch));
		this.liveEpochBySource.delete(source);
		if (state) state.live = false;
		this.heartbeats.delete(epochKeyOf(source, epoch));
		this.unpinEpoch(source, epoch);
		this.self.emit({
			type: "source.lost",
			ts: this.options.now(),
			of: {
				source,
				epoch,
				lastSeq: (state?.seqs.nextSeq ?? 0) - 1
			},
			reason
		});
	}
	appendSeries(record, time) {
		const maxAgeMs = this.options.maxAgeMs ?? DEFAULTS.maxAgeMs;
		const fullRateMs = this.options.seriesFullRateMs ?? DEFAULTS.seriesFullRateMs;
		const ringOf = (key) => {
			const ringKey = `${record.source}/${record.track}/${key}`;
			let entry = this.seriesRings.get(ringKey);
			if (!entry) {
				entry = {
					source: record.source,
					track: record.track,
					key,
					ring: new SeriesRing(maxAgeMs, fullRateMs)
				};
				this.seriesRings.set(ringKey, entry);
			}
			return entry.ring;
		};
		if (record.type === "sample") {
			for (const [key, value] of Object.entries(record.values)) ringOf(key).append(time, value);
			return;
		}
		for (const [key, values] of Object.entries(record.values)) {
			const ring = ringOf(key);
			for (const [index, value] of values.entries()) {
				const offset = record.offsetsMs?.[index] ?? index * (record.intervalMs ?? 0);
				ring.append(time + offset, value);
			}
		}
	}
	/** Turns the records that the buffer dropped since the last call into one gap, and tells the viewers. */
	reportGap() {
		if (this.evicted.length === 0) return;
		let from = Number.POSITIVE_INFINITY;
		let to = Number.NEGATIVE_INFINITY;
		for (const group of this.evicted) for (const entry of group) {
			from = Math.min(from, entry.time);
			to = Math.max(to, entry.time);
		}
		this.evicted = [];
		const last = this.gaps.at(-1);
		if (last && from <= last.to) last.to = Math.max(last.to, to);
		else this.gaps.push({
			from,
			to
		});
		if (this.gaps.length > MAX_GAPS) {
			const [oldest, next] = this.gaps.splice(0, 2);
			this.gaps.unshift({
				from: Math.min(oldest.from, next.from),
				to: Math.max(oldest.to, next.to)
			});
		}
		this.feed.publish({
			kind: "gap",
			from,
			to
		});
	}
	/**
	* Starts a flight recorder dump. Limits: an open span triggers one overdue dump, each source has a cooldown, and a
	* window that overlaps the previous dump appends to it. An error comes from the one end of a span, so it needs no
	* guard, and the guard does not keep the key of an ended span.
	*/
	triggerDump(spanKey, source, reason, now) {
		const recorder = this.options.flightRecorder;
		if (!recorder) return;
		if (reason === "overdue") {
			if (this.dumpedSpans.has(spanKey)) return;
			this.dumpedSpans.add(spanKey);
		}
		if (!this.dumpCooldown.tryAcquire(source, now)) return;
		const from = now - (recorder.windowMs ?? DEFAULTS.flightWindowMs);
		const append = from < this.lastDumpEnd;
		const start = append ? this.lastDumpEnd : from;
		const entries = [];
		for (const entry of (this.buffering ? this.buffer : this.flightWindow ?? this.buffer).values()) if (entry.observedAt > start) entries.push(entry);
		const records = entries.map((entry) => entry.record);
		this.lastDumpEnd = now;
		recorder.onDump({
			records: append ? records : [...this.pinnedRecords(entries[0]?.order), ...records],
			append,
			reason,
			from: start,
			to: now
		});
	}
	/**
	* The pinned set. `sentFrom` is the arrival order of the first buffered record that the caller also sends. A clock
	* record from that order on is left out, so the reader applies it once, at its place among the buffered records.
	*/
	pinnedRecords(sentFrom = Number.POSITIVE_INFINITY) {
		const clockRecords = [...this.pinnedSnapshots.values(), this.pinnedDiscontinuities].flat();
		return [
			...this.pinnedStarts.values(),
			...this.pinnedDefinitions.values(),
			...this.pinnedStreams.values(),
			...clockRecords.filter((entry) => entry.order < sentFrom).sort((a, b) => a.order - b.order).map((entry) => entry.record),
			...[...this.pinnedSpans.values()].map((span) => span.updated),
			...[...this.pinnedStates.values()].map((state) => state.record)
		];
	}
};
function wantsRecord(tracks, record) {
	if (tracks === "*" || !isTrackedRecord(record)) return true;
	if (record.type !== "sample" && record.type !== "sample.chunk") return true;
	return tracks.has(record.track);
}
//#endregion
export { DEFAULT_SERIES_RETENTION, SeriesRing, TraceCollector };
