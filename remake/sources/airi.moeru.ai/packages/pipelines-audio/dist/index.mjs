import { createPushStream, createScope } from "@proj-airi/stream-kit";
import { createContext, defineEventa } from "@moeru/eventa";
import { errorMessageFrom } from "@moeru/std";
import { nanoid } from "nanoid/non-secure";
import { readGraphemeClusters } from "clustr";
//#region src/audio-input.ts
function blockMs(block) {
	return (block.range.endFrame - block.range.startFrame) * 1e3 / block.sampleRate;
}
function sliceBlock(block, startFrame) {
	return {
		...block,
		range: {
			...block.range,
			startFrame
		},
		channels: block.channels.map((channel) => channel.slice(startFrame - block.range.startFrame))
	};
}
function isValidBlock(block, frame) {
	const { startFrame, endFrame } = block.range;
	return Number.isSafeInteger(startFrame) && Number.isSafeInteger(endFrame) && endFrame > startFrame && (frame === void 0 || startFrame >= frame) && Number.isFinite(block.sampleRate) && block.sampleRate > 0 && block.channels.length > 0 && block.channels.every((channel) => channel.length === endFrame - startFrame);
}
function historyFrom(connection, from) {
	const { history, position } = connection;
	const oldest = history[0]?.range.startFrame ?? position?.frame;
	if (!position || from.sourceId !== position.sourceId || oldest === void 0 || from.frame < oldest || from.frame > position.frame) return void 0;
	return history.filter((block) => block.range.endFrame > from.frame).map((block) => block.range.startFrame < from.frame ? sliceBlock(block, from.frame) : block);
}
/**
* Shares one live source between independent subscribers.
*
* The first subscriber opens the source and the last one to leave closes it. Each subscription can
* replay retained history from an earlier position, so speech that started before detection is kept.
* A slow subscriber fails alone, because a live source cannot wait for it.
*
* State model:
* - connection: the open source call with its subscribers, coordinates, and history. Present only while subscribers exist.
* - leases: callers such as detectors that need history older than `historyMs`. They outlive connections.
* - previousSourceId: the id of the last connection, so that a source that reuses it fails instead of mixing coordinates.
*/
var AudioInput = class {
	source;
	options;
	connection;
	leases = /* @__PURE__ */ new Set();
	previousSourceId;
	constructor(source, options = {}) {
		this.source = source;
		this.options = options;
		if (!Number.isFinite(options.historyMs ?? 0) || (options.historyMs ?? 0) < 0) throw new Error("History duration must be finite and nonnegative");
	}
	/** Undefined until the current connection delivers its first block, and after it closes. */
	get position() {
		return this.open?.position;
	}
	get sampleRate() {
		return this.open?.sampleRate;
	}
	/**
	* Streams accepted blocks until `signal` aborts, the stream is cancelled, or the source ends.
	*
	* With `from`, the stream first replays retained history from that position. Missing history errors the stream.
	* Source failure errors every subscriber. Source completion closes them.
	*
	* A live source cannot wait for a slow reader. When unread audio exceeds `maxBufferedMs`, only this
	* subscription errors, so one stalled consumer cannot grow memory without limit or stop the others.
	*/
	subscribe(options = {}) {
		const maxBufferedMs = options.maxBufferedMs ?? 6e4;
		if (!Number.isFinite(maxBufferedMs) || maxBufferedMs <= 0) throw new Error("Subscription buffer duration must be finite and positive");
		const scope = createScope(options.signal);
		let output;
		const stream = new ReadableStream({
			start: (controller) => void (output = controller),
			cancel: (reason) => scope.close(reason)
		}, {
			highWaterMark: maxBufferedMs,
			size: blockMs
		});
		if (scope.signal.aborted) {
			output.close();
			return stream;
		}
		const open = this.open;
		const replay = options.from ? open && historyFrom(open, options.from) : [];
		if (!replay) {
			output.error(/* @__PURE__ */ new Error("Audio history is unavailable"));
			scope.close();
			return stream;
		}
		const connection = open ?? this.connect();
		const subscriber = {
			scope,
			output
		};
		replay.forEach((block) => subscriber.output.enqueue(block));
		connection.subscribers.add(subscriber);
		scope.defer(() => {
			connection.subscribers.delete(subscriber);
			try {
				subscriber.output.close();
			} catch {}
			if (!connection.subscribers.size) connection.scope.close("No audio subscribers");
		});
		return stream;
	}
	/** Keeps history for a holder, such as a detector whose result can start a capture before its window. */
	retain(signal) {
		const lease = { from: this.position };
		if (!signal.aborted) {
			this.leases.add(lease);
			signal.addEventListener("abort", () => this.leases.delete(lease), { once: true });
		}
		return { hold: (from) => {
			lease.from = from;
		} };
	}
	/** Ends every subscription and releases the source. Later subscriptions reopen it. */
	close() {
		const connection = this.connection;
		connection?.subscribers.forEach((subscriber) => void subscriber.scope.close("Audio input closed"));
		return connection?.scope.closed ?? Promise.resolve();
	}
	/** A closing connection keeps its object until cleanup runs, but it accepts no new subscriber. */
	get open() {
		return this.connection && !this.connection.scope.signal.aborted ? this.connection : void 0;
	}
	connect() {
		const connection = {
			scope: createScope(),
			subscribers: /* @__PURE__ */ new Set(),
			history: [],
			position: void 0,
			sampleRate: void 0
		};
		this.connection = connection;
		connection.scope.defer(() => {
			if (this.connection === connection) this.connection = void 0;
		});
		this.read(connection);
		return connection;
	}
	/** Triggering workflow: first subscriber → source.open → accepted blocks → subscribers and history. */
	async read(connection) {
		const { scope } = connection;
		let reader;
		try {
			reader = this.source.open(scope.signal).getReader();
			scope.defer(() => reader?.cancel(scope.signal.reason).catch(() => {}));
			while (!scope.signal.aborted) {
				const { done, value: block } = await reader.read();
				if (done || scope.signal.aborted) break;
				this.accept(connection, block);
			}
			if (!scope.signal.aborted) for (const subscriber of connection.subscribers) subscriber.scope.close("Audio source ended");
		} catch (cause) {
			const error = cause instanceof Error ? cause : new Error("Audio source failed", { cause });
			if (!scope.signal.aborted) for (const subscriber of connection.subscribers) {
				subscriber.output.error(error);
				subscriber.scope.close(error);
			}
		} finally {
			scope.close();
		}
	}
	accept(connection, block) {
		const { position } = connection;
		if (!position && block.range.sourceId === this.previousSourceId) throw new Error("Audio source reused the id of its previous connection");
		if (position && block.range.sourceId !== position.sourceId) throw new Error("Audio source changed its id within a connection");
		if (!isValidBlock(block, position?.frame)) throw new Error("Invalid source audio block");
		if (position && connection.sampleRate !== block.sampleRate) throw new Error("Audio format changed within a source connection");
		if (position && block.range.startFrame !== position.frame) connection.history.length = 0;
		if (!position) {
			this.previousSourceId = block.range.sourceId;
			for (const lease of this.leases) lease.from = {
				sourceId: block.range.sourceId,
				frame: block.range.startFrame
			};
		}
		connection.position = {
			sourceId: block.range.sourceId,
			frame: block.range.endFrame
		};
		connection.sampleRate = block.sampleRate;
		connection.history.push(block);
		for (const subscriber of connection.subscribers) {
			if ((subscriber.output.desiredSize ?? 0) < 0) {
				subscriber.output.error(/* @__PURE__ */ new Error("Audio subscriber fell behind"));
				subscriber.scope.close("Audio subscriber fell behind");
				continue;
			}
			subscriber.output.enqueue(block);
		}
		this.trimHistory(connection, block.sampleRate);
	}
	trimHistory(connection, sampleRate) {
		const { history, position } = connection;
		let retainedFrom = position.frame - Math.floor((this.options.historyMs ?? 0) * sampleRate / 1e3);
		for (const lease of this.leases) if (lease.from?.sourceId === position.sourceId) retainedFrom = Math.min(retainedFrom, lease.from.frame);
		while (history.length && history[0].range.endFrame <= retainedFrom) history.shift();
		if (history.length && history[0].range.startFrame < retainedFrom) history[0] = sliceBlock(history[0], retainedFrom);
	}
};
//#endregion
//#region src/capture.ts
/**
* Captures one interval from a shared input.
*
* `from` replays retained history, so speech that started before detection is included.
* Source completion finishes the capture. A gap inside the interval fails it, because consumers
* such as transcription providers treat the stream as continuous audio.
* When `stream` has more than `maxBufferedMs` of unread audio, the capture fails instead of growing without limit.
*/
function capture(input, options = {}) {
	const maxBufferedMs = options.maxBufferedMs ?? 6e4;
	if (!Number.isFinite(maxBufferedMs) || maxBufferedMs <= 0) throw new Error("Capture buffer duration must be finite and positive");
	const lifetime = new AbortController();
	const completion = Promise.withResolvers();
	const started = Promise.withResolvers();
	const output = createPushStream((reason) => settle({
		status: "cancelled",
		reason: typeof reason === "string" ? reason : "Capture output cancelled"
	}), {
		highWaterMark: maxBufferedMs,
		size: (block) => (block.range.endFrame - block.range.startFrame) * 1e3 / block.sampleRate
	});
	let range = options.from && {
		sourceId: options.from.sourceId,
		startFrame: options.from.frame,
		endFrame: options.from.frame
	};
	let settled = false;
	function settle(outcome) {
		if (settled) return;
		settled = true;
		lifetime.abort(outcome.status === "finished" ? "Capture finished" : outcome);
		if (outcome.status === "finished") output.close();
		else output.error(outcome.status === "failed" ? outcome.error : new Error(outcome.reason));
		started.resolve(false);
		completion.resolve(outcome);
	}
	function finish() {
		settle({
			status: "finished",
			value: range
		});
		return completion.promise;
	}
	options.signal?.addEventListener("abort", () => settle({
		status: "cancelled",
		reason: "Capture aborted"
	}), {
		once: true,
		signal: lifetime.signal
	});
	if (options.signal?.aborted) settle({
		status: "cancelled",
		reason: "Capture aborted"
	});
	/** Triggering workflow: input subscription → continuity check → capture output. */
	async function pump() {
		const reader = input.subscribe({
			from: options.from,
			signal: lifetime.signal
		}).getReader();
		try {
			while (!lifetime.signal.aborted) {
				const { done, value: block } = await reader.read();
				if (done || lifetime.signal.aborted) break;
				if (range && (block.range.sourceId !== range.sourceId || block.range.startFrame !== range.endFrame)) throw new Error("Audio source has a gap");
				if ((output.desiredSize() ?? 0) < 0) throw new Error("Capture reader fell behind");
				range = {
					sourceId: block.range.sourceId,
					startFrame: range?.startFrame ?? block.range.startFrame,
					endFrame: block.range.endFrame
				};
				started.resolve(true);
				output.write(block);
			}
			finish();
		} catch (cause) {
			settle({
				status: "failed",
				error: cause instanceof Error ? cause : new Error("Audio capture failed", { cause })
			});
		} finally {
			reader.releaseLock();
		}
	}
	if (!settled) pump();
	return {
		stream: output.stream,
		started: started.promise,
		done: completion.promise,
		finish,
		cancel: (reason) => settle({
			status: "cancelled",
			reason
		})
	};
}
//#endregion
//#region src/eventa.ts
const speechSegmentEvent = defineEventa("proj-airi:pipelines:output:speech:segment");
const speechSpecialEvent = defineEventa("proj-airi:pipelines:output:speech:special");
const speechTtsRequestEvent = defineEventa("proj-airi:pipelines:output:speech:tts-request");
const speechTtsResultEvent = defineEventa("proj-airi:pipelines:output:speech:tts-result");
const speechPlaybackStartEvent = defineEventa("proj-airi:pipelines:output:speech:playback-start");
const speechPlaybackEndEvent = defineEventa("proj-airi:pipelines:output:speech:playback-end");
const speechPlaybackInterruptEvent = defineEventa("proj-airi:pipelines:output:speech:playback-interrupt");
const speechPlaybackRejectEvent = defineEventa("proj-airi:pipelines:output:speech:playback-reject");
const speechIntentStartEvent = defineEventa("proj-airi:pipelines:output:speech:intent-start");
const speechIntentEndEvent = defineEventa("proj-airi:pipelines:output:speech:intent-end");
const speechIntentCancelEvent = defineEventa("proj-airi:pipelines:output:speech:intent-cancel");
const speechTurnStartEvent = defineEventa("proj-airi:pipelines:output:speech:turn-start");
const speechTurnEndEvent = defineEventa("proj-airi:pipelines:output:speech:turn-end");
const speechTurnCancelEvent = defineEventa("proj-airi:pipelines:output:speech:turn-cancel");
const speechPipelineEventMap = {
	onSegment: speechSegmentEvent,
	onSpecial: speechSpecialEvent,
	onTtsRequest: speechTtsRequestEvent,
	onTtsResult: speechTtsResultEvent,
	onPlaybackStart: speechPlaybackStartEvent,
	onPlaybackEnd: speechPlaybackEndEvent,
	onPlaybackInterrupt: speechPlaybackInterruptEvent,
	onPlaybackReject: speechPlaybackRejectEvent,
	onIntentStart: speechIntentStartEvent,
	onIntentEnd: speechIntentEndEvent,
	onIntentCancel: speechIntentCancelEvent,
	onTurnStart: speechTurnStartEvent,
	onTurnEnd: speechTurnEndEvent,
	onTurnCancel: speechTurnCancelEvent
};
//#endregion
//#region src/observe.ts
function validateShape(shape) {
	if (!Number.isFinite(shape.windowMs) || shape.windowMs <= 0 || !Number.isFinite(shape.hopMs) || shape.hopMs <= 0) throw new Error("Audio window and hop must be finite and positive");
	if (shape.minWindowMs !== void 0 && (!Number.isFinite(shape.minWindowMs) || shape.minWindowMs <= 0 || shape.minWindowMs > shape.windowMs)) throw new Error("Initial window must be positive and no longer than the full window");
}
/**
* Slices a block stream into sliding windows.
*
* The first window can start at `minWindowMs` and grows by one hop until `windowMs`.
* A source gap restarts growth and marks the next window as discontinuous.
*/
function audioWindows(shape) {
	validateShape(shape);
	const blocks = [];
	let firstFrame = 0;
	let nextEnd;
	let lastFrame;
	let discontinuity = false;
	return new TransformStream({ transform(block, output) {
		if (lastFrame !== void 0 && lastFrame !== block.range.startFrame) {
			blocks.length = 0;
			nextEnd = void 0;
			discontinuity = true;
		}
		lastFrame = block.range.endFrame;
		blocks.push(block);
		const frames = (ms) => Math.max(1, Math.round(ms * block.sampleRate / 1e3));
		const length = frames(shape.windowMs);
		if (nextEnd === void 0) {
			firstFrame = block.range.startFrame;
			nextEnd = firstFrame + frames(shape.minWindowMs ?? shape.windowMs);
		}
		for (; nextEnd <= block.range.endFrame; nextEnd += frames(shape.hopMs)) {
			const end = nextEnd;
			const start = Math.max(firstFrame, end - length);
			const channels = block.channels.map(() => new Float32Array(end - start));
			for (const part of blocks) {
				const partStart = Math.max(start, part.range.startFrame);
				const partEnd = Math.min(end, part.range.endFrame);
				if (partEnd > partStart) part.channels.forEach((channel, index) => channels[index].set(channel.subarray(partStart - part.range.startFrame, partEnd - part.range.startFrame), partStart - start));
			}
			output.enqueue({
				range: {
					sourceId: block.range.sourceId,
					startFrame: start,
					endFrame: end
				},
				sampleRate: block.sampleRate,
				channels,
				discontinuity
			});
			discontinuity = false;
		}
		while (blocks.length && blocks[0].range.endFrame <= Math.max(firstFrame, nextEnd - length)) blocks.shift();
	} });
}
/**
* Runs a detector over windows of a shared input.
*
* `ordered` processes every window in order. `latest` keeps the active inference and replaces
* the pending window, while keeping any gap flag that the replaced windows carried.
* With `preRollMs`, the input keeps history before the oldest window that is still in flight,
* so a detection result can start a capture before that window.
*/
function observe(input, options, detector, onResult) {
	validateShape(options);
	if (options.preRollMs !== void 0 && (!Number.isFinite(options.preRollMs) || options.preRollMs < 0)) throw new Error("Pre-roll duration must be finite and nonnegative");
	const maxBufferedMs = options.maxBufferedMs ?? 6e4;
	if (!Number.isFinite(maxBufferedMs) || maxBufferedMs <= 0) throw new Error("Observer buffer duration must be finite and positive");
	const scope = createScope(options.signal);
	const completion = Promise.withResolvers();
	const pending = [];
	let active;
	let latestWindow;
	let running = false;
	let sourceEnded = false;
	function settle(outcome) {
		completion.resolve(outcome);
		scope.close(outcome);
	}
	scope.defer(() => {
		pending.length = 0;
		const reason = scope.signal.reason;
		completion.resolve({
			status: "cancelled",
			reason: typeof reason === "string" ? reason : "Observer closed"
		});
	});
	const lease = options.preRollMs === void 0 ? void 0 : input.retain(scope.signal);
	function holdPreRoll() {
		const oldest = active ?? pending[0] ?? latestWindow;
		if (lease && oldest) lease.hold({
			sourceId: oldest.range.sourceId,
			frame: oldest.range.startFrame - Math.round(options.preRollMs * oldest.sampleRate / 1e3)
		});
	}
	async function drain() {
		if (running) return;
		running = true;
		try {
			while (pending.length && !scope.signal.aborted) {
				active = pending.shift();
				const value = await detector(active, scope.signal);
				if (!scope.signal.aborted) onResult({
					range: active.range,
					discontinuity: active.discontinuity,
					value
				});
				active = void 0;
				holdPreRoll();
			}
			if (sourceEnded && !scope.signal.aborted) settle({
				status: "finished",
				value: void 0
			});
		} catch (cause) {
			settle({
				status: "failed",
				error: cause instanceof Error ? cause : new Error("Audio detector failed", { cause })
			});
		} finally {
			active = void 0;
			running = false;
		}
	}
	async function read() {
		const reader = input.subscribe({ signal: scope.signal }).pipeThrough(audioWindows(options)).getReader();
		try {
			while (!scope.signal.aborted) {
				const { done, value: window } = await reader.read();
				if (done) break;
				latestWindow = window;
				if (options.scheduling === "ordered") {
					pending.push(window);
					const backlogMs = (window.range.endFrame - pending[0].range.startFrame) * 1e3 / window.sampleRate;
					if (pending[0].range.sourceId === window.range.sourceId && backlogMs > maxBufferedMs) throw new Error("Audio detector fell behind");
				} else {
					const gap = window.discontinuity || pending.some((item) => item.discontinuity);
					pending.splice(0, pending.length, gap === window.discontinuity ? window : {
						...window,
						discontinuity: gap
					});
				}
				holdPreRoll();
				drain();
			}
			sourceEnded = true;
			if (!running && !scope.signal.aborted) settle({
				status: "finished",
				value: void 0
			});
		} catch (cause) {
			settle({
				status: "failed",
				error: cause instanceof Error ? cause : new Error("Audio source failed", { cause })
			});
		}
	}
	if (!scope.signal.aborted) read();
	return {
		done: completion.promise,
		cancel: (reason) => void scope.close(reason)
	};
}
//#endregion
//#region src/level.ts
/** One level per window gives a 20 Hz meter, which is smooth enough for a volume halo. */
const LEVEL_WINDOW_MS = 50;
/** The meter shows signal from -60 dBFS (level 0) to full scale (level 1). Quieter input reads as silence. */
const LEVEL_FLOOR_DB = -60;
/**
* Publishes the level of an input until `signal` aborts, one value for each 50 ms window.
*
* The input can be a microphone or the output of a playback, see `Playback.output`. The observation subscribes to
* `input`, so it keeps the source open. Run it only while the level is needed.
* Each level is the root mean square of all channels in one window, mapped linearly in decibels to the range 0 to 1.
*/
function observeLevel(input, signal, onLevel) {
	return observe(input, {
		windowMs: LEVEL_WINDOW_MS,
		hopMs: LEVEL_WINDOW_MS,
		signal
	}, async (window) => levelOf(window.channels), (result) => onLevel(result.value));
}
/**
* The level of some audio: the root mean square of all channels, mapped linearly in decibels from -60 dBFS (0) to full
* scale (1).
*
* @example
* levelOf([new Float32Array([0.5, -0.5])])
* // => 0.9 (-6 dBFS)
*/
function levelOf(channels) {
	let sum = 0;
	let count = 0;
	for (const channel of channels) {
		for (const sample of channel) sum += sample * sample;
		count += channel.length;
	}
	if (!count || !sum) return 0;
	const decibels = 10 * Math.log10(sum / count);
	return Math.min(1, Math.max(0, (decibels - LEVEL_FLOOR_DB) / 60));
}
//#endregion
//#region src/llm-streaming-control/parsers/act.ts
const actTokenPrefix = "<|ACT ";
const markerSuffix$2 = "|>";
function isPlainObject$1(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
/**
* Creates the parser for `<|ACT {...}|>` streaming-control tokens.
*
* Use when:
* - Loading the built-in performance action control
*
* Expects:
* - The token body is a JSON object literal
*
* Returns:
* - Parsed action data with no side effects
*/
function tokenAct() {
	return {
		name: "ACT",
		match(special) {
			const trimmed = special.trim();
			return trimmed.startsWith(actTokenPrefix) && trimmed.endsWith(markerSuffix$2);
		},
		parse(special) {
			const rawPayload = special.trim().slice(6, -2).trim();
			let parsed;
			try {
				parsed = JSON.parse(rawPayload);
			} catch {
				return;
			}
			if (!isPlainObject$1(parsed)) return;
			return {
				type: "act",
				payload: parsed
			};
		}
	};
}
//#endregion
//#region src/llm-streaming-control/parsers/call.ts
const callTokenPrefix = "<|CALL ";
const markerSuffix$1 = "|>";
function isPlainObject(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function renderCallManifestExamples(manifest) {
	if (manifest.examples?.length) return manifest.examples;
	return [`<|CALL ["${manifest.name}"]|>`];
}
/**
* Renders model-facing instructions for registered `<|CALL [...]|>` manifests.
*
* Use when:
* - Injecting currently available CALL token affordances into a model prompt
*
* Expects:
* - Manifests are already normalized by the streaming-control registry
*
* Returns:
* - Empty string when no manifests are registered
* - A CALL-specific instruction block with syntax rules and examples otherwise
*/
function renderCallManifestPrompt(manifests) {
	if (manifests.length === 0) return "";
	const lines = [
		"Available streaming CALL tokens:",
		"Use these only as text special tokens when the matching plugin action is needed.",
		"Syntax: <|CALL [\"call.name\"]|> or <|CALL [\"call.name\", {\"key\":\"value\"}]|>.",
		"Never write provider tool names inside <|CALL ...|>.",
		"Never write JSON payload after the closing |>; all payload data belongs inside the JSON array.",
		""
	];
	for (const manifest of manifests) {
		lines.push(`- ${manifest.name}: ${manifest.prompt}`);
		lines.push("  Examples:");
		for (const example of renderCallManifestExamples(manifest)) lines.push(`  - ${example}`);
	}
	return lines.join("\n");
}
/**
* Creates the parser for `<|CALL [...]|>` streaming-control tokens.
*
* Use when:
* - Loading the built-in plugin callback control
*
* Expects:
* - The token body is a JSON array: `[name]` or `[name, payloadObject]`
*
* Returns:
* - Parsed call data with no side effects
*/
function tokenCall() {
	return {
		name: "CALL",
		match(special) {
			const trimmed = special.trim();
			return trimmed.startsWith(callTokenPrefix) && trimmed.endsWith(markerSuffix$1);
		},
		parse(special) {
			const rawPayload = special.trim().slice(7, -2).trim();
			let parsed;
			try {
				parsed = JSON.parse(rawPayload);
			} catch {
				return;
			}
			if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 2) return;
			const [name, payload] = parsed;
			if (typeof name !== "string" || name.trim().length === 0) return;
			if (payload !== void 0 && !isPlainObject(payload)) return;
			return {
				type: "call",
				name: name.trim(),
				payload
			};
		}
	};
}
//#endregion
//#region src/llm-streaming-control/parsers/delay.ts
const delayTokenPrefix = "<|DELAY ";
const markerSuffix = "|>";
/**
* Creates the parser for `<|DELAY n|>` streaming-control tokens.
*
* Use when:
* - Loading the built-in performance delay control
*
* Expects:
* - The token body is a finite positive number literal in seconds
*
* Returns:
* - Parsed delay data with no side effects
*/
function tokenDelay() {
	return {
		name: "DELAY",
		match(special) {
			const trimmed = special.trim();
			return trimmed.startsWith(delayTokenPrefix) && trimmed.endsWith(markerSuffix);
		},
		parse(special) {
			const rawPayload = special.trim().slice(8, -2).trim();
			if (!/^\d+(?:\.\d+)?$/.test(rawPayload)) return;
			const seconds = Number.parseFloat(rawPayload);
			if (!Number.isFinite(seconds) || seconds <= 0) return;
			return {
				type: "delay",
				seconds
			};
		}
	};
}
//#endregion
//#region src/llm-streaming-control/controller.ts
/**
* Creates a controller over LLM streaming-control tokens.
*
* Use when:
* - A stage runtime needs to dispatch special tokens from one playback source
* - A plugin bridge needs to register CALL callbacks against the same controller instance
*
* Expects:
* - The caller owns the controller lifetime
*
* Returns:
* - A controller with `match`, `dispatchWith`, `on`
*
* Notice:
* - Core behavior intentionally preserved
* - Refactored for readability and lower duplication
* - Handler execution order preserved
*/
function createStreamingControlParser(options = {}) {
	const handlers = /* @__PURE__ */ new Map();
	const callManifests = /* @__PURE__ */ new Map();
	const turns = /* @__PURE__ */ new Map();
	const signalHandlers = /* @__PURE__ */ new Set();
	const parsers = options.parsers ?? [
		tokenAct(),
		tokenDelay(),
		tokenCall()
	];
	/**
	* Finds matching parser.
	*
	* Notice:
	* - Single lookup reused everywhere
	*/
	function findParser(input) {
		return parsers.find((parser) => parser.match(input));
	}
	/**
	* Completes and destroys turn.
	*
	* Notice:
	* - Centralized cleanup path
	*/
	function finalizeTurn(turnId, type) {
		const turn = turns.get(turnId);
		if (!turn) return;
		turn.settle({ type });
		turns.delete(turnId);
	}
	function createTurnApi(turnId, turn) {
		return {
			cancel() {
				finalizeTurn(turnId, "cancelled");
			},
			complete() {
				finalizeTurn(turnId, "completed");
			},
			done: turn.done,
			on(manifest, handler) {
				return registerHandler(turn, manifest, handler);
			},
			renderManifestPrompt() {
				return renderCallManifestPrompt([...turn.callManifests.values()]);
			},
			turnId
		};
	}
	return {
		beginTurn(options) {
			const turnId = options?.turnId?.trim() || createTurnId();
			const existing = turns.get(turnId);
			if (existing) return createTurnApi(turnId, existing);
			const turn = createTurnState();
			turns.set(turnId, turn);
			return createTurnApi(turnId, turn);
		},
		cancelTurn(turnId) {
			finalizeTurn(turnId, "cancelled");
		},
		completeTurn(turnId) {
			finalizeTurn(turnId, "completed");
		},
		async dispatchWith(special, context) {
			const parser = findParser(special);
			if (!parser) {
				emit(context, {
					reason: "no-matching-parser",
					type: "rejected"
				});
				return false;
			}
			const parsed = parser.parse(special);
			if (!parsed) {
				emit(context, {
					parserName: parser.name,
					reason: "parse-failed",
					type: "rejected"
				});
				return false;
			}
			emit(context, {
				callName: parsed.type === "call" ? parsed.name : void 0,
				parameter: parsedParameter(parsed),
				parserName: parser.name,
				tokenType: parsed.type,
				type: "parsed"
			});
			const { observer: _observer, ...dispatchContext } = context ?? {};
			const signalContext = {
				...dispatchContext,
				createdAt: Date.now()
			};
			for (const handler of [...signalHandlers]) try {
				await handler(parsed, signalContext);
			} catch (error) {
				emit(context, {
					error,
					tokenType: parsed.type,
					type: "signal-handler-error"
				});
				console.warn("[llm-streaming-control] signal handler failed", error);
			}
			if (parsed.type !== "call") return true;
			const turnState = dispatchContext.turnId ? turns.get(dispatchContext.turnId) : void 0;
			const turnHandlers = turnState?.handlers.get(parsed.name);
			const registeredHandlers = [...(turnHandlers?.size && turnState ? turnHandlers : handlers.get(parsed.name)) ?? []];
			emit(context, {
				count: registeredHandlers.length,
				type: "call-handler-count"
			});
			if (!registeredHandlers.length) {
				emit(context, {
					callName: parsed.name,
					payload: parsed.payload,
					type: "call-handler-missing"
				});
				return true;
			}
			for (const handler of registeredHandlers) try {
				emit(context, {
					callName: parsed.name,
					type: "call-handler-start"
				});
				await handler(parsed.payload, signalContext);
				emit(context, {
					callName: parsed.name,
					type: "call-handler-end"
				});
			} catch (error) {
				emit(context, {
					callName: parsed.name,
					error,
					type: "call-handler-error"
				});
				console.warn("[llm-streaming-control] handler failed", error);
			}
			return true;
		},
		match(input) {
			return !!findParser(input);
		},
		on(manifest, handler) {
			return registerHandler({
				callManifests,
				handlers
			}, manifest, handler);
		},
		onSignal(handler) {
			signalHandlers.add(handler);
			return () => {
				signalHandlers.delete(handler);
			};
		},
		renderManifestPrompt() {
			return renderCallManifestPrompt([...callManifests.values()]);
		}
	};
}
function createTurnId() {
	return `turn:${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`}`;
}
/**
* Creates isolated turn state.
*
* Notice:
* - Promise resolves once only
* - Prevents accidental double completion
*/
function createTurnState() {
	let settled = false;
	let settle;
	const done = new Promise((resolve) => {
		settle = (result) => {
			if (settled) return;
			settled = true;
			resolve(result);
		};
	});
	return {
		callManifests: /* @__PURE__ */ new Map(),
		done,
		handlers: /* @__PURE__ */ new Map(),
		settle
	};
}
/**
* Emits observer events safely.
*
* Notice:
* - Observer failures must never break dispatch
*/
function emit(context, payload) {
	try {
		context?.observer?.(payload);
	} catch {}
}
/**
* Normalizes manifest values before registration.
*
* Notice:
* - Empty names/prompts are rejected
* - Prevents duplicated trim logic
*/
function normalizeManifest(manifest) {
	const name = manifest.name.trim();
	const prompt = manifest.prompt.trim();
	if (!name || !prompt) return;
	return {
		...manifest,
		name,
		prompt
	};
}
/**
* Converts parsed signal payload into observer-friendly text.
*
* Use when:
* - Observer logs need a compact human-readable parameter
*
* Notice:
* - Intentionally serializes payloads once
* - Returns undefined for empty CALL payload
*/
function parsedParameter(signal) {
	switch (signal.type) {
		case "act": return JSON.stringify(signal.payload);
		case "call": return signal.payload != null ? JSON.stringify(signal.payload) : void 0;
		case "delay": return `${signal.seconds}s`;
	}
}
/**
* Registers one CALL handler and returns its disposer.
*
* Triggering workflow:
*
* {@link createStreamingControlParser}
*   -> `LlmStreamingControl.on` or `LlmStreamingControlTurn.on`
*     -> {@link registerHandler}
*
* Upstream:
* - {@link LlmStreamingControl}
* - {@link LlmStreamingControlTurn}
*
* Downstream:
* - {@link StreamingControlTurnState} handler and manifest registries
*/
function registerHandler(container, manifest, handler) {
	const normalized = normalizeManifest(manifest);
	if (!normalized) return () => void 0;
	let registeredHandlers = container.handlers.get(normalized.name);
	if (!registeredHandlers) {
		registeredHandlers = /* @__PURE__ */ new Set();
		container.handlers.set(normalized.name, registeredHandlers);
	}
	container.callManifests.set(normalized.name, normalized);
	const registeredHandler = handler;
	registeredHandlers.add(registeredHandler);
	return () => {
		registeredHandlers.delete(registeredHandler);
		if (registeredHandlers.size === 0) {
			container.handlers.delete(normalized.name);
			container.callManifests.delete(normalized.name);
		}
	};
}
//#endregion
//#region src/llm-streaming-control/payloads.ts
/** Constant-time membership lookup. */
const emotionSet = /* @__PURE__ */ new Set([
	"happy",
	"sad",
	"angry",
	"think",
	"surprised",
	"awkward",
	"question",
	"curious",
	"neutral"
]);
/**
* Converts arbitrary emotion text into canonical emotion.
*
* Examples:
* - "Surprised" → "surprised"
* - " HAPPY " → "happy"
*/
function normalizeEmotionName(value) {
	const normalized = value.trim().toLowerCase();
	return emotionSet.has(normalized) ? normalized : void 0;
}
/**
* Normalizes intensity into [0, 1].
*
* Invalid values fallback to 1.
*
* // content of things need notice:
* // Accept numeric strings because many streaming payloads arrive serialized.
*/
function normalizeIntensity(value) {
	const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
	if (!Number.isFinite(numeric)) return 1;
	return Math.max(0, Math.min(1, numeric));
}
/**
* Converts arbitrary emotion payload into normalized structure.
*
* Supported:
* - "happy"
* - { name: "happy" }
* - { name: "happy", intensity: 0.8 }
*/
function normalizeEmotion(value) {
	if (typeof value === "string") {
		const name = normalizeEmotionName(value);
		return name ? {
			name,
			intensity: 1
		} : void 0;
	}
	if (typeof value !== "object" || value === null || Array.isArray(value)) return;
	const normalizedValue = value;
	const name = typeof normalizedValue.name === "string" ? normalizeEmotionName(normalizedValue.name) : void 0;
	if (!name) return;
	return {
		name,
		intensity: normalizeIntensity(normalizedValue.intensity)
	};
}
/**
* Trims and validates motion values.
*
* Empty strings become undefined.
*/
function normalizeMotion(value) {
	if (typeof value !== "string") return;
	const normalized = value.trim();
	return normalized.length > 0 ? normalized : void 0;
}
function normalizeDuration(value) {
	const duration = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
	return Number.isFinite(duration) && duration > 0 ? duration : void 0;
}
function normalizeExpression(value) {
	if (value === null) return null;
	if (typeof value === "string") {
		const name = value.trim();
		return name.length > 0 ? { name } : void 0;
	}
	if (typeof value !== "object" || Array.isArray(value)) return void 0;
	const expression = value;
	if (typeof expression.name !== "string") return void 0;
	const name = expression.name.trim();
	if (name.length === 0) return void 0;
	const duration = normalizeDuration(expression.duration);
	return {
		name,
		...duration !== void 0 && { duration }
	};
}
/**
* Normalizes ACT token payloads.
*
* Input:
* {
*   emotion: "Surprised",
*   motion: " nod "
* }
*
* Output:
* {
*   emotion: {
*     name: "surprised",
*     intensity: 1
*   },
*   motion: "nod"
* }
*/
function normalizeActPayload(payload) {
	const emotion = normalizeEmotion(payload.emotion);
	const expression = normalizeExpression(payload.expression);
	const motion = normalizeMotion(payload.motion);
	return {
		...emotion && { emotion },
		...expression !== void 0 && { expression },
		...motion && { motion }
	};
}
//#endregion
//#region src/managers/playback-manager.ts
/**
* Schedules playback under global and per-owner voice limits.
* Owner overflow takes precedence when both limits apply. Targeted stops remove
* matching active and queued items, then resume eligible items from other targets.
* Item IDs are unique only while active or queued; completed IDs can be reused.
*/
function createPlaybackManager(options) {
	const maxVoices = Math.max(1, options.maxVoices ?? 1);
	const maxVoicesPerOwner = options.maxVoicesPerOwner != null ? Math.max(1, options.maxVoicesPerOwner) : void 0;
	const overflowPolicy = options.overflowPolicy ?? "queue";
	const ownerOverflowPolicy = options.ownerOverflowPolicy ?? "steal-oldest";
	const active = /* @__PURE__ */ new Map();
	const waiting = [];
	const listeners = {
		start: /* @__PURE__ */ new Set(),
		end: /* @__PURE__ */ new Set(),
		interrupt: /* @__PURE__ */ new Set(),
		reject: /* @__PURE__ */ new Set()
	};
	function subscribe(bucket, listener) {
		bucket.add(listener);
		return () => {
			bucket.delete(listener);
		};
	}
	function emit(bucket, event) {
		for (const listener of [...bucket]) listener(event);
	}
	function exists(id) {
		return active.has(id) || waiting.some((x) => x.item.id === id);
	}
	function ownerCount(ownerId) {
		if (!ownerId) return 0;
		let count = 0;
		for (const x of active.values()) if (x.item.ownerId === ownerId) count++;
		return count;
	}
	function canStart(item) {
		if (maxVoicesPerOwner && item.ownerId && ownerCount(item.ownerId) >= maxVoicesPerOwner) return "owner-overflow";
		if (active.size >= maxVoices) return "overflow";
	}
	function pickVictim(predicate, compare) {
		let victim;
		for (const x of active.values()) {
			if (predicate && !predicate(x)) continue;
			if (!victim || compare && compare(x, victim)) victim = x;
		}
		return victim;
	}
	function finalize(entry, interrupted, options) {
		if (active.get(entry.item.id) !== entry) return;
		active.delete(entry.item.id);
		if (interrupted) emit(listeners.interrupt, {
			item: entry.item,
			reason: interrupted,
			interruptedAt: Date.now()
		});
		else emit(listeners.end, {
			item: entry.item,
			endedAt: Date.now()
		});
		if (options?.allowStartWaiting !== false) tryStartWaiting();
	}
	function start(item) {
		const entry = {
			item,
			controller: new AbortController(),
			startedAt: Date.now()
		};
		active.set(item.id, entry);
		emit(listeners.start, {
			item,
			startedAt: entry.startedAt
		});
		options.play(item, entry.controller.signal).then(() => {
			finalize(entry);
		}).catch((err) => {
			if (entry.controller.signal.aborted) return;
			finalize(entry, errorMessageFrom(err) ?? "playback-error");
		});
	}
	function enqueue(item) {
		const queued = {
			item,
			enqueuedAt: Date.now()
		};
		let index = waiting.findIndex((x) => x.item.priority < item.priority);
		if (index === -1) index = waiting.length;
		waiting.splice(index, 0, queued);
	}
	function resolvePolicy(blocked) {
		return blocked === "owner-overflow" ? ownerOverflowPolicy : overflowPolicy;
	}
	function handleBlocked(item, blocked) {
		switch (resolvePolicy(blocked)) {
			case "queue":
				enqueue(item);
				return;
			case "reject":
				reject(item, blocked);
				return;
			case "steal-oldest":
				stealOldest(item, blocked);
				return;
			case "steal-lowest-priority": stealLowestPriority(item);
		}
	}
	function tryStartWaiting() {
		let i = 0;
		while (i < waiting.length && active.size < maxVoices) {
			const next = waiting[i];
			const blocked = canStart(next.item);
			if (!blocked) {
				waiting.splice(i, 1);
				start(next.item);
				continue;
			}
			const policy = resolvePolicy(blocked);
			if (policy === "queue") {
				i++;
				continue;
			}
			waiting.splice(i, 1);
			switch (policy) {
				case "reject":
					reject(next.item, blocked);
					break;
				case "steal-oldest":
					stealOldest(next.item, blocked);
					break;
				case "steal-lowest-priority": stealLowestPriority(next.item);
			}
		}
	}
	function interrupt(entry, reason, options) {
		if (!active.has(entry.item.id)) return;
		entry.controller.abort(reason);
		finalize(entry, reason, options);
	}
	function reject(item, reason) {
		emit(listeners.reject, {
			item,
			reason,
			rejectedAt: Date.now()
		});
	}
	function stealOldest(item, blocked) {
		const victim = pickVictim(blocked === "owner-overflow" ? (x) => x.item.ownerId === item.ownerId : void 0, (a, b) => a.startedAt < b.startedAt);
		if (!victim) {
			enqueue(item);
			return;
		}
		interrupt(victim, "overflow", { allowStartWaiting: false });
		const recheck = canStart(item);
		if (!recheck) {
			start(item);
			return;
		}
		handleBlocked(item, recheck);
	}
	function stealLowestPriority(item) {
		const victim = pickVictim(void 0, (a, b) => a.item.priority < b.item.priority);
		if (!(!!victim && victim.item.priority < item.priority)) {
			reject(item, "priority-overflow");
			return;
		}
		interrupt(victim, "priority-overflow", { allowStartWaiting: false });
		const recheck = canStart(item);
		if (!recheck) {
			start(item);
			return;
		}
		handleBlocked(item, recheck);
	}
	function schedule(item) {
		if (exists(item.id)) return;
		const blocked = canStart(item);
		if (!blocked) {
			start(item);
			return;
		}
		handleBlocked(item, blocked);
	}
	function stopByIntent(intentId, reason = "stop-by-intent") {
		for (let i = waiting.length - 1; i >= 0; i--) if (waiting[i]?.item.intentId === intentId) waiting.splice(i, 1);
		for (const entry of [...active.values()]) if (entry.item.intentId === intentId) interrupt(entry, reason, { allowStartWaiting: false });
		tryStartWaiting();
	}
	function stopByOwner(ownerId, reason = "stop-by-owner") {
		for (let i = waiting.length - 1; i >= 0; i--) if (waiting[i]?.item.ownerId === ownerId) waiting.splice(i, 1);
		for (const entry of [...active.values()]) if (entry.item.ownerId === ownerId) interrupt(entry, reason, { allowStartWaiting: false });
		tryStartWaiting();
	}
	return {
		schedule,
		stopAll(reason = "stop-all") {
			waiting.length = 0;
			for (const x of [...active.values()]) interrupt(x, reason, { allowStartWaiting: false });
		},
		stopByIntent,
		stopByOwner,
		onStart: (f) => subscribe(listeners.start, f),
		onEnd: (f) => subscribe(listeners.end, f),
		onInterrupt: (f) => subscribe(listeners.interrupt, f),
		onReject: (f) => subscribe(listeners.reject, f)
	};
}
//#endregion
//#region src/playback.ts
function releaseClip(clip) {
	if (clip.audio instanceof ReadableStream) return clip.audio.cancel("Playback discarded the clip").catch(() => {});
}
var OutputGroup = class {
	driver;
	label;
	id = nanoid();
	completion = Promise.withResolvers();
	pending = [];
	played = /* @__PURE__ */ new Map();
	ids = /* @__PURE__ */ new Set();
	active;
	sealed = false;
	stopping = false;
	settled = false;
	constructor(driver, label) {
		this.driver = driver;
		this.label = label;
	}
	enqueue(clip) {
		if (clip.startAtMs !== void 0 && !Number.isFinite(clip.startAtMs)) {
			releaseClip(clip);
			throw new Error("Clip start time must be finite");
		}
		if (this.sealed || clip.signal?.aborted) {
			releaseClip(clip);
			return Promise.resolve("stopped");
		}
		if (this.ids.has(clip.id)) {
			releaseClip(clip);
			return Promise.resolve("failed");
		}
		this.ids.add(clip.id);
		const entry = {
			clip,
			result: Promise.withResolvers()
		};
		this.pending.push(entry);
		this.next();
		return entry.result.promise;
	}
	finish() {
		this.sealed = true;
		this.next();
		return this.completion.promise;
	}
	stop(options) {
		if (!Number.isFinite(options.fadeMs) || options.fadeMs < 0) throw new Error("Fade duration must be finite and nonnegative");
		if (this.stopping || this.settled) return this.completion.promise;
		this.sealed = true;
		this.stopping = true;
		for (const entry of this.pending.splice(0)) {
			releaseClip(entry.clip);
			entry.result.resolve("stopped");
		}
		const active = this.active;
		if (!active) this.complete();
		else Promise.resolve().then(() => active.audio.stop(options)).then((receipt) => {
			active.release();
			this.played.set(active.entry.clip.id, receipt);
			active.entry.result.resolve("stopped");
			this.active = void 0;
			this.complete();
		}, (cause) => this.fail(cause));
		return this.completion.promise;
	}
	/** Triggering workflow: group enqueue or driver completion → next owned clip → platform playback. */
	next() {
		if (this.active || this.settled || this.stopping) return;
		let entry = this.pending.shift();
		while (entry?.clip.signal?.aborted) {
			releaseClip(entry.clip);
			entry.result.resolve("stopped");
			entry = this.pending.shift();
		}
		if (!entry) {
			if (this.sealed) this.complete();
			return;
		}
		try {
			const active = {
				entry,
				audio: this.driver.play(entry.clip),
				release: () => {}
			};
			this.active = active;
			let cancelled = false;
			const finish = (receipt, status) => {
				active.release();
				if (this.active !== active || this.stopping) return;
				this.played.set(active.entry.clip.id, receipt);
				active.entry.result.resolve(status);
				this.active = void 0;
				this.next();
			};
			const abort = () => {
				if (this.stopping || this.active !== active || cancelled) return;
				cancelled = true;
				Promise.resolve().then(() => active.audio.stop({ fadeMs: 0 })).then((receipt) => finish(receipt, "stopped"), (cause) => this.fail(cause));
			};
			active.release = () => active.entry.clip.signal?.removeEventListener("abort", abort);
			active.entry.clip.signal?.addEventListener("abort", abort, { once: true });
			active.audio.done.then((receipt) => {
				if (!cancelled) finish(receipt, "ended");
			}, (cause) => this.fail(cause));
			if (active.entry.clip.signal?.aborted) abort();
		} catch (cause) {
			releaseClip(entry.clip);
			entry.result.resolve("failed");
			this.fail(cause);
		}
	}
	fail(cause) {
		if (this.settled) return;
		this.sealed = true;
		this.active?.release();
		this.active?.entry.result.resolve("failed");
		this.active = void 0;
		this.pending.splice(0).forEach((entry) => {
			releaseClip(entry.clip);
			entry.result.resolve("failed");
		});
		this.complete(cause instanceof Error ? cause : new Error("Playback failed", { cause }));
	}
	complete(error) {
		if (this.settled) return;
		this.settled = true;
		const played = [...this.played].map(([clipId, audio]) => ({
			clipId,
			...audio
		}));
		this.completion.resolve(error ? {
			groupId: this.id,
			played,
			status: "failed",
			error
		} : {
			groupId: this.id,
			played,
			status: "silent"
		});
	}
};
/** Keeps group queues independent. It does not interpret speech signals or notify an agent. */
var Playback = class {
	driver;
	/**
	* The played audio as a shared input, for observers such as a level meter. Undefined when the driver cannot read its output.
	*
	* The first subscriber opens the tap of the driver and the last one closes it, so an unobserved playback costs nothing.
	*/
	output;
	connect;
	constructor(driver) {
		this.driver = driver;
		this.output = driver.output ? new AudioInput(driver.output) : void 0;
		this.connect = driver.connect ? (node) => driver.connect(node) : void 0;
	}
	nowMs() {
		return this.driver.nowMs();
	}
	openGroup(label) {
		return new OutputGroup(this.driver, label);
	}
};
//#endregion
//#region src/priority.ts
const DEFAULT_LEVELS = {
	critical: 300,
	high: 200,
	normal: 100,
	low: 0
};
function createPriorityResolver(levels) {
	const resolved = {
		...DEFAULT_LEVELS,
		...levels
	};
	return { resolve(priority) {
		if (priority == null) return resolved.normal;
		if (typeof priority === "number") return priority;
		return resolved[priority] ?? resolved.normal;
	} };
}
function comparePriority(a, b) {
	if (a === b) return 0;
	return a > b ? 1 : -1;
}
//#endregion
//#region src/processors/tts-chunker.ts
const TTS_FLUSH_INSTRUCTION = "​";
const TTS_SPECIAL_TOKEN = "⁣";
const regexpAnySingleDigit = /\d/;
/** A character that continues a token after a `.`, as in an address or a file path. */
const regexpTokenContinuation = /[\p{L}\p{N}_~/\\%@-]/u;
const regexpCjk = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
/**
* A chunk without a letter, a digit, or an emoji, as a lone closing quote `”`, has no sound and is not a TTS request.
* Emoji stay, because some providers read them.
*/
const regexpSound = /[\p{L}\p{N}\p{Extended_Pictographic}]/u;
const hardPunctuations = /* @__PURE__ */ new Set(".。?？!！…⋯～~\n	\r");
const softPunctuations = /* @__PURE__ */ new Set(",，、–—:：;；《》「」");
const regexpKana = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;
/**
* Whether a length limit can end a chunk at `punctuation`.
*
* Chinese `、` separates the items of a list, as in 网络、地址解析, and a voice does not pause at it. Japanese `、` is a
* comma, so text with kana can end there. A chunk of twice the word limit can end at `、` too, so a long list does not
* make one long TTS request.
*/
function canEndAtLimit(punctuation, text, words, maximumWords) {
	return punctuation !== "、" || regexpKana.test(text) || words > 2 * maximumWords;
}
async function* chunkTtsInput(input, options) {
	const { boost = 2, minimumWords = 4, maximumWords = 12 } = options ?? {};
	const iterator = readGraphemeClusters(typeof input === "string" ? new ReadableStream({ start(controller) {
		controller.enqueue(new TextEncoder().encode(input));
		controller.close();
	} }).getReader() : input);
	const segmenter = new Intl.Segmenter(void 0, { granularity: "word" });
	let yieldCount = 0;
	let buffer = "";
	let chunk = "";
	let chunkWordsCount = 0;
	let previousValue;
	let current = await iterator.next();
	while (!current.done) {
		let value = current.value;
		if (value === "\r\n") value = "\n";
		const flush = value === "​";
		const special = value === "⁣";
		const hard = hardPunctuations.has(value);
		const soft = softPunctuations.has(value);
		let next;
		let afterNext;
		if (flush || special || hard || soft) {
			switch (value) {
				case ".":
				case ",": {
					next = await iterator.next();
					const following = next.done ? void 0 : next.value;
					const inNumber = previousValue !== void 0 && regexpAnySingleDigit.test(previousValue) && following !== void 0 && regexpAnySingleDigit.test(following);
					const inToken = value === "." && following !== void 0 && regexpTokenContinuation.test(following) && !regexpCjk.test(following);
					if (inNumber || inToken) {
						buffer += value;
						current = next;
						next = void 0;
						continue;
					}
					if (value === "." && following === ".") {
						afterNext = await iterator.next();
						if (!afterNext.done && afterNext.value && afterNext.value === ".") {
							value = "…";
							next = void 0;
							afterNext = void 0;
						}
					}
				}
			}
			if (buffer.length === 0) {
				if (special) {
					yield {
						text: "",
						words: 0,
						reason: "special"
					};
					yieldCount++;
					chunkWordsCount = 0;
				}
				previousValue = value;
				current = await iterator.next();
				continue;
			}
			const words = [...segmenter.segment(buffer)].filter((w) => w.isWordLike);
			if (chunkWordsCount > minimumWords && chunkWordsCount + words.length > maximumWords && canEndAtLimit(chunk.at(-1), chunk, chunkWordsCount + words.length, maximumWords)) {
				const text = chunk.trim();
				if (regexpSound.test(text)) {
					yield {
						text,
						words: chunkWordsCount,
						reason: "limit"
					};
					yieldCount++;
				}
				chunk = "";
				chunkWordsCount = 0;
			}
			chunk += buffer + value;
			chunkWordsCount += words.length;
			buffer = "";
			if (special) {
				yield {
					text: chunk.slice(0, -1).trim(),
					words: chunkWordsCount,
					reason: "special"
				};
				yieldCount++;
				chunk = "";
				chunkWordsCount = 0;
			} else if (flush || hard || chunkWordsCount > maximumWords && canEndAtLimit(value, chunk, chunkWordsCount, maximumWords) || yieldCount < boost && chunkWordsCount >= minimumWords) {
				const text = chunk.trim();
				if (regexpSound.test(text)) {
					yield {
						text,
						words: chunkWordsCount,
						reason: flush ? "flush" : hard ? "hard" : chunkWordsCount > maximumWords ? "limit" : "boost"
					};
					yieldCount++;
				}
				chunk = "";
				chunkWordsCount = 0;
			}
			previousValue = value;
			if (next !== void 0) {
				if (afterNext !== void 0) {
					current = afterNext;
					next = void 0;
					afterNext = void 0;
				} else {
					current = next;
					next = void 0;
				}
			} else current = await iterator.next();
			continue;
		}
		buffer += value;
		previousValue = value;
		next = await iterator.next();
		current = next;
	}
	if (regexpSound.test(chunk + buffer)) yield {
		text: (chunk + buffer).trim(),
		words: chunkWordsCount + [...segmenter.segment(buffer)].filter((w) => w.isWordLike).length,
		reason: "flush"
	};
}
async function chunkEmitter(reader, pendingSpecials, options, handler) {
	function sanitizeChunk(text) {
		return text.replaceAll("⁣", "").replaceAll("​", "").trim();
	}
	try {
		for await (const chunk of chunkTtsInput(reader, options)) {
			const cleanedText = sanitizeChunk(chunk.text);
			if (!cleanedText && chunk.reason !== "special") continue;
			if (chunk.reason === "special") await handler({
				chunk: cleanedText,
				special: pendingSpecials.shift() ?? null,
				reason: chunk.reason
			});
			else await handler({
				chunk: cleanedText,
				special: null,
				reason: chunk.reason
			});
		}
	} catch (e) {
		console.error("Error chunking stream to TTS queue:", e);
	}
}
const BRACKET_MAP = {
	"[": "]",
	"(": ")",
	"（": "）",
	"【": "】",
	"<": ">"
};
const OPENERS = Object.keys(BRACKET_MAP);
const CLOSERS = Object.values(BRACKET_MAP);
const isUnicodeLetter = (char) => /\p{L}/u.test(char);
const NARRATIVE_KEYWORDS = [
	"laugh",
	"sigh",
	"action",
	"note",
	"breath",
	"giggle",
	"whisper",
	"cry",
	"smile",
	"thought"
];
function isProbablyAngleTag(index, text) {
	if (text[index] !== "<") return false;
	if (text[index + 1] === "/") return true;
	const remainder = text.slice(index + 1).toLowerCase();
	const nextChar = remainder[0];
	const prevChar = index > 0 ? text[index - 1] : "";
	if (nextChar === "/") return true;
	if (nextChar && /[0-9\s=]/.test(nextChar)) return false;
	if (prevChar && (isUnicodeLetter(prevChar) || /\d/.test(prevChar))) return NARRATIVE_KEYWORDS.some((kw) => remainder.length > 1 && kw.startsWith(remainder) || remainder.startsWith(kw));
	if (prevChar && /[^\s([{（【<\])}>）】.,!?;:，。！？；：'"\-_]/.test(prevChar)) return false;
	return true;
}
function processNarrative(text, options) {
	if (!options?.stripNarrative) return text;
	const rangesToRemove = [];
	const charsToRemove = /* @__PURE__ */ new Set();
	const stack = [];
	let starOpenIndex = -1;
	for (let i = 0; i < text.length; i++) {
		const char = text[i];
		if (char === "*") {
			if (starOpenIndex !== -1) {
				if (options?.keepNarrativeText) {
					charsToRemove.add(starOpenIndex);
					charsToRemove.add(i);
				} else rangesToRemove.push([starOpenIndex, i]);
				starOpenIndex = -1;
			} else if (!/\s/.test(text[i + 1] || "")) starOpenIndex = i;
			continue;
		}
		if (OPENERS.includes(char)) {
			if (char === "<" && !isProbablyAngleTag(i, text)) continue;
			stack.push({
				char,
				index: i
			});
			continue;
		}
		if (CLOSERS.includes(char)) {
			const last = stack[stack.length - 1];
			if (last && BRACKET_MAP[last.char] === char) {
				stack.pop();
				if (options?.keepNarrativeText) {
					charsToRemove.add(last.index);
					charsToRemove.add(i);
				} else rangesToRemove.push([last.index, i]);
			}
		}
	}
	let result = "";
	if (options?.keepNarrativeText) {
		for (let i = 0; i < text.length; i++) if (!charsToRemove.has(i)) result += text[i];
		return result;
	}
	rangesToRemove.sort((a, b) => a[0] - b[0]);
	let rangeIndex = 0;
	for (let i = 0; i < text.length; i++) {
		while (rangeIndex < rangesToRemove.length && i > rangesToRemove[rangeIndex][1]) rangeIndex += 1;
		const activeRange = rangesToRemove[rangeIndex];
		if (activeRange && i >= activeRange[0] && i <= activeRange[1]) continue;
		result += text[i];
	}
	return result;
}
function createTtsSegmentStream(tokens, meta, options) {
	const { stream, write, close, error } = createPushStream();
	const pendingSpecials = [];
	const encoder = new TextEncoder();
	const { stream: byteStream, write: writeBytes, close: closeBytes, error: errorBytes } = createPushStream();
	(async () => {
		const reader = tokens.getReader();
		let pendingText = "";
		try {
			while (true) {
				const { value, done } = await reader.read();
				if (done) break;
				if (!value) continue;
				if (value.type === "literal") {
					if (value.value) {
						if (!options?.stripNarrative) {
							writeBytes(encoder.encode(value.value));
							continue;
						}
						pendingText += value.value;
						const stack = [];
						for (let i = 0; i < pendingText.length; i++) {
							const char = pendingText[i];
							if (OPENERS.includes(char)) {
								if (char === "<" && !isProbablyAngleTag(i, pendingText)) continue;
								stack.push(char);
							} else if (CLOSERS.includes(char)) {
								const lastOpen = stack[stack.length - 1];
								if (lastOpen && BRACKET_MAP[lastOpen] === char) stack.pop();
							}
						}
						const bracketsUnclosed = stack.length > 0;
						const starMatch = pendingText.match(/\*([^*]*)$/);
						const starsUnclosed = (pendingText.match(/\*/g) || []).length % 2 !== 0 && starMatch !== null && !starMatch[1].startsWith(" ");
						const hasUnclosed = bracketsUnclosed || starsUnclosed;
						const hasNarrativeUnclosed = stack.some((char) => [
							"[",
							"【",
							"<",
							"（"
						].includes(char));
						const fallbackLimit = options?.stripNarrative && hasNarrativeUnclosed ? 800 : 200;
						if (!hasUnclosed || pendingText.length > fallbackLimit) {
							const textToEmit = processNarrative(pendingText, options);
							writeBytes(encoder.encode(textToEmit));
							pendingText = "";
						}
					}
				} else if (value.type === "special" || value.type === "flush") {
					if (pendingText) {
						const textToEmit = processNarrative(pendingText, options);
						writeBytes(encoder.encode(textToEmit));
						pendingText = "";
					}
					if (value.type === "special") {
						pendingSpecials.push(value.value ?? "");
						writeBytes(encoder.encode("⁣"));
					} else if (value.type === "flush") writeBytes(encoder.encode("​"));
				}
			}
			if (pendingText) {
				let finalPunt = pendingText;
				if (options?.stripNarrative) finalPunt = processNarrative(finalPunt, options);
				writeBytes(encoder.encode(finalPunt));
			}
			closeBytes();
		} catch (err) {
			errorBytes(err);
		} finally {
			reader.releaseLock();
		}
	})();
	(async () => {
		const reader = byteStream.getReader();
		try {
			await chunkEmitter(reader, pendingSpecials, options, async (chunk) => {
				write({
					turnId: meta.turnId,
					streamId: meta.streamId,
					intentId: meta.intentId,
					segmentId: `${meta.streamId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
					text: chunk.chunk,
					special: chunk.special,
					reason: chunk.reason,
					createdAt: Date.now()
				});
			});
			close();
		} catch (err) {
			error(err);
		} finally {
			reader.releaseLock();
		}
	})();
	return stream;
}
//#endregion
//#region src/timeline.ts
function createDefaultClock() {
	return {
		now: () => Date.now(),
		sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms))
	};
}
function createId$1(prefix) {
	return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
/**
* Creates a thin named-track timeline for ordering async media/control work.
*
* Use when:
* - Multiple async queues need a shared ordering clock
* - Items on the same named track must execute serially
*
* Expects:
* - Item handlers own their business side effects
* - Cancellation is cooperative through the provided signal
*
* Returns:
* - A scheduler that serializes each track while allowing different tracks to run concurrently
*/
function createTimeline(options) {
	const clock = options?.clock ?? createDefaultClock();
	const trackTails = /* @__PURE__ */ new Map();
	function enqueue(item) {
		const id = item.id ?? createId$1("timeline");
		const controller = new AbortController();
		const previous = trackTails.get(item.track);
		const run = async () => {
			if (controller.signal.aborted) return;
			await item.run({
				clock,
				signal: controller.signal
			});
		};
		const done = previous ? previous.catch(() => void 0).then(run) : run();
		trackTails.set(item.track, done.catch(() => void 0));
		return {
			id,
			track: item.track,
			done,
			cancel(reason) {
				controller.abort(reason);
			}
		};
	}
	async function flush(track) {
		if (track) {
			await trackTails.get(track);
			return;
		}
		await Promise.all(trackTails.values());
	}
	return {
		clock,
		enqueue,
		flush
	};
}
//#endregion
//#region src/speech-pipeline.ts
function createId(prefix) {
	return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
function createSpeechPipeline(options) {
	const logger = options.logger ?? console;
	const priorityResolver = options.priority ?? createPriorityResolver();
	const segmenter = options.segmenter ?? createTtsSegmentStream;
	const ttsMaxConcurrent = Math.max(1, options.ttsMaxConcurrent ?? 4);
	const context = createContext();
	const timeline = createTimeline();
	const intents = /* @__PURE__ */ new Map();
	const pending = [];
	let activeIntent = null;
	const playbackWaiters = /* @__PURE__ */ new Map();
	function resolvePlayback(itemId) {
		const resolve = playbackWaiters.get(itemId);
		if (!resolve) return;
		playbackWaiters.delete(itemId);
		resolve();
	}
	options.playback.onStart((event) => context.emit(speechPipelineEventMap.onPlaybackStart, event));
	options.playback.onEnd((event) => {
		context.emit(speechPipelineEventMap.onPlaybackEnd, event);
		resolvePlayback(event.item.id);
	});
	options.playback.onInterrupt((event) => {
		context.emit(speechPipelineEventMap.onPlaybackInterrupt, event);
		resolvePlayback(event.item.id);
	});
	options.playback.onReject((event) => {
		context.emit(speechPipelineEventMap.onPlaybackReject, event);
		resolvePlayback(event.item.id);
	});
	function waitForPlayback(item) {
		return new Promise((resolve) => {
			playbackWaiters.set(item.id, resolve);
			try {
				options.playback.schedule(item);
			} catch (err) {
				playbackWaiters.delete(item.id);
				logger.warn("Playback schedule failed:", err);
				resolve();
			}
		});
	}
	function enqueueIntent(intent) {
		pending.push(intent);
	}
	function pickNextIntent() {
		if (pending.length === 0) return null;
		pending.sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt);
		return pending.shift() ?? null;
	}
	async function runIntent(intent) {
		activeIntent = intent;
		context.emit(speechPipelineEventMap.onIntentStart, intent.intentId);
		if (intent.turnId) context.emit(speechPipelineEventMap.onTurnStart, intent.turnId);
		const tokenStream = intent.stream;
		const segmentStream = segmenter(tokenStream, {
			streamId: intent.streamId,
			intentId: intent.intentId,
			turnId: intent.turnId
		});
		const completedRequests = /* @__PURE__ */ new Map();
		const inFlightTasks = /* @__PURE__ */ new Set();
		let nextRequestSequence = 0;
		let nextSequenceToSchedule = 0;
		function enqueueSpecial(segment) {
			timeline.enqueue({
				id: `special:${segment.segmentId}`,
				track: "speech",
				run() {
					if (intent.canceled || intent.controller.signal.aborted) return;
					context.emit(speechPipelineEventMap.onSpecial, segment);
				}
			});
		}
		function enqueuePlayback(item) {
			timeline.enqueue({
				id: `playback:${item.id}`,
				track: "speech",
				async run() {
					if (intent.canceled || intent.controller.signal.aborted) return;
					await waitForPlayback(item);
					if (intent.canceled || intent.controller.signal.aborted) return;
					if (item.special) context.emit(speechPipelineEventMap.onSpecial, {
						turnId: item.turnId,
						streamId: item.streamId,
						intentId: item.intentId,
						segmentId: item.segmentId,
						text: item.text,
						special: item.special,
						reason: "special",
						createdAt: item.createdAt
					});
				}
			});
		}
		function scheduleCompletedRequests() {
			while (completedRequests.has(nextSequenceToSchedule)) {
				const completedRequest = completedRequests.get(nextSequenceToSchedule) ?? null;
				completedRequests.delete(nextSequenceToSchedule);
				if (completedRequest) enqueuePlayback({
					id: createId("playback"),
					turnId: completedRequest.turnId,
					streamId: completedRequest.streamId,
					intentId: completedRequest.intentId,
					segmentId: completedRequest.segmentId,
					sequence: completedRequest.sequence,
					ownerId: intent.ownerId,
					priority: intent.priority,
					text: completedRequest.text,
					special: completedRequest.special,
					audio: completedRequest.audio,
					createdAt: Date.now()
				});
				nextSequenceToSchedule += 1;
			}
		}
		function createTtsTask(request) {
			const task = (async () => {
				let audio = null;
				try {
					audio = await options.tts(request, intent.controller.signal);
				} catch (err) {
					logger.warn("TTS generation failed:", err);
					if (intent.controller.signal.aborted) return;
				}
				if (intent.controller.signal.aborted) {
					completedRequests.set(request.sequence, null);
					scheduleCompletedRequests();
					return;
				}
				if (!audio) {
					completedRequests.set(request.sequence, null);
					scheduleCompletedRequests();
					return;
				}
				const ttsResult = {
					turnId: request.turnId,
					streamId: request.streamId,
					intentId: request.intentId,
					segmentId: request.segmentId,
					sequence: request.sequence,
					text: request.text,
					special: request.special,
					audio,
					createdAt: Date.now()
				};
				context.emit(speechPipelineEventMap.onTtsResult, ttsResult);
				completedRequests.set(request.sequence, ttsResult);
				scheduleCompletedRequests();
			})().finally(() => {
				inFlightTasks.delete(task);
			});
			inFlightTasks.add(task);
			return task;
		}
		try {
			const reader = segmentStream.getReader();
			while (true) {
				while (!intent.controller.signal.aborted && inFlightTasks.size >= ttsMaxConcurrent) await Promise.race(inFlightTasks);
				const { value, done } = await reader.read();
				if (done) break;
				if (!value) continue;
				if (intent.canceled || intent.controller.signal.aborted) {
					await reader.cancel();
					break;
				}
				context.emit(speechPipelineEventMap.onSegment, value);
				if (value.text === "" && value.special) {
					enqueueSpecial(value);
					continue;
				}
				const request = {
					turnId: value.turnId,
					streamId: value.streamId,
					intentId: value.intentId,
					segmentId: value.segmentId,
					sequence: nextRequestSequence++,
					text: value.text,
					special: value.special,
					reason: value.reason,
					priority: intent.priority,
					createdAt: Date.now()
				};
				context.emit(speechPipelineEventMap.onTtsRequest, request);
				createTtsTask(request);
			}
			await Promise.allSettled(inFlightTasks);
			scheduleCompletedRequests();
			await timeline.flush("speech");
			reader.releaseLock();
		} catch (err) {
			logger.warn("Speech pipeline intent failed:", err);
		} finally {
			if (intent.canceled) {
				context.emit(speechPipelineEventMap.onIntentCancel, {
					intentId: intent.intentId,
					reason: intent.controller.signal.reason?.toString()
				});
				if (intent.turnId) context.emit(speechPipelineEventMap.onTurnCancel, {
					turnId: intent.turnId,
					reason: intent.controller.signal.reason?.toString()
				});
			} else {
				context.emit(speechPipelineEventMap.onIntentEnd, intent.intentId);
				if (intent.turnId) context.emit(speechPipelineEventMap.onTurnEnd, intent.turnId);
			}
			intents.delete(intent.intentId);
			if (activeIntent?.intentId === intent.intentId) activeIntent = null;
			if (!activeIntent) {
				const next = pickNextIntent();
				if (next) runIntent(next);
			}
		}
	}
	function openIntent(optionsInput) {
		const intentId = optionsInput?.intentId ?? createId("intent");
		const turnId = optionsInput?.turnId;
		const streamId = optionsInput?.streamId ?? createId("stream");
		const priority = priorityResolver.resolve(optionsInput?.priority);
		const behavior = optionsInput?.behavior ?? "queue";
		const ownerId = optionsInput?.ownerId;
		const controller = new AbortController();
		const { stream, write, close } = createPushStream();
		let sequence = 0;
		const intent = {
			turnId,
			intentId,
			streamId,
			priority,
			ownerId,
			behavior,
			createdAt: Date.now(),
			controller,
			stream,
			closeStream: close,
			canceled: false
		};
		intents.set(intentId, intent);
		const handle = {
			turnId,
			intentId,
			streamId,
			priority,
			ownerId,
			stream,
			writeLiteral(text) {
				if (intent.canceled) return;
				write({
					type: "literal",
					value: text,
					turnId,
					streamId,
					intentId,
					sequence: sequence++,
					createdAt: Date.now()
				});
			},
			writeSpecial(special) {
				if (intent.canceled) return;
				write({
					type: "special",
					value: special,
					turnId,
					streamId,
					intentId,
					sequence: sequence++,
					createdAt: Date.now()
				});
			},
			writeFlush() {
				if (intent.canceled) return;
				write({
					type: "flush",
					turnId,
					streamId,
					intentId,
					sequence: sequence++,
					createdAt: Date.now()
				});
			},
			end() {
				close();
			},
			cancel(reason) {
				cancelIntent(intentId, reason);
			}
		};
		if (!activeIntent) {
			runIntent(intent);
			return handle;
		}
		if (behavior === "replace") {
			cancelIntent(activeIntent.intentId, "replace");
			runIntent(intent);
			return handle;
		}
		if (behavior === "interrupt" && intent.priority >= activeIntent.priority) {
			cancelIntent(activeIntent.intentId, "interrupt");
			runIntent(intent);
			return handle;
		}
		enqueueIntent(intent);
		return handle;
	}
	function cancelIntent(intentId, reason) {
		const intent = intents.get(intentId);
		if (!intent) return;
		intent.canceled = true;
		intent.controller.abort(reason ?? "canceled");
		intent.closeStream();
		if (activeIntent?.intentId === intentId) {
			options.playback.stopByIntent(intentId, reason ?? "canceled");
			return;
		}
		const index = pending.findIndex((item) => item.intentId === intentId);
		if (index >= 0) pending.splice(index, 1);
	}
	function interrupt(reason) {
		if (activeIntent) cancelIntent(activeIntent.intentId, reason);
	}
	function stopAll(reason) {
		for (const intent of intents.values()) {
			intent.canceled = true;
			intent.controller.abort(reason);
			intent.closeStream();
		}
		pending.length = 0;
		intents.clear();
		activeIntent = null;
		options.playback.stopAll(reason);
	}
	return {
		openIntent,
		cancelIntent,
		interrupt,
		stopAll,
		on(event, listener) {
			const typedListener = listener;
			return context.on(speechPipelineEventMap[event], (payload) => {
				typedListener(payload?.body ?? payload);
			});
		}
	};
}
//#endregion
export { AudioInput, Playback, TTS_FLUSH_INSTRUCTION, TTS_SPECIAL_TOKEN, audioWindows, capture, chunkEmitter, chunkTtsInput, comparePriority, createPlaybackManager, createPriorityResolver, createSpeechPipeline, createStreamingControlParser, createTimeline, createTtsSegmentStream, isProbablyAngleTag, levelOf, normalizeActPayload, observe, observeLevel, processNarrative, speechIntentCancelEvent, speechIntentEndEvent, speechIntentStartEvent, speechPipelineEventMap, speechPlaybackEndEvent, speechPlaybackInterruptEvent, speechPlaybackRejectEvent, speechPlaybackStartEvent, speechSegmentEvent, speechSpecialEvent, speechTtsRequestEvent, speechTtsResultEvent, speechTurnCancelEvent, speechTurnEndEvent, speechTurnStartEvent };
