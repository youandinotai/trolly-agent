import { n as createEventWaitFor, t as normalizeSendResult } from "./shared-bfFfBlz_.mjs";
import { createContext, defineEventa } from "@moeru/eventa";
//#region src/client/index.ts
const clientStateChangeEvent = defineEventa("better-ws:client:state-change");
function defaultSchedule(delay, run) {
	const handle = setTimeout(run, delay);
	return { cancel: () => clearTimeout(handle) };
}
function createConnectionClosedError() {
	return /* @__PURE__ */ new Error("Connection closed");
}
/**
* Normalizes reconnect policy into the runtime shape used by close and
* prepare-failure paths.
*
* Before:
* - `undefined`
* - `true`
* - `{ delay: 100 }`
*
* After:
* - full reconnect policy with default infinite retries and exponential backoff
*/
function normalizeReconnectOptions(reconnect) {
	if (reconnect === false) return false;
	const options = reconnect === true || typeof reconnect === "undefined" ? {} : reconnect;
	return {
		retries: options.retries ?? Number.POSITIVE_INFINITY,
		delay: options.delay ?? ((attempt) => Math.min(1e3 * 2 ** (attempt - 1), 3e4)),
		onFailed: options.onFailed ?? (() => {}),
		retryOnPrepareError: options.retryOnPrepareError ?? true,
		reconnectRandomFactor: normalizeReconnectRandomFactor(options.reconnectRandomFactor),
		reconnectMinConnectedDuration: options.reconnectMinConnectedDuration ?? 0
	};
}
function shouldRetry(retries, attempt, error) {
	return typeof retries === "number" ? attempt <= retries : retries(attempt, error);
}
function resolveReconnectDelay(options, attempt, error) {
	return typeof options.delay === "number" ? options.delay : options.delay(attempt, error);
}
function normalizeReconnectRandomFactor(randomFactor) {
	if (typeof randomFactor !== "number" || Number.isNaN(randomFactor)) return 0;
	return Math.min(1, Math.max(0, randomFactor));
}
function applyReconnectRandomFactor(delay, randomFactor) {
	if (randomFactor <= 0 || delay <= 0) return delay;
	const factor = 1 + (Math.random() * 2 - 1) * randomFactor;
	return Math.max(1, Math.round(delay * factor));
}
function normalizeHeartbeatOptions(heartbeat) {
	if (!heartbeat) return false;
	return {
		mode: heartbeat.mode ?? "auto",
		interval: heartbeat.interval ?? 3e4,
		timeout: heartbeat.timeout ?? 1e4,
		message: heartbeat.message,
		isResponse: heartbeat.isResponse
	};
}
function createHeartbeatTimeoutError(timeout) {
	return /* @__PURE__ */ new Error(`Heartbeat timed out after ${timeout}ms.`);
}
function createClient(options) {
	if ("connector" in options) return createClientWithConnector(options, options.connector);
	return createClientWithConnector(options, createSocketConnector(options));
}
function createClientWithConnector(options, connector) {
	let state = "idle";
	let connection;
	let reconnectAttempt = 0;
	let manuallyClosed = false;
	const reconnectOptions = normalizeReconnectOptions(options.reconnect);
	const heartbeatOptions = normalizeHeartbeatOptions(options.heartbeat);
	let lastCloseError = createConnectionClosedError();
	let reconnectTask;
	let connectedAt;
	let heartbeatIntervalTask;
	let heartbeatTimeoutTask;
	let prepareController;
	const waiters = /* @__PURE__ */ new Set();
	let connectionEpoch = 0;
	const events = createContext();
	const clientMessageEvent = defineEventa("better-ws:client:message");
	const client = {
		get state() {
			return state;
		},
		async connect() {
			await connectInternal(false);
		},
		send(message, sendOptions) {
			const canSend = (sendOptions?.requireReady === false ? "open" : "ready") === "ready" ? state === "ready" : state === "open" || state === "preparing" || state === "ready";
			if (!connection || !canSend) return {
				ok: false,
				reason: "closed"
			};
			return normalizeSendResult(() => connection?.send(message));
		},
		close(code, reason) {
			manuallyClosed = true;
			connectionEpoch += 1;
			stopHeartbeat();
			prepareController?.abort();
			prepareController = void 0;
			reconnectTask?.cancel();
			reconnectTask = void 0;
			transition("closing");
			connection?.close?.(code, reason);
			connection = void 0;
			connectedAt = void 0;
			transition("closed");
		},
		onMessage(handler) {
			return events.on(clientMessageEvent, (event) => handler(event.body));
		},
		onStateChange(handler) {
			return events.on(clientStateChangeEvent, (event) => handler(event.body));
		}
	};
	async function connectInternal(automaticReconnect) {
		manuallyClosed = false;
		const currentConnectionEpoch = ++connectionEpoch;
		stopHeartbeat();
		prepareController?.abort();
		prepareController = void 0;
		connection?.close?.();
		connection = void 0;
		reconnectTask?.cancel();
		reconnectTask = void 0;
		connectedAt = void 0;
		transition(automaticReconnect ? "reconnecting" : "connecting");
		let nextConnection;
		try {
			nextConnection = await connector.connect({
				message: (message) => dispatchMessage(currentConnectionEpoch, message),
				close: (details) => handleClose(currentConnectionEpoch, details),
				error: (error) => dispatchError(currentConnectionEpoch, error)
			});
		} catch (error) {
			if (currentConnectionEpoch === connectionEpoch) {
				stopHeartbeat();
				if (reconnectOptions && !manuallyClosed) {
					lastCloseError = error;
					scheduleReconnect(error);
					if (automaticReconnect) return;
				} else transition("closed");
			}
			if (automaticReconnect) return;
			throw error;
		}
		if (currentConnectionEpoch !== connectionEpoch || manuallyClosed) {
			prepareController?.abort();
			prepareController = void 0;
			nextConnection.close?.();
			return;
		}
		connection = nextConnection;
		connectedAt = Date.now();
		lastCloseError = createConnectionClosedError();
		transition("open");
		let currentPrepareController;
		try {
			if (options.prepare) {
				transition("preparing");
				currentPrepareController = new AbortController();
				prepareController = currentPrepareController;
				await options.prepare({
					signal: currentPrepareController.signal,
					attempt: reconnectAttempt,
					reconnecting: reconnectAttempt > 0,
					send: (message) => client.send(message, { requireReady: false }),
					waitFor: createWaitForMessage(currentPrepareController.signal, currentConnectionEpoch)
				});
				currentPrepareController.abort();
				if (prepareController === currentPrepareController) prepareController = void 0;
			}
		} catch (error) {
			currentPrepareController?.abort();
			if (prepareController === currentPrepareController) prepareController = void 0;
			if (currentConnectionEpoch !== connectionEpoch || manuallyClosed) {
				if (connection === nextConnection) {
					nextConnection.close?.();
					connection = void 0;
				}
				return;
			}
			connectionEpoch += 1;
			stopHeartbeat();
			nextConnection.close?.();
			connection = void 0;
			resetReconnectAttemptAfterStableConnection();
			lastCloseError = error;
			if (reconnectOptions && reconnectOptions.retryOnPrepareError) scheduleReconnect(error);
			else transition("failed");
			if (automaticReconnect) return;
			throw error;
		}
		if (currentConnectionEpoch !== connectionEpoch || manuallyClosed) {
			currentPrepareController?.abort();
			if (prepareController === currentPrepareController) prepareController = void 0;
			if (connection === nextConnection) {
				stopHeartbeat();
				nextConnection.close?.();
				connection = void 0;
			}
			return;
		}
		if (!reconnectOptions || reconnectOptions.reconnectMinConnectedDuration <= 0) reconnectAttempt = 0;
		transition("ready");
		scheduleHeartbeat(currentConnectionEpoch);
	}
	function transition(nextState) {
		if (state === nextState) return;
		const previousState = state;
		state = nextState;
		events.emit(clientStateChangeEvent, {
			previousState,
			state
		});
	}
	function dispatchMessage(connectionMessageEpoch, message) {
		if (connectionMessageEpoch !== connectionEpoch) return;
		refreshHeartbeat(connectionMessageEpoch, message);
		events.emit(clientMessageEvent, {
			client,
			message
		});
		for (const waiter of waiters) waiter(message);
	}
	function dispatchError(connectionErrorEpoch, error) {
		if (connectionErrorEpoch !== connectionEpoch) return;
		lastCloseError = error;
		connection?.close?.();
		handleClose(connectionErrorEpoch, { reason: "error" });
	}
	function handleClose(connectionCloseEpoch, _details) {
		if (connectionCloseEpoch !== connectionEpoch) return;
		connectionEpoch += 1;
		stopHeartbeat();
		prepareController?.abort();
		prepareController = void 0;
		connection = void 0;
		resetReconnectAttemptAfterStableConnection();
		if (manuallyClosed) {
			transition("closed");
			return;
		}
		if (!reconnectOptions) {
			transition("closed");
			return;
		}
		scheduleReconnect(lastCloseError);
	}
	function scheduleReconnect(error) {
		stopHeartbeat();
		const nextAttempt = reconnectAttempt + 1;
		if (!reconnectOptions) {
			failReconnect(error);
			return;
		}
		let retryAllowed;
		try {
			retryAllowed = shouldRetry(reconnectOptions.retries, nextAttempt, error);
		} catch (policyError) {
			failReconnect(policyError);
			return;
		}
		if (!retryAllowed) {
			failReconnect(error);
			return;
		}
		let delay;
		try {
			delay = applyReconnectRandomFactor(resolveReconnectDelay(reconnectOptions, nextAttempt, error), reconnectOptions.reconnectRandomFactor);
		} catch (policyError) {
			failReconnect(policyError);
			return;
		}
		reconnectAttempt = nextAttempt;
		transition("reconnecting");
		reconnectTask = (options.schedule ?? defaultSchedule)(delay, () => {
			connectInternal(true);
		});
	}
	function resetReconnectAttemptAfterStableConnection() {
		if (!reconnectOptions || reconnectOptions.reconnectMinConnectedDuration <= 0 || connectedAt === void 0) {
			connectedAt = void 0;
			return;
		}
		const connectedFor = Date.now() - connectedAt;
		connectedAt = void 0;
		if (connectedFor >= reconnectOptions.reconnectMinConnectedDuration) reconnectAttempt = 0;
	}
	function scheduleHeartbeat(heartbeatConnectionEpoch) {
		if (!heartbeatOptions || heartbeatConnectionEpoch !== connectionEpoch || state !== "ready") return;
		heartbeatIntervalTask?.cancel();
		heartbeatIntervalTask = (options.schedule ?? defaultSchedule)(heartbeatOptions.interval, () => {
			heartbeatIntervalTask = void 0;
			runHeartbeat(heartbeatConnectionEpoch);
		});
	}
	function runHeartbeat(heartbeatConnectionEpoch) {
		if (!heartbeatOptions || heartbeatConnectionEpoch !== connectionEpoch || state !== "ready" || manuallyClosed) return;
		if (!sendHeartbeat()) {
			if (heartbeatOptions.mode === "native") failHeartbeat(heartbeatConnectionEpoch, /* @__PURE__ */ new Error("Native heartbeat requires connection.ping()."));
			else if (heartbeatOptions.mode === "message" && heartbeatOptions.message === void 0) failHeartbeat(heartbeatConnectionEpoch, /* @__PURE__ */ new Error("Message heartbeat requires heartbeat.message."));
			return;
		}
		heartbeatTimeoutTask?.cancel();
		heartbeatTimeoutTask = (options.schedule ?? defaultSchedule)(heartbeatOptions.timeout, () => {
			heartbeatTimeoutTask = void 0;
			failHeartbeat(heartbeatConnectionEpoch, createHeartbeatTimeoutError(heartbeatOptions.timeout));
		});
	}
	function sendHeartbeat() {
		if (!heartbeatOptions) return false;
		if ((heartbeatOptions.mode === "auto" || heartbeatOptions.mode === "native") && connection?.ping) return normalizeSendResult(() => connection?.ping()).ok;
		if ((heartbeatOptions.mode === "auto" || heartbeatOptions.mode === "message") && heartbeatOptions.message !== void 0) {
			const heartbeatMessage = typeof heartbeatOptions.message === "function" ? heartbeatOptions.message() : heartbeatOptions.message;
			return client.send(heartbeatMessage, { requireReady: false }).ok;
		}
		return false;
	}
	function refreshHeartbeat(heartbeatConnectionEpoch, message) {
		if (!heartbeatOptions || heartbeatConnectionEpoch !== connectionEpoch) return;
		if (heartbeatOptions.isResponse?.(message) ?? true) {
			heartbeatTimeoutTask?.cancel();
			heartbeatTimeoutTask = void 0;
		} else if (heartbeatTimeoutTask) return;
		if (state === "ready") scheduleHeartbeat(heartbeatConnectionEpoch);
	}
	function failHeartbeat(heartbeatConnectionEpoch, error) {
		if (heartbeatConnectionEpoch !== connectionEpoch || manuallyClosed) return;
		lastCloseError = error;
		const timedOutConnection = connection;
		connectionEpoch += 1;
		stopHeartbeat();
		prepareController?.abort();
		prepareController = void 0;
		connection = void 0;
		resetReconnectAttemptAfterStableConnection();
		timedOutConnection?.close?.();
		if (manuallyClosed) {
			transition("closed");
			return;
		}
		if (!reconnectOptions) {
			transition("closed");
			return;
		}
		scheduleReconnect(error);
	}
	function stopHeartbeat() {
		heartbeatIntervalTask?.cancel();
		heartbeatIntervalTask = void 0;
		heartbeatTimeoutTask?.cancel();
		heartbeatTimeoutTask = void 0;
	}
	function failReconnect(error) {
		transition("failed");
		if (!reconnectOptions) return;
		try {
			reconnectOptions.onFailed(error);
		} catch {}
	}
	function createWaitForMessage(activePrepareSignal, prepareConnectionEpoch) {
		return (predicate, waitOptions = {}) => {
			const wait = createEventWaitFor({
				match: predicate,
				timeout: waitOptions.timeout,
				signals: [activePrepareSignal, waitOptions.signal],
				isActive: () => prepareConnectionEpoch === connectionEpoch,
				abortMessage: "Wait for message aborted.",
				timeoutMessage: "Timed out waiting for message."
			});
			waiters.add(wait.emit);
			wait.promise.finally(() => {
				waiters.delete(wait.emit);
			}).catch(() => {});
			return wait.promise;
		};
	}
	return client;
}
function createSocketConnector(options) {
	return { connect(events) {
		const WsConstructor = options.wsConstructor ?? globalThis.WebSocket;
		if (!WsConstructor) throw new Error("No WebSocket constructor is available. Pass `wsConstructor` or use a connector.");
		const ws = new WsConstructor(options.url, options.protocols);
		return new Promise((resolve, reject) => {
			let opened = false;
			let failedBeforeOpen = false;
			ws.onopen = () => {
				opened = true;
				resolve({
					send: (message) => ws.send(message),
					close: (code, reason) => ws.close(code, reason)
				});
			};
			ws.onmessage = (event) => {
				if (typeof event.data === "string") {
					events.message(event.data);
					return;
				}
				events.error(/* @__PURE__ */ new TypeError("The built-in WebSocket connector only supports text messages."));
			};
			ws.onerror = (event) => {
				if (!opened) {
					failedBeforeOpen = true;
					reject(/* @__PURE__ */ new Error("WebSocket connection failed before opening."));
					return;
				}
				events.error(event);
			};
			ws.onclose = (event) => {
				if (failedBeforeOpen) return;
				events.close({
					code: event.code,
					reason: event.reason,
					wasClean: event.wasClean
				});
			};
		});
	} };
}
//#endregion
export { createClient };
