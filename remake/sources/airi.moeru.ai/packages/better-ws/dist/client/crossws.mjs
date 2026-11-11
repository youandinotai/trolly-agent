import NativeWebSocket from "crossws/websocket";
//#region src/client/crossws/index.ts
/** Creates a CrossWS-backed text connector for better-ws clients. */
function createCrossWsConnector(options) {
	return { connect(events) {
		const ws = new (options.wsConstructor ?? NativeWebSocket)(options.url, options.protocols);
		return new Promise((resolve, reject) => {
			let opened = false;
			let failedBeforeOpen = false;
			ws.onopen = () => {
				opened = true;
				resolve({
					send: (message) => ws.send(message),
					close: (code, reason) => ws.close(code, reason),
					ping: typeof ws.ping === "function" ? () => ws.ping() : void 0,
					pong: typeof ws.pong === "function" ? () => ws.pong() : void 0
				});
			};
			ws.onmessage = (event) => {
				if (typeof event.data === "string") {
					events.message(event.data);
					return;
				}
				events.error(/* @__PURE__ */ new TypeError("The CrossWS connector only supports text messages."));
			};
			ws.onerror = (event) => {
				const error = errorFromEvent(event);
				if (!opened) {
					failedBeforeOpen = true;
					reject(error);
					return;
				}
				events.error(error);
			};
			ws.onclose = (event) => {
				if (failedBeforeOpen) return;
				if (!opened) {
					reject(createCloseBeforeOpenError(event));
					return;
				}
				events.close({
					code: event.code,
					reason: event.reason,
					wasClean: event.wasClean
				});
			};
		});
	} };
}
function errorFromEvent(event) {
	if (event instanceof Error) return event;
	if (typeof event === "object" && event !== null && "error" in event && event.error instanceof Error) return event.error;
	return /* @__PURE__ */ new Error("CrossWS connection error.");
}
function createCloseBeforeOpenError(event) {
	const reason = event.reason ? ` ${event.reason}` : "";
	const code = typeof event.code === "number" ? ` with code ${event.code}` : "";
	return /* @__PURE__ */ new Error(`CrossWS connection closed before opening${code}.${reason}`);
}
//#endregion
export { createCrossWsConnector };
