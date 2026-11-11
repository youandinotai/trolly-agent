import { ATTR_GEN_AI_INPUT_MESSAGES, ATTR_GEN_AI_MEMORY_QUERY_TEXT, ATTR_GEN_AI_OUTPUT_MESSAGES, ATTR_GEN_AI_SYSTEM_INSTRUCTIONS, ATTR_GEN_AI_TOOL_CALL_ARGUMENTS, ATTR_GEN_AI_TOOL_CALL_RESULT } from "./semconv.mjs";
import { clamp, mean, percentile, sum } from "es-toolkit";
//#region src/core/define.ts
function defineTrack(definition) {
	return definition;
}
function defineAttribute(definition) {
	return definition;
}
function defineIdKey(definition) {
	return definition;
}
function defineLink(definition) {
	return definition;
}
function defineEndReason(definition) {
	return definition;
}
function defineClock(definition) {
	return definition;
}
function defineMetric(definition) {
	return definition;
}
function defineScore(definition) {
	return definition;
}
function definePipeline(definition) {
	return definition;
}
function definePreset(definition) {
	return definition;
}
function defineProfile(definition) {
	return definition;
}
/**
* The definition records that announce a profile, in the order that a viewer needs them:
* the profile first, then each of its definitions.
*/
function definitionRecordsOf(profile, ts) {
	const records = [];
	const push = (kind, key, data) => records.push({
		type: "definition",
		ts,
		kind,
		key,
		data
	});
	const { tracks, attributes, idKeys, links, endReasons, clocks, metrics, scores, pipelines, presets, ...head } = profile;
	push("profile", profile.key, head);
	for (const track of tracks ?? []) push("track", track.path, track);
	for (const attribute of attributes ?? []) push("attribute", attribute.key, attribute);
	for (const idKey of idKeys ?? []) push("id-key", idKey.key, idKey);
	for (const link of links ?? []) push("link", link.rel, link);
	for (const endReason of endReasons ?? []) push("end-reason", endReason.reason, endReason);
	for (const clock of clocks ?? []) push("clock", clock.pattern, clock);
	for (const metric of metrics ?? []) push("metric", metric.key, metric);
	for (const score of scores ?? []) push("score", score.key, score);
	for (const pipeline of pipelines ?? []) push("pipeline", pipeline.key, pipeline);
	for (const preset of presets ?? []) push("preset", preset.key, preset);
	return records;
}
/**
* Matches a track path against a path pattern.
*
* Returns the values of the `{key}` segments, or `undefined` when the path does not match.
* A literal segment matches only itself. A `{key}` segment matches exactly one segment, and so does `*`, without a name.
*
* @example
* matchTrackPath('participants/{actor}/speech', 'participants/user/speech')
* // => { actor: 'user' }
*/
function matchTrackPath(pattern, path) {
	const patternSegments = pattern.split("/");
	const pathSegments = path.split("/");
	if (patternSegments.length !== pathSegments.length) return void 0;
	const params = {};
	for (const [index, segment] of patternSegments.entries()) {
		const value = pathSegments[index];
		if (segment.startsWith("{") && segment.endsWith("}")) params[segment.slice(1, -1)] = value;
		else if (segment !== "*" && segment !== value) return void 0;
	}
	return params;
}
/**
* Fills the `{key}` segments of a track path pattern.
*
* @example
* trackPath('participants/{actor}/speech', { actor: 'user' })
* // => 'participants/user/speech'
*/
function trackPath(pattern, params) {
	return pattern.replace(/\{(\w+)\}/g, (_match, key) => {
		const value = params[key];
		if (value === void 0) throw new Error(`Track path ${pattern} needs the ID key ${key}`);
		return String(value);
	});
}
/** Returns the text for a locale, then English, then the first entry. */
function localize(text, locale) {
	if (text === void 0 || typeof text === "string") return text;
	return text[locale] ?? text[locale.split("-")[0]] ?? text.en ?? Object.values(text)[0];
}
//#endregion
//#region src/conventions/index.ts
/** Version of the conventions. Exports write it into their metadata. */
const TRACE_CONVENTIONS_VERSION = "1";
/** Relations between records. Profiles add more. */
const TraceLinkRelations = {
	CausedBy: "caused-by",
	CancelledBy: "cancelled-by",
	RetryOf: "retry-of",
	Supersedes: "supersedes",
	Revises: "revises",
	FollowsFrom: "follows-from",
	SameEntity: "same-entity"
};
/** Common values of `span.end.reason`. The field is open. */
const TraceEndReasons = {
	Interrupted: "interrupted",
	Timeout: "timeout",
	Superseded: "superseded",
	Aborted: "aborted",
	NoAudio: "no-audio"
};
/** Kinds of pipeline edges. The field is open. */
const TraceEdgeKinds = {
	Command: "cmd",
	Data: "data",
	Audio: "audio",
	Signal: "signal"
};
/** Attribute names of AIRI that apply to any domain. The `gen_ai.*` names are in `./semconv`. */
const ATTR_PROVIDER_REQUEST_ID = "provider.request_id";
const ATTR_PROVIDER_RESPONSE_ID = "provider.response_id";
const ATTR_PROVIDER_ITEM_ID = "provider.item_id";
const ATTR_RETRY_COUNT = "retry.count";
const ATTR_FALLBACK_INDEX = "fallback.index";
/** An interruption cut the measurement short. Percentiles leave it out. */
const ATTR_CENSORED = "censored";
/** A cold start. Percentiles leave it out. */
const ATTR_WARMUP = "warmup";
const ATTR_DECISION_CHOICES = "decision.choices";
const ATTR_DECISION_VERDICT = "decision.verdict";
const ATTR_DECISION_P = "decision.p";
const ATTR_DECISION_THRESHOLD = "decision.threshold";
const ATTR_DECISION_REASON = "decision.reason";
const ATTR_DECISION_LATENCY_MS = "decision.latency_ms";
const ATTR_DECIDER = "decider";
const ATTR_MSG_KIND = "msg.kind";
const ATTR_MSG_NAME = "msg.name";
const ATTR_MSG_TO = "msg.to";
const ATTR_WORK_INTERRUPTIBLE = "work.interruptible";
const ATTR_STREAM_ID = "stream.id";
const ATTR_STREAM_START_FRAME = "stream.start_frame";
const ATTR_STREAM_END_FRAME = "stream.end_frame";
/** The rule that decided a state change. */
const ATTR_RULE = "rule";
/** An external input to a policy. A replay harness feeds it to a new policy. */
const ATTR_REPLAY_INPUT = "replay.input";
/** Only the `conversation` ID key maps to `gen_ai.conversation.id`. The `topic` ID key maps to this attribute. */
const ATTR_AIRI_TOPIC_ID = "airi.topic.id";
/** Attribute definitions of the conventions. The content policy reads their sensitivity. */
const conventionAttributes = [
	ATTR_GEN_AI_SYSTEM_INSTRUCTIONS,
	ATTR_GEN_AI_INPUT_MESSAGES,
	ATTR_GEN_AI_OUTPUT_MESSAGES,
	ATTR_GEN_AI_TOOL_CALL_ARGUMENTS,
	ATTR_GEN_AI_TOOL_CALL_RESULT,
	ATTR_GEN_AI_MEMORY_QUERY_TEXT
].map((key) => defineAttribute({
	key,
	type: "json",
	sensitivity: "content"
}));
/**
* Patterns of secret values. Tool arguments and provider errors can hold API keys, so the collector scrubs every
* string attribute, also attributes that are not content.
*/
const SECRET_PATTERNS = [
	/\b(?:sk|pk|rk)-[\w-]{16,}/g,
	/\bBearer\s+[\w.~+/-]{16,}=*/gi,
	/\b(?:api[_-]?key|access[_-]?token|secret|password)\s*[:=]\s*["']?[^\s"',}]{8,}/gi,
	/\bAKIA[0-9A-Z]{16}\b/g
];
const SCRUBBED = "[secret]";
/**
* Removes secrets from a string.
*
* @example
* scrubSecrets('Authorization: Bearer abcdefghijklmnop1234')
* // => 'Authorization: [secret]'
*/
function scrubSecrets(text) {
	let result = text;
	for (const pattern of SECRET_PATTERNS) result = result.replace(pattern, SCRUBBED);
	return result;
}
function applyToAttributes(attrs, policy) {
	let changed = false;
	const result = {};
	for (const [key, value] of Object.entries(attrs)) {
		const sensitivity = policy.sensitivityOf(key);
		if (sensitivity === "secret" || sensitivity === "content" && !policy.keepContent) {
			changed = true;
			continue;
		}
		if (typeof value === "string") {
			const scrubbed = scrubSecrets(value);
			changed ||= scrubbed !== value;
			result[key] = scrubbed;
		} else if (Array.isArray(value) && value.some((item) => typeof item === "string")) {
			const scrubbed = value.map(scrubSecrets);
			changed ||= scrubbed.some((item, index) => item !== value[index]);
			result[key] = scrubbed;
		} else result[key] = value;
	}
	return changed ? result : void 0;
}
/**
* Applies the content policy to one record. The collector applies it before the buffer and before the disk.
*
* Returns the same object when nothing changes, so the common path does not copy.
*/
function applyContentPolicy(record, policy) {
	let result = record;
	if (record.attrs) {
		const attrs = applyToAttributes(record.attrs, policy);
		if (attrs) result = {
			...result,
			attrs
		};
	}
	if (record.type === "log") {
		const message = scrubSecrets(record.message);
		if (message !== record.message) result = {
			...result,
			message
		};
	}
	if (record.type === "span.end" && record.message) {
		const message = scrubSecrets(record.message);
		if (message !== record.message) result = {
			...result,
			message
		};
	}
	return result;
}
/** Fewest samples for a p95. A p95 of fewer samples is noise. */
const MIN_P95_SAMPLES = 100;
/**
* Computes the nearest-rank percentile of measurements.
* Returns `undefined` for an empty list, and for p95 and p99 with fewer than 100 samples.
*/
function percentile$1(values, p) {
	if (values.length === 0 || p >= 95 && values.length < MIN_P95_SAMPLES) return void 0;
	return percentile(values, clamp(p, 0, 100));
}
/** Aggregates measurements. A ratio metric gives sums, so its ratio is a ratio of sums, not a mean of ratios. */
function aggregate(values, kinds) {
	const result = {};
	for (const kind of kinds) switch (kind) {
		case "p50":
			result.p50 = percentile$1(values, 50);
			break;
		case "p95":
			result.p95 = percentile$1(values, 95);
			break;
		case "p99":
			result.p99 = percentile$1(values, 99);
			break;
		case "mean":
			result.mean = values.length > 0 ? mean(values) : void 0;
			break;
		case "sum":
			result.sum = sum(values);
			break;
		case "count": result.count = values.length;
	}
	return result;
}
//#endregion
export { applyContentPolicy as A, definePipeline as B, ATTR_WARMUP as C, TraceEndReasons as D, TraceEdgeKinds as E, defineClock as F, definitionRecordsOf as G, defineProfile as H, defineEndReason as I, trackPath as J, localize as K, defineIdKey as L, percentile$1 as M, scrubSecrets as N, TraceLinkRelations as O, defineAttribute as P, defineLink as R, ATTR_STREAM_START_FRAME as S, TRACE_CONVENTIONS_VERSION as T, defineScore as U, definePreset as V, defineTrack as W, ATTR_REPLAY_INPUT as _, ATTR_DECISION_LATENCY_MS as a, ATTR_STREAM_END_FRAME as b, ATTR_DECISION_THRESHOLD as c, ATTR_MSG_KIND as d, ATTR_MSG_NAME as f, ATTR_PROVIDER_RESPONSE_ID as g, ATTR_PROVIDER_REQUEST_ID as h, ATTR_DECISION_CHOICES as i, conventionAttributes as j, aggregate as k, ATTR_DECISION_VERDICT as l, ATTR_PROVIDER_ITEM_ID as m, ATTR_CENSORED as n, ATTR_DECISION_P as o, ATTR_MSG_TO as p, matchTrackPath as q, ATTR_DECIDER as r, ATTR_DECISION_REASON as s, ATTR_AIRI_TOPIC_ID as t, ATTR_FALLBACK_INDEX as u, ATTR_RETRY_COUNT as v, ATTR_WORK_INTERRUPTIBLE as w, ATTR_STREAM_ID as x, ATTR_RULE as y, defineMetric as z };
