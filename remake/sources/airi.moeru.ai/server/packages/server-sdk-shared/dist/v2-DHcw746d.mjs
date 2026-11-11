import { defineInvokeEventa, defineOutboundEventa } from "@moeru/eventa";
import * as v from "valibot";
//#region src/chat.ts
const NonEmptyStringSchema = v.pipe(v.string(), v.minLength(1));
const SendMessageSchema = v.object({
	id: NonEmptyStringSchema,
	role: v.string(),
	content: v.string(),
	replyToMessageId: v.optional(NonEmptyStringSchema)
});
const SendMessagesRequestSchema = v.object({
	chatId: NonEmptyStringSchema,
	messages: v.array(SendMessageSchema)
});
const PullMessagesRequestSchema = v.object({
	chatId: NonEmptyStringSchema,
	afterSeq: v.pipe(v.number(), v.integer(), v.minValue(0)),
	limit: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)))
});
/** Parses a `chat:send-messages` payload at the WebSocket boundary. */
function parseSendMessagesRequest(request) {
	return v.parse(SendMessagesRequestSchema, request);
}
/** Parses a `chat:pull-messages` payload at the WebSocket boundary. */
function parsePullMessagesRequest(request) {
	return v.parse(PullMessagesRequestSchema, request);
}
//#endregion
//#region src/v2.ts
const AuthenticateRequestSchema = v.object({ token: v.pipe(v.string(), v.minLength(1), v.maxLength(4096)) });
const AuthenticateResponseSchema = v.object({ userId: v.pipe(v.string(), v.minLength(1)) });
/** Parses a `chat:authenticate` payload at the WebSocket boundary. */
function parseAuthenticateRequest(request) {
	return v.parse(AuthenticateRequestSchema, request);
}
/** Parses a `chat:authenticate` response at the WebSocket boundary. */
function parseAuthenticateResponse(response) {
	return v.parse(AuthenticateResponseSchema, response);
}
const authenticate = defineInvokeEventa("chat:authenticate");
const sendMessages = defineInvokeEventa("chat:send-messages");
const pullMessages = defineInvokeEventa("chat:pull-messages");
const newMessages = defineOutboundEventa("chat:new-messages");
//#endregion
export { parseAuthenticateRequest as a, sendMessages as c, parsePullMessagesRequest as d, parseSendMessagesRequest as f, newMessages as i, PullMessagesRequestSchema as l, AuthenticateResponseSchema as n, parseAuthenticateResponse as o, authenticate as r, pullMessages as s, AuthenticateRequestSchema as t, SendMessagesRequestSchema as u };

//# sourceMappingURL=v2-DHcw746d.mjs.map