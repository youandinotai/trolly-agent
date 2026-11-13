import { K as localize, q as matchTrackPath } from "../conventions-DLiC8rkL.mjs";
import "../semconv.mjs";
import { n as recordKey, r as spanKeyOf } from "../keys-DD_VE8Fk.mjs";
import { a as TraceReader, l as createEventLogProjection, s as createAttributeMetricsProjection, t as createTimelineProjection } from "../timeline-B4Vc6qQf.mjs";
import { createFloorTransferProjection } from "../profiles/voice.mjs";
//#region src/views/lookup.ts
/** The span that a span ID names. The ID index gives its source and epoch. */
function spanOfId(state, indexes, spanId) {
	const begin = indexes.bySpanId.get(spanId);
	return begin ? state.spans.get(spanKeyOf(begin.source, begin.epoch, spanId)) : void 0;
}
/** The spans of records, once each, in record order. A record without a span ID adds nothing. */
function spansOfRecords(state, records) {
	const spans = /* @__PURE__ */ new Map();
	for (const record of records) {
		if (!("spanId" in record) || !record.spanId) continue;
		const span = state.spans.get(spanKeyOf(record.source, record.epoch, record.spanId));
		if (span) spans.set(span.key, span);
	}
	return [...spans.values()];
}
/** The spans that a link points to: the span of a span ID, or every span with a domain ID value. */
function spansOfLink(link, state, indexes) {
	if ("spanId" in link.to) {
		const span = spanOfId(state, indexes, link.to.spanId);
		return span ? [span] : [];
	}
	if ("key" in link.to) return spansOfRecords(state, indexes.byId.get(`${link.to.key}=${link.to.id}`) ?? []);
	return [];
}
/** The selection key of the item that a record belongs to: its span, or the record itself for an instant or a state. */
function itemOfRecord(record) {
	if (record.type === "span.begin" || record.type === "span.end" || record.type === "span.update" || record.type === "span.complete") return {
		kind: "span",
		key: spanKeyOf(record.source, record.epoch, record.spanId)
	};
	if (record.type === "instant" || record.type === "log") return {
		kind: "instant",
		key: recordKey(record)
	};
	if (record.type === "state") return {
		kind: "state",
		key: recordKey(record)
	};
}
/** The item of a reference and its track. Instants and states need a scan of the tracks. */
function findItem(state, ref) {
	if (ref.kind === "span") {
		const span = state.spans.get(ref.key);
		return {
			span,
			track: span ? state.tracks.get(span.track) : void 0
		};
	}
	for (const track of state.tracks.values()) if (ref.kind === "instant") {
		const instant = track.instants.find((candidate) => candidate.key === ref.key);
		if (instant) return {
			track,
			instant
		};
	} else {
		const change = track.states.find((candidate) => candidate.key === ref.key);
		if (change) return {
			track,
			change
		};
	}
	return {};
}
/** The spans that a span encloses, in start order. Only direct children. */
function childSpans(state, span) {
	const children = [];
	for (const candidate of state.spans.values()) if (candidate.parentKey === span.key) children.push(candidate);
	return children.sort((a, b) => a.start - b.start);
}
/** The input and output tokens of a model span. 0 for any other span. */
function spanTokens(span) {
	return Number(span.attrs["gen_ai.usage.input_tokens"] ?? 0) + Number(span.attrs["gen_ai.usage.output_tokens"] ?? 0);
}
/** ID keys that many unrelated spans share. They do not make two spans related. */
const BROAD_ID_KEYS = /* @__PURE__ */ new Set([
	"actor",
	"conversation",
	"agent",
	"topic"
]);
/**
* Keys of the records that relate to a span: spans that it links to, spans that link to it, and spans that share one
* of its narrow ID values, such as a turn or an input. The view dims every other item.
*/
function relatedSpanKeys(state, selected) {
	const related = /* @__PURE__ */ new Set([selected.key]);
	const targetIds = /* @__PURE__ */ new Set();
	for (const [key, value] of Object.entries(selected.ids ?? {})) if (!BROAD_ID_KEYS.has(key)) targetIds.add(`${key}=${value}`);
	for (const link of selected.links) if ("key" in link.to) targetIds.add(`${link.to.key}=${link.to.id}`);
	for (const span of state.spans.values()) {
		if (span.key === selected.key) continue;
		const linksToSelected = span.links.some((link) => "spanId" in link.to && link.to.spanId === selected.spanId);
		const selectedLinksTo = selected.links.some((link) => "spanId" in link.to && link.to.spanId === span.spanId);
		const sharesId = Object.entries(span.ids ?? {}).some(([key, value]) => !BROAD_ID_KEYS.has(key) && targetIds.has(`${key}=${value}`));
		if (linksToSelected || selectedLinksTo || sharesId || span.parentKey === selected.key || selected.parentKey === span.key) related.add(span.key);
	}
	return related;
}
//#endregion
//#region src/views/pipeline.ts
/**
* The nodes of a pipeline at time `at`: one node for each stage instance.
*
* A stage with a state track takes its latest state at or before `at`. Otherwise it is `busy` while a span is open,
* `error` when its latest span before `at` ended with an error, and `idle` otherwise.
*/
function pipelineNodes(state, pipeline, at, locale) {
	const nodes = [];
	for (const stage of pipeline.stages) {
		const instances = /* @__PURE__ */ new Map();
		for (const track of state.tracks.values()) for (const pattern of stage.tracks) {
			const params = matchTrackPath(pattern, track.path);
			if (!params) continue;
			const instance = Object.values(params)[0] ?? "";
			const list = instances.get(instance) ?? [];
			list.push(track);
			instances.set(instance, list);
		}
		if (instances.size === 0) instances.set("", []);
		for (const [instance, tracks] of instances) {
			let status = "idle";
			const open = [];
			let latestEnded;
			let latestState;
			for (const track of tracks) {
				for (const change of track.states) if (change.time <= at && (!latestState || change.time >= latestState.time)) latestState = change;
				for (const span of track.spans) {
					if (span.start > at) continue;
					if (span.end === void 0 || span.end > at) {
						if (!span.abandoned) open.push(span);
					} else if (!latestEnded || span.end > (latestEnded.end ?? 0)) latestEnded = span;
				}
			}
			if (latestState) status = latestState.value;
			else if (open.length > 0) status = "busy";
			else if (latestEnded?.status === "error") status = "error";
			nodes.push({
				key: `${stage.key}:${instance}`,
				stage: stage.key,
				label: localize(stage.label, locale) ?? stage.key,
				instance: instance || void 0,
				status,
				open,
				observed: tracks.length > 0
			});
		}
	}
	return nodes;
}
//#endregion
//#region src/views/reader.ts
/**
* A reader with the projections that the trace views read: the timeline, the event log, and the metrics. The IO tracer
* store and the stories read traces the same way.
*
* A live view keeps the default series retention. A file replay passes `{ seriesRetention: false }`.
*/
function createTraceViewReader(traceClock, options = {}) {
	const timeline = createTimelineProjection(options);
	const eventLog = createEventLogProjection();
	const attributeMetrics = createAttributeMetricsProjection();
	const floorTransfer = createFloorTransferProjection();
	const reader = new TraceReader([
		timeline,
		eventLog,
		attributeMetrics,
		floorTransfer
	], traceClock);
	return {
		reader,
		timelineView: () => reader.view(timeline),
		eventLogView: () => reader.view(eventLog),
		metricSamples: () => ({
			...reader.view(attributeMetrics),
			...reader.view(floorTransfer)
		})
	};
}
//#endregion
//#region src/views/tracks.ts
/**
* A stable color for a track path without a defined color.
*
* @example
* hashColor('plugin:minecraft/bots/b_2/planner')
* // => 'hsl(295 60% 55%)'
*/
function hashColor(text) {
	let hash = 0;
	for (const char of text) hash = hash * 31 + char.charCodeAt(0) | 0;
	return `hsl(${25 + Math.abs(hash) % 300} 60% 55%)`;
}
/** Whether a track matches a preset. A preset without tracks shows every track. */
function presetMatches(preset, path) {
	if (!preset || preset.tracks.length === 0) return true;
	return preset.tracks.some((pattern) => matchTrackPath(pattern, path) !== void 0);
}
/**
* What a track holds, for its label: the count of its items, and how many of its spans failed. An item is a span, or
* an instant or a state change on a track without spans.
*
* @example
* trackSummary(asrTrack)
* // => { items: 2, failed: 1 }
*/
function trackSummary(track) {
	return {
		items: track.spans.length || track.instants.length || track.states.length,
		failed: track.spans.reduce((count, span) => count + (span.status === "error" ? 1 : 0), 0)
	};
}
//#endregion
export { childSpans, createTraceViewReader, findItem, hashColor, itemOfRecord, pipelineNodes, presetMatches, relatedSpanKeys, spanOfId, spanTokens, spansOfLink, spansOfRecords, trackSummary };
