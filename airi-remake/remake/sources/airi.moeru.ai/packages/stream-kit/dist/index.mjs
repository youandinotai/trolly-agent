//#region src/batcher.ts
const scheduleTimeout = (callback, delayMs) => {
	const timer = setTimeout(callback, delayMs);
	return () => clearTimeout(timer);
};
/**
* Groups items into batches, like `groupedWithin`. A batch flushes when it has `maxItems` items, or `maxWaitMs`
* after its first item, whichever comes first.
*
* @example
* const batcher = createBatcher<TraceRecord>({ maxWaitMs: 50, maxItems: 500, flush: records => send({ records }) })
* batcher.push(record)
*/
function createBatcher(options) {
	const maxItems = options.maxItems ?? Number.POSITIVE_INFINITY;
	if (!Number.isFinite(options.maxWaitMs) || options.maxWaitMs < 0) throw new Error("maxWaitMs must be finite and nonnegative");
	if (maxItems < 1) throw new Error("maxItems must be at least 1");
	const schedule = options.schedule ?? scheduleTimeout;
	let items = [];
	let deadline = 0;
	let cancelTimer;
	let closed = false;
	function flush() {
		cancelTimer?.();
		cancelTimer = void 0;
		if (items.length === 0) return;
		const batch = items;
		items = [];
		options.flush(batch);
	}
	function push(item) {
		if (closed) return;
		if (items.length > 0 && options.now && options.now() >= deadline) flush();
		items.push(item);
		if (items.length >= maxItems) {
			flush();
			return;
		}
		if (items.length === 1) {
			deadline = (options.now?.() ?? 0) + options.maxWaitMs;
			cancelTimer = schedule(flush, options.maxWaitMs);
		}
	}
	return {
		push,
		flush,
		close() {
			closed = true;
			flush();
		}
	};
}
//#endregion
//#region src/catch-up-feed.ts
/**
* A live feed in which a new subscriber first receives the backlog, then `caughtUp`, then the live messages.
*
* Guarantee: no message is lost or repeated between the backlog and the live messages, if the owner updates the
* state behind `backlog` before each `publish`. `subscribe` copies the backlog first. A `publish` during the backlog
* delivery, for example from a listener, waits and goes to the new subscriber after `caughtUp`. A subscriber added
* during a `publish` does not receive that message live, because its backlog already has it.
*
* The backlog and `caughtUp` always arrive synchronously inside `subscribe`. The strategy applies to live messages.
*
* @example
* const feed = createCatchUpFeed<Message>({ backlog: () => buffer.values(), caughtUp: () => ({ kind: 'caughtUp' }) })
* buffer.push(record)
* feed.publish({ kind: 'record', record })
*/
function createCatchUpFeed(options) {
	const subscribers = /* @__PURE__ */ new Set();
	function publish(message) {
		for (const subscriber of [...subscribers]) {
			if (!subscriber.active) continue;
			if (subscriber.held) subscriber.held.push(message);
			else subscriber.deliver(message);
		}
	}
	function subscribe(listener, subscribeOptions = {}) {
		const strategy = subscribeOptions.strategy ?? "unbounded";
		const subscriber = {
			listener,
			active: true,
			held: [],
			deliver: listener
		};
		if (strategy !== "unbounded") subscriber.deliver = createBoundedDelivery(subscriber, strategy, subscribeOptions.capacity ?? 256);
		const backlog = [...options.backlog()];
		if (options.caughtUp) backlog.push(options.caughtUp());
		subscribers.add(subscriber);
		const unsubscribe = () => {
			subscriber.active = false;
			subscriber.held = void 0;
			subscribers.delete(subscriber);
		};
		try {
			for (const message of backlog) listener(message);
			const held = subscriber.held;
			for (let index = 0; index < held.length; index++) subscriber.deliver(held[index]);
			subscriber.held = void 0;
		} catch (error) {
			unsubscribe();
			throw error;
		}
		return { unsubscribe };
	}
	return {
		publish,
		subscribe,
		get subscribers() {
			return subscribers.size;
		}
	};
}
function createBoundedDelivery(subscriber, strategy, capacity) {
	if (!Number.isInteger(capacity) || capacity < 1) throw new Error("capacity must be a positive integer");
	const queue = [];
	let scheduled = false;
	function drain() {
		scheduled = false;
		while (subscriber.active && queue.length > 0) {
			const message = queue.shift();
			try {
				subscriber.listener(message);
			} catch (error) {
				if (queue.length > 0) schedule();
				throw error;
			}
		}
		queue.length = 0;
	}
	function schedule() {
		if (!scheduled) {
			scheduled = true;
			queueMicrotask(drain);
		}
	}
	return (message) => {
		if (queue.length >= capacity) {
			if (strategy === "dropping") return;
			queue.shift();
		}
		queue.push(message);
		schedule();
	};
}
//#endregion
//#region src/cooldown.ts
/**
* Limits an action to once per window for each key, for example one flight recorder dump per source.
*
* The cooldown keeps one time for each key that it has seen.
*
* @example
* const cooldown = createCooldown({ ms: 30_000 })
* if (cooldown.tryAcquire(source, now))
*   dump()
*/
function createCooldown(options) {
	const acquiredAt = /* @__PURE__ */ new Map();
	return { tryAcquire(key, now) {
		const last = acquiredAt.get(key);
		if (last !== void 0 && now - last < options.ms) return false;
		acquiredAt.set(key, now);
		return true;
	} };
}
//#endregion
//#region src/demand-union.ts
const ALL = "*";
/**
* The union of what each member wants, for example the tracks of all viewers.
*
* A producer reads the union to skip work that no member wants. One `'*'` member makes the union `'*'`.
*
* @example
* const demand = new DemandUnion<string>({ onChange: union => source.setWanted(union) })
* demand.set('viewer-1', ['audio.level'])
* demand.set('viewer-2', '*') // onChange('*')
* demand.delete('viewer-2') // onChange(Set { 'audio.level' })
*/
var DemandUnion = class {
	options;
	members = /* @__PURE__ */ new Map();
	current = /* @__PURE__ */ new Set();
	constructor(options = {}) {
		this.options = options;
	}
	get union() {
		return this.current;
	}
	set(id, demand) {
		this.members.set(id, demand === ALL ? ALL : new Set(demand));
		this.update();
	}
	delete(id) {
		if (this.members.delete(id)) this.update();
	}
	update() {
		const next = this.compute();
		if (sameDemand(next, this.current)) return;
		this.current = next;
		this.options.onChange?.(next);
	}
	compute() {
		const union = /* @__PURE__ */ new Set();
		for (const demand of this.members.values()) {
			if (demand === ALL) return ALL;
			for (const key of demand) union.add(key);
		}
		return union;
	}
};
function sameDemand(a, b) {
	if (a === ALL || b === ALL) return a === b;
	if (a.size !== b.size) return false;
	for (const key of a) if (!b.has(key)) return false;
	return true;
}
//#endregion
//#region src/latest.ts
/**
* Creates a runner that keeps only the newest input.
*
* @example
* const runner = createLatest<string>(async (text, signal) => cache.set(text, await rephrase(text, signal)), { debounceMs: 600 })
* runner.push('hello')
* runner.push('hello world') // aborts the run for 'hello'
*/
function createLatest(run, options = {}) {
	const debounceMs = options.debounceMs ?? 0;
	if (!Number.isFinite(debounceMs) || debounceMs < 0) throw new Error("Debounce must be finite and nonnegative");
	const closed = new AbortController();
	const key = options.key ?? ((value) => value);
	const none = Symbol("none");
	let lastKey = none;
	let timer;
	let active;
	let running;
	let waiting = Promise.withResolvers();
	let pending = false;
	function settleIfIdle() {
		if (!pending && !running) {
			waiting.resolve();
			waiting = Promise.withResolvers();
		}
	}
	function start(value) {
		pending = false;
		const controller = new AbortController();
		active = controller;
		const signal = AbortSignal.any([controller.signal, closed.signal]);
		running = (async () => {
			try {
				await run(value, signal);
			} catch (error) {
				if (!signal.aborted) options.onError?.(error);
			} finally {
				if (active === controller) {
					active = void 0;
					running = void 0;
				}
				settleIfIdle();
			}
		})();
	}
	function push(value) {
		if (closed.signal.aborted) return;
		const next = key(value);
		if (Object.is(next, lastKey)) return;
		lastKey = next;
		clearTimeout(timer);
		active?.abort("Superseded by a newer input");
		active = void 0;
		running = void 0;
		pending = true;
		if (debounceMs > 0) timer = setTimeout(start, debounceMs, value);
		else start(value);
	}
	function cancelPending() {
		if (!pending || running) return;
		clearTimeout(timer);
		pending = false;
		lastKey = none;
		settleIfIdle();
	}
	function close(reason = "Runner closed") {
		if (closed.signal.aborted) return;
		clearTimeout(timer);
		pending = false;
		closed.abort(reason);
		active = void 0;
		running = void 0;
		settleIfIdle();
	}
	options.signal?.addEventListener("abort", () => close(typeof options.signal?.reason === "string" ? options.signal.reason : void 0), {
		once: true,
		signal: closed.signal
	});
	if (options.signal?.aborted) close();
	return {
		push,
		cancelPending,
		idle: () => pending || running ? waiting.promise : Promise.resolve(),
		close
	};
}
//#endregion
//#region src/lease-table.ts
/**
* Keys that stay alive while their owner renews them, for example a remote source with a heartbeat, or a tab that
* repeats its announcement. The caller decides when to call `expired`, usually from a periodic tick.
*
* @example
* const leases = createLeaseTable<string>({ ttlMs: 12_000 })
* leases.touch('tab-1', now)
* for (const tab of leases.expired(later))
*   forgetTab(tab)
*/
function createLeaseTable(options) {
	const touchedAt = /* @__PURE__ */ new Map();
	return {
		touch(key, now) {
			touchedAt.set(key, now);
		},
		expired(now) {
			const keys = [];
			for (const [key, at] of touchedAt) if (now - at > options.ttlMs) keys.push(key);
			for (const key of keys) touchedAt.delete(key);
			return keys;
		},
		delete(key) {
			touchedAt.delete(key);
		},
		has: (key) => touchedAt.has(key),
		keys: () => touchedAt.keys()
	};
}
//#endregion
//#region src/queue.ts
function createQueue(options) {
	const queue = [];
	let draining = false;
	const internalEventListeners = {
		enqueue: [],
		dequeue: [],
		process: [],
		error: [],
		result: [],
		drain: []
	};
	const internalHandlerEventListeners = {};
	function on(eventName, listener) {
		internalEventListeners[eventName].push(listener);
	}
	function excludeFirstArgument([, ...params]) {
		return params;
	}
	function emit(...args) {
		switch (args[0]) {
			case "enqueue":
				internalEventListeners.enqueue.forEach((listener) => listener(...excludeFirstArgument(args)));
				break;
			case "dequeue":
				internalEventListeners.dequeue.forEach((listener) => listener(...excludeFirstArgument(args)));
				break;
			case "process":
				internalEventListeners.process.forEach((listener) => listener(...excludeFirstArgument(args)));
				break;
			case "error":
				internalEventListeners.error.forEach((listener) => listener(...excludeFirstArgument(args)));
				break;
			case "result":
				internalEventListeners.result.forEach((listener) => listener(...excludeFirstArgument(args)));
				break;
			case "drain": internalEventListeners.drain.forEach((listener) => listener(...excludeFirstArgument(args)));
		}
	}
	function onHandlerEvent(eventName, listener) {
		internalHandlerEventListeners[eventName] = internalHandlerEventListeners[eventName] || [];
		internalHandlerEventListeners[eventName].push(listener);
	}
	function emitHandlerEvent(eventName, ...params) {
		(internalHandlerEventListeners[eventName] || []).forEach((listener) => listener(...params));
	}
	function enqueue(payload) {
		queue.push(payload);
		emit("enqueue", payload, queue.length);
		if (!draining) {
			draining = true;
			drain();
		}
	}
	function clear() {
		queue.length = 0;
	}
	async function drain() {
		while (queue.length > 0) {
			const payload = queue.shift();
			emit("dequeue", payload, queue.length);
			for (const handler of options.handlers) {
				emit("process", payload, handler);
				try {
					emit("result", payload, await handler({
						data: payload,
						emit: emitHandlerEvent
					}), handler);
				} catch (err) {
					emit("error", payload, err, handler);
					continue;
				}
			}
		}
		draining = false;
		emit("drain");
	}
	function length() {
		return queue.length;
	}
	return {
		enqueue,
		clear,
		length,
		on,
		onHandlerEvent
	};
}
//#endregion
//#region src/retention-buffer.ts
/** Compacts the storage when this many dropped slots wait at its head. */
const COMPACT_AFTER = 1024;
/**
* Keeps the newest items within a byte limit and an age limit, in insertion order.
*
* Only the head can drop, so the age limit assumes that `ageOf` grows with insertion order. An older item behind a
* newer one stays until the newer one drops. A `push` applies only the byte limit, because the age limit needs `now`.
* One item that is larger than `maxBytes` drops at once. Eviction costs time for the dropped items only.
*
* @example
* const buffer = new RetentionBuffer<Entry>({ maxBytes: 8_000_000, maxAgeMs: 600_000, sizeOf: e => e.bytes, ageOf: e => e.observedAt })
* buffer.push(entry)
* buffer.evict(now) // call it from a periodic tick
*/
var RetentionBuffer = class {
	options;
	entries = [];
	head = 0;
	totalBytes = 0;
	constructor(options) {
		this.options = options;
	}
	get size() {
		return this.entries.length - this.head;
	}
	get bytes() {
		return this.totalBytes;
	}
	push(item) {
		const bytes = this.options.sizeOf(item);
		this.entries.push({
			item,
			bytes
		});
		this.totalBytes += bytes;
		this.evictWhile(() => this.totalBytes > (this.options.maxBytes ?? Number.POSITIVE_INFINITY));
	}
	/** Drops the items older than the age limit, then the oldest items over the byte limit. Returns the dropped items. */
	evict(now) {
		const cutoff = now - (this.options.maxAgeMs ?? Number.POSITIVE_INFINITY);
		const maxBytes = this.options.maxBytes ?? Number.POSITIVE_INFINITY;
		return this.evictWhile((entry) => this.options.ageOf(entry.item) < cutoff || this.totalBytes > maxBytes);
	}
	/** The kept items, oldest first. Do not push or evict while you iterate. */
	*values() {
		for (let index = this.head; index < this.entries.length; index++) yield this.entries[index].item;
	}
	/** Drops every item without `onEvict`. */
	clear() {
		this.entries = [];
		this.head = 0;
		this.totalBytes = 0;
	}
	evictWhile(shouldDrop) {
		const dropped = [];
		while (this.head < this.entries.length) {
			const entry = this.entries[this.head];
			if (!shouldDrop(entry)) break;
			this.totalBytes -= entry.bytes;
			dropped.push(entry.item);
			this.head++;
		}
		if (dropped.length === 0) return dropped;
		if (this.head >= COMPACT_AFTER && this.head * 2 >= this.entries.length) {
			this.entries = this.entries.slice(this.head);
			this.head = 0;
		}
		this.options.onEvict?.(dropped);
		return dropped;
	}
};
//#endregion
//#region src/scope.ts
/**
* Creates a scope that closes when `parent` aborts.
*
* @example
* const scope = createScope(options.signal)
* scope.defer(() => track.stop())
* await scope.close('Recording finished')
*/
function createScope(parent, onCleanupError = console.error) {
	const controller = new AbortController();
	const cleanups = [];
	const settled = Promise.withResolvers();
	async function runCleanups() {
		for (const cleanup of cleanups.splice(0).reverse()) try {
			await cleanup();
		} catch (error) {
			onCleanupError(error);
		}
		settled.resolve();
	}
	function close(reason) {
		if (!controller.signal.aborted) {
			controller.abort(reason);
			runCleanups();
		}
		return settled.promise;
	}
	parent?.addEventListener("abort", () => void close(parent.reason), {
		once: true,
		signal: controller.signal
	});
	if (parent?.aborted) close(parent.reason);
	return {
		signal: controller.signal,
		closed: settled.promise,
		defer(cleanup) {
			if (controller.signal.aborted) Promise.resolve().then(cleanup).catch(onCleanupError);
			else cleanups.push(cleanup);
		},
		child() {
			return createScope(controller.signal, onCleanupError);
		},
		close
	};
}
//#endregion
//#region src/sequence-tracker.ts
/**
* Accepts each sequence number once, in any arrival order.
*
* Numbers below `nextSeq` and repeats are not new. A number above `nextSeq` waits in a set until the numbers before
* it arrive. `nextSeq - 1` is the end of the unbroken prefix, so a reader can resume from it.
*
* @example
* const tracker = new SequenceTracker()
* tracker.accept(1) // => true, waits for 0
* tracker.accept(0) // => true, nextSeq is now 2
* tracker.accept(1) // => false
*/
var SequenceTracker = class {
	next;
	ahead = /* @__PURE__ */ new Set();
	constructor(firstSeq = 0) {
		this.next = firstSeq;
	}
	/** The lowest number that did not arrive yet. */
	get nextSeq() {
		return this.next;
	}
	/** Returns true when `seq` is new. */
	accept(seq) {
		if (seq < this.next || this.ahead.has(seq)) return false;
		this.ahead.add(seq);
		while (this.ahead.delete(this.next)) this.next++;
		return true;
	}
};
//#endregion
//#region src/stream.ts
/**
* The optional cancellation handler owns resources that feed this readable output.
* `strategy` measures unread values. Writers check `desiredSize` because a push source cannot wait.
*/
function createPushStream(onCancel, strategy) {
	let closed = false;
	let controller = null;
	return {
		stream: new ReadableStream({
			start(ctrl) {
				controller = ctrl;
			},
			cancel(reason) {
				closed = true;
				onCancel?.(reason);
			}
		}, strategy),
		write(value) {
			if (!controller || closed) return;
			controller.enqueue(value);
		},
		close() {
			if (!controller || closed) return;
			closed = true;
			controller.close();
		},
		error(err) {
			if (!controller || closed) return;
			closed = true;
			controller.error(err);
		},
		isClosed() {
			return closed;
		},
		desiredSize() {
			return controller?.desiredSize ?? null;
		}
	};
}
async function readStream(stream, handler) {
	const reader = stream.getReader();
	try {
		while (true) {
			const { value, done } = await reader.read();
			if (done) break;
			await handler(value);
		}
	} finally {
		reader.releaseLock();
	}
}
//#endregion
//#region src/task.ts
function reasonFrom(value, fallback) {
	if (typeof value === "string") return value;
	if (value instanceof Error) return value.message;
	return fallback;
}
/**
* Creates a task that settles by an explicit call.
*
* @example
* const task = createTask<string>({ signal: parent.signal, timeoutMs: 5000 })
* task.defer(() => socket.close())
* task.finish('ok')
* await task.done // => { status: 'finished', value: 'ok' }
*/
function createTask(options = {}) {
	if (options.timeoutMs !== void 0 && (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 0)) throw new Error("Task timeout must be finite and nonnegative");
	const controller = new AbortController();
	const completion = Promise.withResolvers();
	const cleanups = [];
	const cleaned = Promise.withResolvers();
	const onCleanupError = options.onCleanupError ?? console.error;
	const parent = options.signal;
	let settled = false;
	let timer;
	async function runCleanups() {
		for (const cleanup of cleanups.splice(0).reverse()) try {
			await cleanup();
		} catch (error) {
			onCleanupError(error);
		}
		cleaned.resolve();
	}
	function settle(outcome) {
		if (settled) return;
		settled = true;
		clearTimeout(timer);
		parent?.removeEventListener("abort", onParentAbort);
		if (outcome.status !== "finished") controller.abort(outcome.status === "failed" ? outcome.error : outcome.reason);
		completion.resolve(outcome);
		runCleanups();
	}
	function onParentAbort() {
		settle({
			status: "cancelled",
			reason: reasonFrom(parent?.reason, "Parent task closed")
		});
	}
	const task = {
		signal: controller.signal,
		done: completion.promise,
		closed: cleaned.promise,
		get settled() {
			return settled;
		},
		defer(cleanup) {
			if (settled) Promise.resolve().then(cleanup).catch(onCleanupError);
			else cleanups.push(cleanup);
		},
		finish: (value) => settle({
			status: "finished",
			value
		}),
		cancel: (reason) => settle({
			status: "cancelled",
			reason
		}),
		fail: (error) => settle({
			status: "failed",
			error
		})
	};
	if (parent?.aborted) {
		onParentAbort();
		return task;
	}
	parent?.addEventListener("abort", onParentAbort, { once: true });
	if (options.timeoutMs !== void 0) timer = setTimeout(() => task.fail(/* @__PURE__ */ new Error("Task timed out")), options.timeoutMs);
	return task;
}
/**
* Runs `work` as one task. The returned value finishes the task, and a thrown error fails it.
* A call to `cancel` or `fail` inside `work` wins over its later return.
*
* @example
* const task = runTask(async ({ signal }) => fetch(url, { signal }).then(response => response.text()))
* const outcome = await task.done
*/
function runTask(work, options = {}) {
	const task = createTask(options);
	if (task.settled) return task;
	(async () => {
		try {
			task.finish(await work(task));
		} catch (cause) {
			task.fail(cause instanceof Error ? cause : new Error("Task failed", { cause }));
		}
	})();
	return task;
}
/**
* Merges outcomes. A failure wins over a cancellation, and a cancellation wins over success.
*
* @example
* worstOutcome([{ status: 'finished', value: undefined }, { status: 'cancelled', reason: 'Closed' }])
* // => { status: 'cancelled', reason: 'Closed' }
*/
function worstOutcome(outcomes) {
	const failed = outcomes.find((outcome) => outcome.status === "failed");
	if (failed) return failed;
	return outcomes.find((outcome) => outcome.status === "cancelled") ?? {
		status: "finished",
		value: void 0
	};
}
//#endregion
//#region src/watermark.ts
/**
* Tracks the newest event time of a stream and marks events that arrive too late.
*
* A late event is still an event. The caller decides what to do with it, for example count it or flag it in a view.
*
* @example
* const watermark = new Watermark({ allowedLatenessMs: 2000 })
* watermark.observe(10_000) // => { late: false }
* watermark.observe(7_000) // => { late: true }
*/
var Watermark = class {
	options;
	newestTime = Number.NEGATIVE_INFINITY;
	constructor(options) {
		this.options = options;
	}
	/** The newest time observed. `-Infinity` before the first event. */
	get newest() {
		return this.newestTime;
	}
	observe(time) {
		const late = time < this.newestTime - this.options.allowedLatenessMs;
		this.newestTime = Math.max(this.newestTime, time);
		return { late };
	}
};
//#endregion
export { DemandUnion, RetentionBuffer, SequenceTracker, Watermark, createBatcher, createCatchUpFeed, createCooldown, createLatest, createLeaseTable, createPushStream, createQueue, createScope, createTask, readStream, runTask, worstOutcome };
