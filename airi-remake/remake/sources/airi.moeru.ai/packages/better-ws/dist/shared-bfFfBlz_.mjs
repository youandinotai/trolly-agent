import { createContext, defineEventa } from "@moeru/eventa";
//#region src/shared/utils/event-wait-for.ts
function createWaitError(message, reason) {
	if (reason instanceof Error) return reason;
	return new Error(reason ? `${message}: ${String(reason)}` : message);
}
/**
* Creates a promise plus emit pair for waiting on callback-driven events.
*
* Use when:
* - An event source pushes values through callbacks, sets, or Eventa handlers
* - The caller needs timeout, abort, predicate, and cleanup semantics around one future event
*
* Expects:
* - Callers register {@link EventWaitFor.emit} with their event source and unregister it when the promise settles
* - Matching starts only for future events emitted through the returned controller
*
* Returns:
* - A one-shot wait controller that settles once and ignores later events
*/
function createEventWaitFor(options = {}) {
	const { match = () => true, select = (event) => event, abortMessage = "Wait aborted.", timeoutMessage = "Timed out waiting for event.", signals = [] } = options;
	const normalizedSignals = signals.filter((signal) => signal != null);
	const events = createContext();
	const waitEvent = defineEventa("better-ws:wait-for-event");
	let settled = false;
	let timeoutHandle;
	let unsubscribe = () => {};
	let resolvePromise;
	let rejectPromise;
	const promise = new Promise((resolve, reject) => {
		resolvePromise = resolve;
		rejectPromise = reject;
	});
	const cleanup = () => {
		if (timeoutHandle) {
			clearTimeout(timeoutHandle);
			timeoutHandle = void 0;
		}
		for (const signal of normalizedSignals) signal.removeEventListener("abort", abort);
		unsubscribe();
		unsubscribe = () => {};
	};
	const settle = (run) => {
		if (settled) return;
		settled = true;
		cleanup();
		run();
	};
	function rejectWith(message, reason) {
		settle(() => rejectPromise(createWaitError(message, reason)));
	}
	function abort() {
		rejectWith(abortMessage);
	}
	function assertActive() {
		if (options.isActive?.() === false) {
			rejectWith(abortMessage);
			return false;
		}
		return true;
	}
	unsubscribe = events.on(waitEvent, ({ body }) => {
		if (settled || !assertActive()) return;
		const event = body;
		try {
			const matched = match(event);
			if (typeof matched === "boolean") {
				if (matched && assertActive()) settle(() => resolvePromise(select(event)));
				return;
			}
			matched.then((asyncMatched) => {
				if (asyncMatched && assertActive()) settle(() => resolvePromise(select(event)));
			}).catch((error) => rejectWith(abortMessage, error));
		} catch (error) {
			rejectWith(abortMessage, error);
		}
	});
	if (!assertActive() || normalizedSignals.some((signal) => signal.aborted)) rejectWith(abortMessage);
	else {
		for (const signal of normalizedSignals) signal.addEventListener("abort", abort, { once: true });
		if (options.timeout !== void 0) timeoutHandle = setTimeout(() => {
			rejectWith(timeoutMessage);
		}, options.timeout);
	}
	return {
		promise,
		emit: (event) => events.emit(waitEvent, event),
		dispose: (reason) => rejectWith(abortMessage, reason)
	};
}
//#endregion
//#region src/shared/index.ts
/**
* Converts runtime-specific send return values into a stable public result.
*
* Use when:
* - Client and server adapters expose different send result semantics
* - Public APIs need to avoid leaking concrete runtime return values
*
* Expects:
* - `false` from an adapter means local backpressure or rejected send
*
* Returns:
* - A normalized send result.
*/
function normalizeSendResult(run) {
	try {
		if (run() === false) return {
			ok: false,
			reason: "backpressure"
		};
		return { ok: true };
	} catch (error) {
		return {
			ok: false,
			reason: "error",
			error
		};
	}
}
//#endregion
export { createEventWaitFor as n, normalizeSendResult as t };
