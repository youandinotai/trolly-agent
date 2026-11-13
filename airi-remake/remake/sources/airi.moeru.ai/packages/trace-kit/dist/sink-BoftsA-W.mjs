import { G as definitionRecordsOf } from "./conventions-DLiC8rkL.mjs";
import { array, boolean, check, finite, integer, literal, maxLength, minValue, nonEmpty, number, object, optional, picklist, pipe, record, regex, string, union, unknown, variant } from "valibot";
//#region src/core/records.ts
/**
* Version of the record format. A reader upcasts an older minor format and rejects a newer major format.
* `source.started.format` carries it.
*/
const TRACE_FORMAT = 1;
const SYSTEM_TYPES = /* @__PURE__ */ new Set([
	"source.started",
	"source.stopped",
	"source.lost",
	"clock.snapshot",
	"clock.discontinuity",
	"stream.started",
	"stream.stopped",
	"definition"
]);
function isSystemRecord(record) {
	return SYSTEM_TYPES.has(record.type);
}
function isTrackedRecord(record) {
	return "track" in record && typeof record.track === "string";
}
//#endregion
//#region src/core/schema.ts
const nonEmptyString = pipe(string(), nonEmpty());
/**
* The most points in one `sample.chunk`, over all its series. A chunk holds about one second, so this is above 4 kHz
* for one series. Series rings sit outside the byte limit of the buffer, so an untrusted chunk must be bounded here.
*/
const MAX_CHUNK_POINTS = 4096;
const finiteNumber = pipe(number(), finite());
/** A source or an epoch. Keys join them with `/`, so a `/` inside would make two keys equal. */
const keyPart = pipe(string(), nonEmpty(), regex(/^[^/]+$/, "A source or an epoch must not contain \"/\"."));
const assetRef = object({
	$asset: nonEmptyString,
	mediaType: nonEmptyString,
	bytes: pipe(number(), integer(), minValue(0))
});
const value = union([
	string(),
	finiteNumber,
	boolean(),
	array(string()),
	array(finiteNumber),
	assetRef
]);
const ids = record(string(), union([string(), finiteNumber]));
const ref = object({
	source: keyPart,
	epoch: keyPart,
	seq: pipe(number(), integer(), minValue(0))
});
const link = object({
	to: union([
		ref,
		object({ spanId: nonEmptyString }),
		object({
			key: nonEmptyString,
			id: union([string(), finiteNumber])
		})
	]),
	rel: nonEmptyString
});
const status = picklist([
	"ok",
	"error",
	"cancelled"
]);
const untracked = {
	source: keyPart,
	epoch: keyPart,
	seq: pipe(number(), integer(), minValue(0)),
	ts: finiteNumber,
	clock: nonEmptyString,
	observedTs: optional(finiteNumber),
	ids: optional(ids),
	attrs: optional(record(string(), value))
};
const tracked = {
	...untracked,
	track: nonEmptyString,
	links: optional(array(link)),
	evidence: optional(picklist(["reported", "observed"]))
};
/**
* Validates one trace record at a trust boundary, such as IPC from a window or `trace:emit` from a plugin.
* Producers inside one process do not validate their own records.
*/
const traceRecordSchema = variant("type", [
	object({
		...untracked,
		type: literal("source.started"),
		format: pipe(number(), integer()),
		runtime: string(),
		profiles: array(object({
			key: nonEmptyString,
			version: string()
		}))
	}),
	object({
		...untracked,
		type: literal("source.stopped")
	}),
	object({
		...untracked,
		type: literal("source.lost"),
		of: object({
			source: keyPart,
			epoch: keyPart,
			lastSeq: number()
		}),
		reason: picklist([
			"ipc-closed",
			"heartbeat-timeout",
			"epoch-replaced"
		])
	}),
	object({
		...untracked,
		type: literal("clock.snapshot"),
		values: array(object({
			clock: nonEmptyString,
			value: finiteNumber
		})),
		uncertaintyMs: pipe(finiteNumber, minValue(0))
	}),
	object({
		...untracked,
		type: literal("clock.discontinuity"),
		of: nonEmptyString,
		reason: string()
	}),
	object({
		...untracked,
		type: literal("stream.started"),
		streamId: nonEmptyString,
		mediaType: nonEmptyString,
		rate: optional(finiteNumber),
		channels: optional(pipe(number(), integer())),
		uri: optional(string())
	}),
	object({
		...untracked,
		type: literal("stream.stopped"),
		streamId: nonEmptyString
	}),
	object({
		...tracked,
		type: literal("span.begin"),
		spanId: nonEmptyString,
		parentSpanId: optional(nonEmptyString),
		name: string(),
		deadlineMs: optional(pipe(finiteNumber, minValue(0)))
	}),
	object({
		...tracked,
		type: literal("span.update"),
		spanId: nonEmptyString
	}),
	object({
		...tracked,
		type: literal("span.end"),
		spanId: nonEmptyString,
		status,
		reason: optional(string()),
		message: optional(string())
	}),
	object({
		...tracked,
		type: literal("span.complete"),
		spanId: nonEmptyString,
		parentSpanId: optional(nonEmptyString),
		name: string(),
		durationMs: pipe(finiteNumber, minValue(0)),
		status,
		reason: optional(string())
	}),
	object({
		...tracked,
		type: literal("instant"),
		name: string(),
		spanId: optional(nonEmptyString)
	}),
	object({
		...tracked,
		type: literal("state"),
		value: string(),
		from: optional(string())
	}),
	object({
		...tracked,
		type: literal("sample"),
		values: record(string(), finiteNumber)
	}),
	object({
		...tracked,
		type: literal("sample.chunk"),
		intervalMs: optional(pipe(finiteNumber, minValue(0))),
		offsetsMs: optional(pipe(array(finiteNumber), maxLength(MAX_CHUNK_POINTS))),
		values: pipe(record(string(), array(finiteNumber)), check((values) => Object.values(values).reduce((count, list) => count + list.length, 0) <= MAX_CHUNK_POINTS, `A sample chunk holds at most ${MAX_CHUNK_POINTS} points.`))
	}),
	object({
		...tracked,
		type: literal("log"),
		level: picklist([
			"debug",
			"info",
			"warn",
			"error"
		]),
		message: string()
	}),
	object({
		...untracked,
		type: literal("definition"),
		kind: picklist([
			"track",
			"attribute",
			"id-key",
			"link",
			"end-reason",
			"clock",
			"metric",
			"score",
			"pipeline",
			"preset",
			"profile"
		]),
		key: nonEmptyString,
		data: unknown()
	}),
	object({
		...untracked,
		type: literal("annotation"),
		target: object({
			ref: optional(ref),
			spanId: optional(nonEmptyString),
			ids: optional(ids)
		}),
		name: nonEmptyString,
		value: optional(value),
		label: optional(string()),
		explanation: optional(string()),
		annotator: object({
			kind: picklist([
				"rule",
				"model",
				"human"
			]),
			id: optional(string()),
			model: optional(string()),
			version: optional(string())
		})
	})
]);
//#endregion
//#region src/core/sink.ts
const noopTraceSink = {
	emit: () => {},
	wants: () => false,
	now: () => performance.now()
};
/**
* Sends each record to several sinks. The error of one sink goes to `onError` and does not stop the others.
* `wants` is true when any sink wants the track. `now` comes from the first sink.
*/
function fanOutTraceSink(sinks, onError) {
	return {
		emit: (record) => {
			for (const sink of sinks) try {
				sink.emit(record);
			} catch (error) {
				onError(error);
			}
		},
		wants: (track) => sinks.some((sink) => sink.wants(track)),
		now: () => (sinks[0] ?? noopTraceSink).now()
	};
}
/**
* One run of a producer: it stamps `source`, `epoch`, `seq`, and the default clock on each record.
*
* Lifecycle: the constructor writes `source.started` and the definitions of its profiles. `stop` writes
* `source.stopped` and ignores later records. A reload creates a new instance, which is a new epoch.
*
* `wants` reads the track set that {@link TraceSource.setWanted} received from the collector. Until the collector
* answers, no costly series is wanted.
*/
var TraceSource = class {
	source;
	epoch;
	clock;
	seq = 0;
	stopped = false;
	wanted = /* @__PURE__ */ new Set();
	wantsAll = false;
	sendRecord;
	now;
	constructor(options) {
		this.source = options.source;
		this.clock = options.clock;
		this.epoch = (options.createEpoch ?? (() => crypto.randomUUID()))();
		this.sendRecord = options.send;
		this.now = options.now ?? (() => performance.now());
		const ts = this.now();
		const profiles = options.profiles ?? [];
		this.emit({
			type: "source.started",
			ts,
			format: 1,
			runtime: options.runtime,
			profiles: profiles.map((profile) => ({
				key: profile.key,
				version: profile.version
			})),
			...options.attrs ? { attrs: options.attrs } : {}
		});
		for (const profile of profiles) this.announce(profile);
	}
	/** Announces the definitions of a profile, for example a plugin profile that loads later. */
	announce(profile) {
		for (const record of definitionRecordsOf(profile, this.now())) this.emit(record);
	}
	emit = (input) => {
		if (this.stopped) return;
		this.sendRecord({
			...input,
			clock: input.clock ?? this.clock,
			source: this.source,
			epoch: this.epoch,
			seq: this.seq++
		});
	};
	wants = (track) => {
		return this.wantsAll || this.wanted.has(track);
	};
	/** Sets the track paths that readers show. `'*'` wants every track. */
	setWanted(tracks) {
		this.wantsAll = tracks === "*";
		this.wanted = tracks === "*" ? /* @__PURE__ */ new Set() : new Set(tracks);
	}
	stop() {
		if (this.stopped) return;
		this.emit({
			type: "source.stopped",
			ts: this.now()
		});
		this.stopped = true;
	}
};
/** A random 16 hex digit span ID, the size of a W3C trace context span ID. */
function createSpanId() {
	const bytes = crypto.getRandomValues(/* @__PURE__ */ new Uint8Array(8));
	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
/**
* An open span of one producer. It writes `span.begin` at once, so readers see open work.
*
* Lifecycle: `end` writes `span.end` once. Later calls of `update`, `instant`, and `end` do nothing, so a cleanup
* path can end a span that a success path already ended.
*/
var TraceSpan = class {
	sink;
	spanId;
	track;
	ids;
	ended = false;
	constructor(sink, options) {
		this.sink = sink;
		this.spanId = options.spanId ?? createSpanId();
		this.track = options.track;
		this.ids = options.ids;
		const parentSpanId = typeof options.parent === "string" ? options.parent : options.parent?.spanId;
		sink.emit({
			type: "span.begin",
			ts: options.ts ?? sink.now(),
			track: options.track,
			spanId: this.spanId,
			name: options.name,
			...parentSpanId ? { parentSpanId } : {},
			...options.ids ? { ids: options.ids } : {},
			...options.attrs ? { attrs: options.attrs } : {},
			...options.links ? { links: options.links } : {},
			...options.deadlineMs !== void 0 ? { deadlineMs: options.deadlineMs } : {}
		});
	}
	get isEnded() {
		return this.ended;
	}
	update(attrs) {
		if (this.ended) return;
		this.sink.emit({
			type: "span.update",
			ts: this.sink.now(),
			track: this.track,
			spanId: this.spanId,
			attrs,
			...this.idFields()
		});
	}
	instant(name, attrs, ts) {
		if (this.ended) return;
		this.sink.emit({
			type: "instant",
			ts: ts ?? this.sink.now(),
			track: this.track,
			spanId: this.spanId,
			name,
			...attrs ? { attrs } : {},
			...this.idFields()
		});
	}
	end(options = {}) {
		if (this.ended) return;
		this.ended = true;
		this.sink.emit({
			type: "span.end",
			ts: options.ts ?? this.sink.now(),
			track: this.track,
			spanId: this.spanId,
			status: options.status ?? "ok",
			...options.reason ? { reason: options.reason } : {},
			...options.message ? { message: options.message } : {},
			...options.attrs ? { attrs: options.attrs } : {},
			...options.links ? { links: options.links } : {},
			...this.idFields()
		});
	}
	idFields() {
		return this.ids ? { ids: this.ids } : {};
	}
};
/** Writes `span.begin` on `sink` and returns the open span. */
function beginSpan(sink, options) {
	return new TraceSpan(sink, options);
}
/**
* Writes a frequent series, such as an audio level or a VAD probability, as `sample.chunk` records.
*
* Samples wait in memory until the chunk reaches `chunkMs`, then go out as one record with offsets from its first
* sample. While the sink does not want the track, `push` drops the sample, so a series that no one reads costs nothing.
* Call `flush` when the series pauses, for example when an input ends, so its last samples show at once.
*/
var SeriesWriter = class {
	sink;
	options;
	chunkMs;
	start;
	offsets = [];
	values = /* @__PURE__ */ new Map();
	constructor(sink, options) {
		this.sink = sink;
		this.options = options;
		this.chunkMs = options.chunkMs ?? 1e3;
	}
	/** Whether a reader wants the track now. A producer can skip costly work, such as decoding, while it is false. */
	wanted() {
		return this.sink().wants(this.options.track);
	}
	push(values, ts) {
		const sink = this.sink();
		if (!sink.wants(this.options.track)) {
			this.offsets.length = 0;
			this.values.clear();
			this.start = void 0;
			return;
		}
		const time = ts ?? sink.now();
		const keys = Object.keys(values);
		const sameKeys = keys.length === this.values.size && keys.every((key) => this.values.has(key));
		if (this.start !== void 0 && (time - this.start >= this.chunkMs || !sameKeys)) this.flush();
		this.start ??= time;
		this.offsets.push(time - this.start);
		for (const key of keys) {
			let column = this.values.get(key);
			if (!column) {
				column = [];
				this.values.set(key, column);
			}
			column.push(values[key]);
		}
	}
	flush() {
		if (this.start === void 0 || this.offsets.length === 0) return;
		this.sink().emit({
			type: "sample.chunk",
			ts: this.start,
			track: this.options.track,
			...this.options.ids ? { ids: this.options.ids } : {},
			offsetsMs: [...this.offsets],
			values: Object.fromEntries([...this.values].map(([key, column]) => [key, [...column]]))
		});
		this.offsets.length = 0;
		this.values.clear();
		this.start = void 0;
	}
};
//#endregion
export { createSpanId as a, MAX_CHUNK_POINTS as c, isSystemRecord as d, isTrackedRecord as f, beginSpan as i, traceRecordSchema as l, TraceSource as n, fanOutTraceSink as o, TraceSpan as r, noopTraceSink as s, SeriesWriter as t, TRACE_FORMAT as u };
