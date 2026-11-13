import { createLatest, createPushStream, createQueue, createScope, createTask, runTask } from "@proj-airi/stream-kit";
import rehypeParse from "rehype-parse";
import rehypeStringify from "rehype-stringify";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { APICallError } from "@xsai/shared";
import { hasToolCall, not } from "@xsai/shared-chat";
import { streamText } from "@xsai/stream-text";
import { errorMessageFrom } from "@moeru/std";
import { nanoid } from "nanoid";
import { responses } from "@xsai-ext/responses";
import { createContext, defineEventa, matchBy } from "@moeru/eventa";
import { nanoid as nanoid$1 } from "nanoid/non-secure";
import { capture, createSpeechPipeline, observe } from "@proj-airi/pipelines-audio";
import remarkWikiLink from "@flowershow/remark-wiki-link";
import remarkCjkFriendly from "remark-cjk-friendly";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import { MathSpeech, primaryLanguage, spellNumber } from "@proj-airi/speech-transformer-math";
import { chemistry } from "@proj-airi/speech-transformer-chem";
//#region src/messages/render-context.ts
function renderHistoryAction(item) {
	if (item.type === "summary") return [
		"Summary:",
		item.text,
		item.fromTurnIndex != null || item.toTurnIndex != null ? `Window: ${item.fromTurnIndex ?? "?"} -> ${item.toTurnIndex ?? "?"}.` : void 0
	].filter(Boolean).join("\n");
	if (item.type === "reaction") return `${item.reactionType}: ${item.text}`;
	if (item.type === "domain-event") return [`Domain event: ${item.eventType}`, JSON.stringify(item.payload, null, 2)].join("\n");
	if (item.action.kind === "text") return item.action.text;
	if (item.action.kind === "event") return `${item.action.name}${item.action.payload ? ` ${JSON.stringify(item.action.payload)}` : ""}`;
	if (item.action.kind === "move-played" || item.action.kind === "move-executed") return `${item.action.kind} ${item.action.san}`;
	return JSON.stringify(item.action);
}
/** Renders domain context as text without assigning a provider role or wire format. */
function renderSegmentText(segment) {
	if (segment.type === "runtime-context") return segment.entries.length ? `\n[Context]\n${segment.entries.map((entry) => `- ${entry.source}: ${entry.text}`).join("\n")}` : "";
	if (segment.type === "text") return segment.text;
	if (segment.type === "instruction") return [segment.priority ? `Instruction [${segment.priority}]:` : "Instruction:", segment.text].join("\n");
	if (segment.type === "tagged-text") return `<${segment.tag}>${segment.text}</${segment.tag}>`;
	if (segment.type === "domain-event") return [`Domain event: ${segment.eventType}`, JSON.stringify(segment.payload, null, 2)].join("\n");
	if (segment.type === "state-snapshot") return [`State snapshot: ${segment.stateType}`, JSON.stringify(segment.payload, null, 2)].join("\n");
	if (segment.type === "summary") return [
		"Summary:",
		segment.text,
		segment.metadata ? JSON.stringify(segment.metadata, null, 2) : void 0
	].filter(Boolean).join("\n");
	if (segment.type === "reference") return [`Reference: ${segment.refType} -> ${segment.targetId}`, segment.note].filter(Boolean).join("\n");
	if (segment.type === "history-block") return segment.items.map(renderHistoryAction).join("\n");
	throw new Error(`Cannot render ${segment.type} as context text`);
}
//#endregion
//#region src/messages/turns.ts
/** Decodes one known model step. Tool results correlate only with calls in this round. */
function readRound(id, entries) {
	const round = {
		id,
		content: [],
		toolInvocations: [],
		projectionIssues: []
	};
	for (const entry of entries) for (const segment of entry.segments) if (segment.type === "tool-call") {
		if (round.toolInvocations.some((call) => call.callId === segment.callId)) {
			round.projectionIssues.push(`Duplicate tool call ${segment.callId} in round ${id}`);
			continue;
		}
		const invocationId = `${id}/${segment.callId}`;
		round.content.push({
			type: "tool",
			invocationId
		});
		round.toolInvocations.push({
			id: invocationId,
			callId: segment.callId,
			name: segment.name,
			arguments: segment.arguments,
			execution: { status: "pending" }
		});
	} else if (segment.type === "tool-result") {
		const invocation = round.toolInvocations.find((call) => call.callId === segment.callId);
		if (invocation) invocation.execution = {
			status: "succeeded",
			output: segment.content
		};
		else round.projectionIssues.push(`Tool result ${segment.callId} has no call in round ${id}`);
	} else if (entry.role === "assistant") {
		if (segment.type !== "image" && segment.type !== "audio" && segment.type !== "file") round.content.push(segment);
	}
	return round;
}
/**
* Reads existing Chat-shaped history at its storage boundary. Each assistant message starts a
* round; following tool results belong to it. Runtime adapters use SDK step boundaries instead.
*/
function readTurns(entries) {
	const turns = [];
	let assistant;
	let pending = [];
	function flush() {
		if (assistant && pending.length) {
			assistant.rounds.push(readRound(`${assistant.id}/${assistant.rounds.length}`, pending));
			pending = [];
		}
	}
	for (const entry of entries) {
		if (entry.role === "assistant" || entry.role === "tool") {
			if (!assistant) {
				assistant = {
					type: "assistant",
					id: entry.id,
					status: "completed",
					rounds: []
				};
				turns.push(assistant);
			}
			if (entry.role === "assistant") flush();
			pending.push(entry);
			continue;
		}
		flush();
		assistant = void 0;
		if (entry.role === "user") turns.push({
			type: "user",
			id: entry.id,
			content: entry.segments
		});
		else turns.push({
			type: "system",
			id: entry.id,
			authority: entry.role === "system" || entry.role === "developer" ? entry.role : "context",
			content: entry.segments
		});
	}
	flush();
	return turns;
}
/** Expands one round for a protocol adapter without duplicating stored calls or results. */
function projectRound(round) {
	if (round.projectionIssues.length) throw new Error(`Round ${round.id} cannot be projected: ${round.projectionIssues.join("; ")}`);
	const entries = [];
	const segments = [];
	for (const part of round.content) {
		if (part.type !== "tool") {
			segments.push(part);
			continue;
		}
		const invocation = round.toolInvocations.find((call) => call.id === part.invocationId);
		if (!invocation) throw new Error(`Missing tool invocation ${part.invocationId}`);
		segments.push({
			type: "tool-call",
			callId: invocation.callId,
			name: invocation.name,
			arguments: invocation.arguments
		});
	}
	if (segments.length) entries.push({
		id: round.id,
		role: "assistant",
		segments
	});
	for (const invocation of round.toolInvocations) if (invocation.execution.status === "succeeded" || invocation.execution.status === "failed") entries.push({
		id: invocation.id,
		role: "tool",
		segments: [{
			type: "tool-result",
			callId: invocation.callId,
			content: invocation.execution.output
		}]
	});
	return entries;
}
/** Application context becomes user-level data; trusted instructions retain their declared authority. */
function projectInput(turn) {
	if (turn.type === "user") return {
		id: turn.id,
		role: "user",
		segments: turn.content
	};
	return {
		id: turn.id,
		role: turn.authority === "context" ? "context" : turn.authority,
		segments: turn.content
	};
}
//#endregion
//#region src/messages/chat-completions.ts
/**
* Converts Chat content at storage and SDK boundaries without inventing a message envelope.
*
* @example
* chatContentToInputSegments('hello')
* // => [{ type: 'text', text: 'hello' }]
*/
function chatContentToInputSegments(content) {
	if (content == null) return [];
	if (typeof content === "string") return [{
		type: "text",
		text: content
	}];
	return content.map((part) => {
		switch (part.type) {
			case "text": return {
				type: "text",
				text: part.text
			};
			case "image_url": return {
				type: "image",
				url: part.image_url.url,
				detail: part.image_url.detail
			};
			case "input_audio": return {
				type: "audio",
				...part.input_audio
			};
			case "file":
				if (part.file.file_data !== void 0 && part.file.file_id === void 0) return {
					type: "file",
					data: part.file.file_data,
					name: part.file.filename
				};
				if (part.file.file_id !== void 0 && part.file.file_data === void 0) return {
					type: "file",
					providerFileId: part.file.file_id,
					name: part.file.filename
				};
				throw new Error("Chat file requires exactly one source");
		}
		throw new Error("Unsupported Chat content part");
	});
}
/**
* Reads Chat-shaped storage or SDK output into portable message semantics.
* This is an ingress boundary; Responses never calls the Chat request renderer.
*
* @example
* chatMessagesToProjectionEntries([{ role: 'user', content: 'Hello' }])[0].segments
* // => [{ type: 'text', text: 'Hello' }]
*/
function chatMessagesToProjectionEntries(messages, idPrefix = "message") {
	return messages.map((message, index) => {
		const id = `${idPrefix}-${index}`;
		if (message.role === "error") return {
			id,
			role: "user",
			segments: [{
				type: "text",
				text: `User encountered error: ${message.content}`
			}]
		};
		if (message.role === "tool") return {
			id,
			role: "tool",
			segments: [{
				type: "tool-result",
				callId: message.tool_call_id,
				content: chatContentToInputSegments(message.content)
			}]
		};
		if (message.role === "assistant") {
			const segments = typeof message.content === "string" ? [{
				type: "text",
				text: message.content
			}] : message.content?.map((part) => part.type === "text" ? {
				type: "text",
				text: part.text
			} : {
				type: "refusal",
				text: part.refusal
			}) ?? [];
			if (message.refusal) segments.push({
				type: "refusal",
				text: message.refusal
			});
			for (const call of message.tool_calls ?? []) {
				if (call.function.name == null || call.function.arguments == null) throw new Error("Cannot replay an unfinished function call");
				segments.push({
					type: "tool-call",
					callId: call.id,
					name: call.function.name,
					arguments: call.function.arguments
				});
			}
			return {
				id,
				role: "assistant",
				segments
			};
		}
		if (message.role === "system" || message.role === "developer") return {
			id,
			role: message.role,
			segments: typeof message.content === "string" ? [{
				type: "text",
				text: message.content
			}] : message.content.map((part) => ({
				type: "text",
				text: part.text
			}))
		};
		return {
			id,
			role: message.role,
			segments: chatContentToInputSegments(message.content)
		};
	});
}
/** Reads persisted Chat records; the storage identity scopes turn, round, and invocation ids. */
function chatMessagesToTurns(messages, idPrefix) {
	return readTurns(chatMessagesToProjectionEntries(messages, idPrefix));
}
function writeContent(segment) {
	switch (segment.type) {
		case "image": return {
			type: "image_url",
			image_url: {
				url: segment.url,
				detail: segment.detail
			}
		};
		case "audio": return {
			type: "input_audio",
			input_audio: {
				data: segment.data,
				format: segment.format
			}
		};
		case "file":
			if (segment.url) throw new Error("Chat Completions does not support file URLs");
			return {
				type: "file",
				file: {
					file_data: segment.data,
					filename: segment.name,
					file_id: segment.providerFileId
				}
			};
		default: return {
			type: "text",
			text: renderSegmentText(segment)
		};
	}
}
/**
* Converts Chat content for providers that accept only strings.
*
* @example
* chatContentToString([{ type: 'text', text: 'Hi' }, { type: 'refusal', refusal: 'No' }])
* // => 'HiNo'
*/
function chatContentToString(content) {
	return content.map((part) => part.type === "text" ? part.text : part.type === "refusal" ? part.refusal : "").join("");
}
function renderEntry(message, supportsContentArray) {
	const result = [];
	const role = message.role === "context" || message.role === "event" || message.role === "summary" ? "user" : message.role;
	let parts = [];
	let assistantParts = [];
	let calls = [];
	function flush() {
		if (role === "assistant") {
			if (assistantParts.length || calls.length) {
				const content = !supportsContentArray || assistantParts.every((part) => part.type === "text") ? assistantParts.map((part) => part.type === "text" ? part.text : part.refusal).join("") : assistantParts;
				result.push({
					role,
					content,
					...calls.length ? { tool_calls: calls } : {}
				});
			}
		} else if (parts.length) {
			if (role === "tool") throw new Error("Tool messages require a correlated tool result");
			if (role === "system" || role === "developer") {
				if (parts.some((part) => part.type !== "text")) throw new Error(`${role} messages require text content`);
				result.push({
					role,
					content: parts.map((part) => part.type === "text" ? part.text : "").join("")
				});
			} else {
				const content = !supportsContentArray || parts.every((part) => part.type === "text") ? parts.map((part) => part.type === "text" ? part.text : "").join("") : parts;
				result.push({
					role,
					content
				});
			}
		}
		parts = [];
		assistantParts = [];
		calls = [];
	}
	for (const segment of message.segments) if (segment.type === "tool-result") {
		flush();
		const content = segment.content.map(writeContent);
		result.push({
			role: "tool",
			tool_call_id: segment.callId,
			content: !supportsContentArray || content.every((part) => part.type === "text") ? content.map((part) => part.type === "text" ? part.text : "").join("") : content
		});
	} else if (segment.type === "tool-call") {
		if (role !== "assistant") throw new Error("Only assistant messages can invoke tools");
		calls.push({
			type: "function",
			id: segment.callId,
			function: {
				name: segment.name,
				arguments: segment.arguments
			}
		});
	} else {
		if (calls.length) flush();
		if (role === "assistant") {
			if (segment.type === "refusal") assistantParts.push({
				type: "refusal",
				refusal: segment.text
			});
			else assistantParts.push({
				type: "text",
				text: renderSegmentText(segment)
			});
		} else parts.push(writeContent(segment));
	}
	flush();
	return result;
}
/**
* Projects context directly into Chat Completions messages.
* Array compatibility applies only here. Only matching Chat continuation can bypass portable projection.
* Pure-text arrays become strings. String-only mode also preserves refusal text and omits media.
* Input messages and provider extension fields remain unchanged.
*/
function conversationToChatMessages(conversation, supportsContentArray = true, scope) {
	return conversation.turns.flatMap((turn) => {
		if (turn.type !== "assistant") return renderEntry(projectInput(turn), supportsContentArray);
		return turn.rounds.flatMap((round) => {
			const continuation = round.continuation;
			if (scope && continuation?.protocol === "chat-completions" && continuation.scope === scope) {
				if (!Array.isArray(continuation.data)) throw new Error("Chat continuation must contain a message array");
				return continuation.data.map((message) => {
					if (Array.isArray(message.content) && (!supportsContentArray || message.content.every((part) => part.type === "text"))) return {
						...message,
						content: chatContentToString(message.content)
					};
					return message;
				});
			}
			return projectRound(round).flatMap((entry) => renderEntry(entry, supportsContentArray));
		});
	});
}
//#endregion
//#region src/messages/context-prompt.ts
/**
* Render runtime context modules into a compact, readable text block.
*
* Use when:
* - Composing chat prompts that need to attach side-channel runtime context
*   (e.g. game state, system status) to the latest user message.
*
* Expects:
* - A snapshot keyed by `contextId`. Only the per-message `text` field is
*   included; volatile metadata (random IDs, ms timestamps) is excluded so
*   the output stays deterministic and KV-cache-friendly.
*
* Returns:
* - Empty string when the snapshot is empty.
* - Otherwise a `[Context]` block with one bullet per module, e.g.
*   `[Context]\n- system:minecraft-integration: Bot is online ...`
*
* Why this shape (not XML):
* - Weak local models (8B/14B) tend to mirror conspicuous structured
*   wrappers (`<context>...</context>`) back into their replies, treating
*   them as data to be quoted. A flat bullet list looks like ordinary
*   narrative, which suppresses that mirroring tendency.
* - See: https://github.com/moeru-ai/airi/issues/1539
*/
function formatContextPromptText(contextsSnapshot) {
	const entries = Object.entries(contextsSnapshot);
	if (entries.length === 0) return "";
	const lines = entries.flatMap(([contextId, messages]) => messages.map((m) => `- ${contextId}: ${m.text}`));
	if (lines.length === 0) return "";
	return ["[Context]", ...lines].join("\n");
}
/**
* Builds a user-role context prompt message from active runtime context.
*
* Use when:
* - A caller needs the historical standalone context prompt shape.
*
* Expects:
* - Context messages have already been bucketed and cloned by the context registry.
*
* Returns:
* - `null` when no prompt text is available.
* - A user message carrying the rendered context text otherwise.
*/
function buildContextPromptMessage(contextsSnapshot) {
	const promptText = formatContextPromptText(contextsSnapshot);
	if (!promptText) return null;
	return {
		role: "user",
		content: [{
			type: "text",
			text: promptText
		}]
	};
}
//#endregion
//#region src/messages/datetime-prefix.ts
function padDatePart(value) {
	return value.toString().padStart(2, "0");
}
/**
* Formats a timestamp as `[YYYY-MM-DD HH:MM] ` in the user's local timezone.
*
* Use when:
* - Annotating user messages so the model has a concrete time anchor on
*   every turn — historic and current user turns use the same shape so that
*   prefix-cache stays valid when a "current" turn becomes "historic" on
*   the next send.
* - Not used for assistant messages — that caused the model to mirror the
*   prefix into its own output.
*
* Returns:
* - String including a trailing space, e.g. `"[2026-04-25 18:47] "`.
*
* Before:
* - createdAt = 1745570820000  (a Unix ms in Asia/Shanghai)
*
* After:
* - "[2026-04-25 18:47] "
*/
function formatTimePrefix(createdAt) {
	const date = new Date(createdAt);
	return `[${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())} ${padDatePart(date.getHours())}:${padDatePart(date.getMinutes())}] `;
}
//#endregion
//#region src/messages/preview.ts
function describeSegment(segment) {
	switch (segment.type) {
		case "tool-call": return `${segment.name}(${segment.arguments})`;
		case "tool-result": return segment.content.map(describeSegment).join("");
		case "image": return "[Image]";
		case "audio": return "[Audio]";
		case "file": return `[File: ${segment.name ?? "attachment"}]`;
		case "refusal": return segment.text;
		default: return renderSegmentText(segment);
	}
}
/**
* Builds text-only hook and devtools records, excluding native state and media payloads.
* Media becomes a label, including media in tool results. These records must not feed inference.
*/
function renderConversationPreview(context) {
	return context.turns.flatMap((turn) => {
		if (turn.type !== "assistant") {
			const entry = projectInput(turn);
			return [{
				role: entry.role === "system" || entry.role === "developer" ? entry.role : "user",
				content: entry.segments.map(describeSegment).join("")
			}];
		}
		return turn.rounds.map((round) => ({
			role: "assistant",
			content: round.content.map((part) => {
				if (part.type !== "tool") return describeSegment(part);
				const invocation = round.toolInvocations.find((call) => call.id === part.invocationId);
				if (!invocation) return "[Unknown tool]";
				const output = invocation.execution.status === "succeeded" || invocation.execution.status === "failed" ? invocation.execution.output.map(describeSegment).join("") : `[${invocation.execution.status}]`;
				return `${invocation.name}(${invocation.arguments}): ${output}`;
			}).join("")
		}));
	});
}
//#endregion
//#region src/runtime/agent-hooks.ts
function createChatHooks() {
	const onBeforeMessageComposedHooks = [];
	const onAfterMessageComposedHooks = [];
	const onBeforeSendHooks = [];
	const onAfterSendHooks = [];
	const onTokenLiteralHooks = [];
	const onTokenSpecialHooks = [];
	const onStreamEndHooks = [];
	const onAssistantResponseEndHooks = [];
	const onAssistantMessageHooks = [];
	const onChatTurnCompleteHooks = [];
	function onBeforeMessageComposed(cb) {
		onBeforeMessageComposedHooks.push(cb);
		return () => {
			const index = onBeforeMessageComposedHooks.indexOf(cb);
			if (index >= 0) onBeforeMessageComposedHooks.splice(index, 1);
		};
	}
	function onAfterMessageComposed(cb) {
		onAfterMessageComposedHooks.push(cb);
		return () => {
			const index = onAfterMessageComposedHooks.indexOf(cb);
			if (index >= 0) onAfterMessageComposedHooks.splice(index, 1);
		};
	}
	function onBeforeSend(cb) {
		onBeforeSendHooks.push(cb);
		return () => {
			const index = onBeforeSendHooks.indexOf(cb);
			if (index >= 0) onBeforeSendHooks.splice(index, 1);
		};
	}
	function onAfterSend(cb) {
		onAfterSendHooks.push(cb);
		return () => {
			const index = onAfterSendHooks.indexOf(cb);
			if (index >= 0) onAfterSendHooks.splice(index, 1);
		};
	}
	function onTokenLiteral(cb) {
		onTokenLiteralHooks.push(cb);
		return () => {
			const index = onTokenLiteralHooks.indexOf(cb);
			if (index >= 0) onTokenLiteralHooks.splice(index, 1);
		};
	}
	function onTokenSpecial(cb) {
		onTokenSpecialHooks.push(cb);
		return () => {
			const index = onTokenSpecialHooks.indexOf(cb);
			if (index >= 0) onTokenSpecialHooks.splice(index, 1);
		};
	}
	function onStreamEnd(cb) {
		onStreamEndHooks.push(cb);
		return () => {
			const index = onStreamEndHooks.indexOf(cb);
			if (index >= 0) onStreamEndHooks.splice(index, 1);
		};
	}
	function onAssistantResponseEnd(cb) {
		onAssistantResponseEndHooks.push(cb);
		return () => {
			const index = onAssistantResponseEndHooks.indexOf(cb);
			if (index >= 0) onAssistantResponseEndHooks.splice(index, 1);
		};
	}
	function onAssistantMessage(cb) {
		onAssistantMessageHooks.push(cb);
		return () => {
			const index = onAssistantMessageHooks.indexOf(cb);
			if (index >= 0) onAssistantMessageHooks.splice(index, 1);
		};
	}
	function onChatTurnComplete(cb) {
		onChatTurnCompleteHooks.push(cb);
		return () => {
			const index = onChatTurnCompleteHooks.indexOf(cb);
			if (index >= 0) onChatTurnCompleteHooks.splice(index, 1);
		};
	}
	function clearHooks() {
		onBeforeMessageComposedHooks.length = 0;
		onAfterMessageComposedHooks.length = 0;
		onBeforeSendHooks.length = 0;
		onAfterSendHooks.length = 0;
		onTokenLiteralHooks.length = 0;
		onTokenSpecialHooks.length = 0;
		onStreamEndHooks.length = 0;
		onAssistantResponseEndHooks.length = 0;
		onAssistantMessageHooks.length = 0;
		onChatTurnCompleteHooks.length = 0;
	}
	async function emitBeforeMessageComposedHooks(message, context) {
		for (const hook of onBeforeMessageComposedHooks) await hook(message, context);
	}
	async function emitAfterMessageComposedHooks(message, context) {
		for (const hook of onAfterMessageComposedHooks) await hook(message, context);
	}
	async function emitBeforeSendHooks(message, context) {
		for (const hook of onBeforeSendHooks) await hook(message, context);
	}
	async function emitAfterSendHooks(message, context) {
		for (const hook of onAfterSendHooks) await hook(message, context);
	}
	async function emitTokenLiteralHooks(literal, context) {
		for (const hook of onTokenLiteralHooks) await hook(literal, context);
	}
	async function emitTokenSpecialHooks(special, context) {
		for (const hook of onTokenSpecialHooks) await hook(special, context);
	}
	async function emitStreamEndHooks(context) {
		for (const hook of onStreamEndHooks) await hook(context);
	}
	async function emitAssistantResponseEndHooks(message, context) {
		for (const hook of onAssistantResponseEndHooks) await hook(message, context);
	}
	async function emitAssistantMessageHooks(message, messageText, context) {
		for (const hook of onAssistantMessageHooks) await hook(message, messageText, context);
	}
	async function emitChatTurnCompleteHooks(chat, context) {
		for (const hook of onChatTurnCompleteHooks) await hook(chat, context);
	}
	return {
		onBeforeMessageComposed,
		onAfterMessageComposed,
		onBeforeSend,
		onAfterSend,
		onTokenLiteral,
		onTokenSpecial,
		onStreamEnd,
		onAssistantResponseEnd,
		onAssistantMessage,
		onChatTurnComplete,
		emitBeforeMessageComposedHooks,
		emitAfterMessageComposedHooks,
		emitBeforeSendHooks,
		emitAfterSendHooks,
		emitTokenLiteralHooks,
		emitTokenSpecialHooks,
		emitStreamEndHooks,
		emitAssistantResponseEndHooks,
		emitAssistantMessageHooks,
		emitChatTurnCompleteHooks,
		clearHooks
	};
}
//#endregion
//#region src/runtime/llm-marker-parser.ts
const TAG_OPEN = "<|";
const TAG_CLOSE = "|>";
const ESCAPED_TAG_OPEN = "<{'|'}";
const ESCAPED_TAG_CLOSE = "{'|'}>";
function createPushStream$1() {
	let closed = false;
	let controller = null;
	return {
		stream: new ReadableStream({
			start(ctrl) {
				controller = ctrl;
			},
			cancel() {
				closed = true;
			}
		}),
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
function createLlmMarkerParser(options) {
	const minLiteralEmitLength = Math.max(1, options?.minLiteralEmitLength ?? 1);
	const tailLength = Math.max(1, 5);
	let buffer = "";
	let inTag = false;
	return {
		async consume(textPart, onLiteral, onSpecial) {
			buffer += textPart;
			buffer = buffer.replaceAll(ESCAPED_TAG_OPEN, TAG_OPEN).replaceAll(ESCAPED_TAG_CLOSE, TAG_CLOSE);
			while (buffer.length > 0) if (!inTag) {
				const openTagIndex = buffer.indexOf(TAG_OPEN);
				if (openTagIndex < 0) {
					if (buffer.length - tailLength >= minLiteralEmitLength) {
						const emit = buffer.slice(0, -5);
						buffer = buffer.slice(-5);
						await onLiteral(emit);
					}
					break;
				}
				if (openTagIndex > 0) {
					const emit = buffer.slice(0, openTagIndex);
					buffer = buffer.slice(openTagIndex);
					await onLiteral(emit);
				}
				inTag = true;
			} else {
				const closeTagIndex = buffer.indexOf(TAG_CLOSE);
				if (closeTagIndex < 0) break;
				const emit = buffer.slice(0, closeTagIndex + 2);
				buffer = buffer.slice(closeTagIndex + 2);
				await onSpecial(emit);
				inTag = false;
			}
		},
		/** Emits the text held back to find a marker, unless a marker is still open. */
		async flush(onLiteral) {
			if (!inTag && buffer.length > 0) {
				await onLiteral(buffer);
				buffer = "";
			}
		}
	};
}
function createLlmMarkerStream(input, options) {
	const { stream, write, close, error } = createPushStream$1();
	const parser = createLlmMarkerParser(options);
	readStream(input, async (chunk) => {
		if (typeof chunk !== "string") {
			await parser.flush(async (literal) => {
				write({
					type: "literal",
					value: literal
				});
			});
			write({
				type: "flush",
				flush: chunk
			});
			return;
		}
		await parser.consume(chunk, async (literal) => {
			if (!literal) return;
			write({
				type: "literal",
				value: literal
			});
		}, async (special) => {
			write({
				type: "special",
				value: special
			});
		});
	}).then(async () => {
		await parser.flush(async (literal) => {
			if (!literal) return;
			write({
				type: "literal",
				value: literal
			});
		});
		close();
	}).catch((err) => {
		error(err);
	});
	return stream;
}
/**
* Creates a streaming parser for LLM responses with AIRI special markers.
*
* Use when:
* - Handling streamed model output that may contain `<|...|>` markers.
* - Literal text and special marker tokens need to be emitted separately.
*
* Expects:
* - Callers feed chunks in order, call `flush()` where the text of a model step ends, and call `end()` once the model stream ends.
*
* Returns:
* - A parser with `consume()`, `flush()`, and `end()` methods.
*/
function useLlmmarkerParser(options) {
	let fullText = "";
	const { stream, write, close } = createPushStream$1();
	const processing = readStream(createLlmMarkerStream(stream, { minLiteralEmitLength: options.minLiteralEmitLength }), async (token) => {
		if (token.type === "literal") await options.onLiteral?.(token.value);
		else if (token.type === "special") await options.onSpecial?.(token.value);
		else token.flush.settle();
	});
	return {
		/**
		* Consumes a chunk of text from the stream.
		*
		* @param textPart The chunk of text to consume.
		*/
		async consume(textPart) {
			fullText += textPart;
			write(textPart);
		},
		/**
		* Emits the text that the parser holds back to find a marker, and waits until every literal before this call is handled.
		*
		* Use when the text of a model step ends, for example at a tool call, so the call lands after that text.
		* After `end()`, it settles with the end of parsing.
		*/
		flush() {
			return Promise.race([new Promise((settle) => write({ settle })), processing]);
		},
		/**
		* Finalizes the parsing process.
		* Any remaining content in the buffer is flushed as a final literal part.
		*/
		async end() {
			close();
			await processing;
			await options.onEnd?.(fullText);
		}
	};
}
//#endregion
//#region src/runtime/response-categoriser.ts
/**
* Maps tag names to categories
* All tags are treated as reasoning (filtered from TTS)
*/
function mapTagNameToCategory(_tagName) {
	return "reasoning";
}
/**
* Extracts all XML-like tags from a response using rehype pipeline
* Works with any tag format: <tag>content</tag>
* Only extracts tags that are actually complete (have closing tags in source)
*/
function extractAllTags(response) {
	const tags = [];
	try {
		const tree = unified().use(rehypeParse, { fragment: true }).parse(response);
		visit(tree, "element", (node) => {
			const position = node.position;
			if (!position?.start || !position?.end) return;
			const startIndex = getOffsetFromPosition(response, position.start);
			const endIndex = getOffsetFromPosition(response, position.end);
			if (startIndex === -1 || endIndex === -1) return;
			const fullMatch = response.slice(startIndex, endIndex);
			const expectedClosingTag = `</${node.tagName}>`;
			if (!fullMatch.includes(expectedClosingTag)) return;
			tags.push({
				tagName: node.tagName,
				content: extractTextContent(node),
				fullMatch,
				startIndex,
				endIndex
			});
		});
	} catch (error) {
		console.error("Failed to parse response for tag extraction:", error);
	}
	return tags;
}
/**
* Converts a position (line/column) to a character offset in the string
*/
function getOffsetFromPosition(text, position) {
	if (!position || typeof position.line !== "number" || typeof position.column !== "number") return -1;
	const lines = text.split("\n");
	let offset = 0;
	for (let i = 0; i < position.line - 1 && i < lines.length; i++) offset += lines[i].length + 1;
	offset += position.column - 1;
	return offset;
}
/**
* Extracts text content from an element node
*/
function extractTextContent(node) {
	const textParts = [];
	if (node.children) {
		for (const child of node.children) if (child.type === "text") textParts.push(child.value);
		else if (child.type === "element") textParts.push(extractTextContent(child));
	}
	return textParts.join("");
}
/**
* Categorizes a model response by dynamically extracting any XML-like tags
* Works with any tag format the model uses
*/
function categorizeResponse(response, _providerId) {
	const extractedTags = extractAllTags(response);
	if (extractedTags.length === 0) return {
		segments: [],
		speech: response,
		reasoning: "",
		raw: response
	};
	const segments = extractedTags.map((tag) => ({
		category: mapTagNameToCategory(tag.tagName),
		content: tag.content.trim(),
		startIndex: tag.startIndex,
		endIndex: tag.endIndex,
		raw: tag.fullMatch,
		tagName: tag.tagName
	}));
	segments.sort((a, b) => a.startIndex - b.startIndex);
	const speechParts = [];
	let lastEnd = 0;
	for (const segment of segments) {
		if (segment.startIndex > lastEnd) {
			const text = response.slice(lastEnd, segment.startIndex).trim();
			if (text) speechParts.push(text);
		}
		lastEnd = Math.max(lastEnd, segment.endIndex);
	}
	if (lastEnd < response.length) {
		const text = response.slice(lastEnd).trim();
		if (text) speechParts.push(text);
	}
	const reasoning = segments.filter((s) => s.category === "reasoning").map((s) => s.content).join("\n\n");
	return {
		segments,
		speech: speechParts.join(" ").trim() || "",
		reasoning,
		raw: response
	};
}
/**
* Note: This receives literal text from useLlmmarkerParser (special tokens <|...|> are already extracted).
* Only XML/HTML tags like <think>, <reasoning> need to be parsed here.
*/
function createStreamingCategorizer(providerId, onSegment) {
	let buffer = "";
	let categorized = null;
	let lastEmittedSegmentIndex = -1;
	let lastParsedLength = 0;
	let tagState = "outside";
	let tagStackDepth = 0;
	function checkIncompleteTag() {
		try {
			const source = buffer.replaceAll("&", "&#x26;").replace(/<(?![a-z/!])/gi, "&#x3C;");
			const tree = unified().use(rehypeParse, { fragment: true }).parse(source);
			const stringified = unified().use(rehypeStringify).stringify(tree).toString();
			if (stringified !== source) return source.trim().slice(-30) !== stringified.trim().slice(-30);
			return false;
		} catch {
			return true;
		}
	}
	function processChunkIncrementally(chunk) {
		let tagJustClosed = false;
		for (let i = 0; i < chunk.length; i++) {
			const char = chunk[i];
			switch (tagState) {
				case "outside":
					if (char === "<") {
						if (i + 1 < chunk.length && chunk[i + 1] === "/") {
							tagState = "in-closing-tag";
							i++;
						} else tagState = "in-opening-tag";
					}
					break;
				case "in-opening-tag":
					if (char === ">") {
						tagState = "in-content";
						tagStackDepth++;
					}
					break;
				case "in-content":
					if (char === "<") {
						if (i + 1 < chunk.length && chunk[i + 1] === "/") {
							tagState = "in-closing-tag";
							i++;
						} else tagState = "in-opening-tag";
					}
					break;
				case "in-closing-tag": if (char === ">") {
					tagStackDepth--;
					if (tagStackDepth === 0) {
						tagState = "outside";
						tagJustClosed = true;
					} else tagState = "in-content";
				}
			}
		}
		return tagJustClosed;
	}
	return {
		consume(chunk) {
			const tagJustClosed = processChunkIncrementally(chunk);
			buffer += chunk;
			if (!categorized || tagJustClosed || buffer.length - lastParsedLength > 1e3) {
				categorized = categorizeResponse(buffer, providerId);
				lastParsedLength = buffer.length;
			}
			if (!categorized) {
				categorized = categorizeResponse(buffer, providerId);
				lastParsedLength = buffer.length;
			}
			if (onSegment && categorized.segments.length > 0) for (let i = lastEmittedSegmentIndex + 1; i < categorized.segments.length; i++) {
				const segment = categorized.segments[i];
				if (buffer.length >= segment.endIndex) {
					onSegment(segment);
					lastEmittedSegmentIndex = i;
				}
			}
		},
		/**
		* Checks if the current position in the stream is part of speech content
		* Returns true if the text should be sent to TTS
		*/
		isSpeechAt(position) {
			if (!categorized || categorized.segments.length === 0) return true;
			for (const segment of categorized.segments) if (position >= segment.startIndex && position < segment.endIndex) return false;
			return true;
		},
		/**
		* Filters text to only include speech parts
		* Removes content that falls within thought/reasoning segments
		*/
		filterToSpeech(text, startPosition) {
			if (checkIncompleteTag()) {
				const fullText = buffer + text;
				try {
					const tree = unified().use(rehypeParse, { fragment: true }).parse(fullText);
					let closingOffset = -1;
					visit(tree, "element", (node) => {
						const position = node.position;
						if (position?.end && closingOffset === -1) {
							const endOffset = getOffsetFromPosition(fullText, position.end);
							const elementSource = fullText.slice(getOffsetFromPosition(fullText, position.start), endOffset);
							const expectedClosingTag = `</${node.tagName}>`;
							if (elementSource.includes(expectedClosingTag)) {
								if (endOffset >= buffer.length && endOffset <= fullText.length) closingOffset = endOffset - buffer.length;
							}
						}
					});
					if (closingOffset === -1) return "";
					text = text.slice(closingOffset);
					startPosition += closingOffset;
					categorized = categorizeResponse(buffer, providerId);
				} catch {
					return "";
				}
			}
			if (!categorized || categorized.segments.length === 0) return text;
			let filtered = "";
			const endPosition = startPosition + text.length;
			const overlappingSegments = categorized.segments.filter((segment) => segment.endIndex > startPosition && segment.startIndex < endPosition);
			if (overlappingSegments.length === 0) return text;
			let currentPos = startPosition;
			for (const segment of overlappingSegments) {
				const segmentStart = Math.max(segment.startIndex, startPosition);
				const segmentEnd = Math.min(segment.endIndex, endPosition);
				if (segmentStart > currentPos) {
					const beforeStart = currentPos - startPosition;
					const beforeEnd = segmentStart - startPosition;
					filtered += text.slice(beforeStart, beforeEnd);
				}
				currentPos = segmentEnd;
			}
			if (currentPos < endPosition) {
				const afterStart = currentPos - startPosition;
				filtered += text.slice(afterStart);
			}
			return filtered;
		},
		getCurrentPosition() {
			return buffer.length;
		},
		end() {
			return categorizeResponse(buffer, providerId);
		},
		getCurrent() {
			return categorized;
		}
	};
}
//#endregion
//#region src/runtime/chat-orchestrator-runtime.ts
const REASONING_UI_FLUSH_CHUNK_SIZE = 24;
/**
* Caps repeated reply text in the model prompt. The referenced message remains
* in history, so the prefix only needs enough text to identify it.
*/
const REPLY_PROMPT_REFERENCE_CHARACTER_LIMIT = 480;
function prependTextToContent(msg, text) {
	const content = msg.content;
	if (content === void 0) return {
		...msg,
		content: text
	};
	if (typeof content === "string") return {
		...msg,
		content: `${text}${content}`
	};
	if (Array.isArray(content)) {
		const first = content[0];
		if (first && first.type === "text" && typeof first.text === "string") {
			const next = [{
				...first,
				text: `${text}${first.text}`
			}, ...content.slice(1)];
			return {
				...msg,
				content: next
			};
		}
		return {
			...msg,
			content: [{
				type: "text",
				text
			}, ...content]
		};
	}
	return msg;
}
function getMessageText(message) {
	if (typeof message.content === "string") return message.content;
	if (!Array.isArray(message.content)) return "";
	return message.content.filter((part) => part.type === "text").map((part) => part.text).join("\n");
}
/**
* Formats a model-only reference to the message selected by the user.
*
* @example
* formatReplyPromptPrefix('message-1', new Map([
*   ['message-1', { id: 'message-1', role: 'user', content: 'Earlier turn' }],
* ]))
* // => '[Replying to: Earlier turn]\n'
*/
function formatReplyPromptPrefix(replyToMessageId, messagesById) {
	if (!replyToMessageId) return "";
	const target = messagesById.get(replyToMessageId);
	if (!target) return "";
	const targetText = getMessageText(target).replace(/\s+/g, " ").trim();
	const preview = targetText.length > REPLY_PROMPT_REFERENCE_CHARACTER_LIMIT ? `${targetText.slice(0, 479).trimEnd()}…` : targetText;
	return preview ? `[Replying to: ${preview}]\n` : `[Replying to message: ${replyToMessageId}]\n`;
}
function resolveReplyTargetId(replyToMessageId, messages) {
	if (!replyToMessageId) return void 0;
	return messages.some((message) => message.id === replyToMessageId) ? replyToMessageId : void 0;
}
function cloneStreamingMessage(message) {
	try {
		return structuredClone(message);
	} catch {
		return JSON.parse(JSON.stringify(message));
	}
}
function hasAssistantOutput(message) {
	return message.slices.length > 0 || message.tool_results.length > 0 || (message.citations?.length ?? 0) > 0 || !!message.categorization?.reasoning.trim();
}
function defaultCreateId() {
	return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
/** Releases the request owner on abort even when an external provider does not settle. Late provider output remains signal-guarded. */
async function waitForProvider(work, signal) {
	const cancelled = Promise.withResolvers();
	const abort = () => cancelled.reject(signal.reason);
	signal.addEventListener("abort", abort, { once: true });
	if (signal.aborted) abort();
	try {
		await Promise.race([work, cancelled.promise]);
	} finally {
		signal.removeEventListener("abort", abort);
	}
}
/**
* Creates the core chat orchestrator runtime used behind UI facades.
*
* Use when:
* - A platform wants AIRI chat send orchestration without Vue/Pinia coupling.
* - Session, context, foreground stream, and LLM integrations are provided as adapters.
*
* Expects:
* - Session messages are returned in chronological order.
* - `foregroundStream.patch` replaces the visible streaming assistant message.
*
* Returns:
* - A runtime with send queue APIs, hook registry, writable sending state, and queue snapshots.
*/
function createChatOrchestratorRuntime(deps) {
	const activeSends = /* @__PURE__ */ new Map();
	const sendQueues = /* @__PURE__ */ new Map();
	const historyCuts = /* @__PURE__ */ new Map();
	const hooks = createChatHooks();
	const now = deps.now ?? (() => Date.now());
	const monotonicNow = deps.monotonicNow ?? (() => globalThis.performance?.now?.() ?? Date.now());
	const createId = deps.createId ?? defaultCreateId;
	const unwrapMessage = deps.unwrapMessage ?? ((message) => message);
	let sending = false;
	let activeSendSessionId;
	let activeStreamingMessage;
	let pendingQueuedSends = [];
	function emitStateChange() {
		deps.onStateChange?.({
			activeTurns: [...activeSends].flatMap(([sessionId, active]) => active.turnId && active.message ? [{
				sessionId,
				turnId: active.turnId,
				message: active.message
			}] : []),
			sending,
			activeSendSessionId,
			activeStreamingMessage,
			pendingQueuedSendCount: pendingQueuedSends.length
		});
	}
	function setSending(next) {
		const nextActiveSendSessionId = next ? activeSendSessionId ?? deps.getActiveSessionId() : void 0;
		if (sending === next && activeSendSessionId === nextActiveSendSessionId) return;
		sending = next;
		activeSendSessionId = nextActiveSendSessionId;
		if (!next) activeStreamingMessage = void 0;
		emitStateChange();
	}
	function isForegroundSession(sessionId) {
		return sessionId === deps.getActiveSessionId();
	}
	function beginStream(sessionId, message) {
		const active = activeSends.get(sessionId);
		if (!active) return;
		active.message = cloneStreamingMessage(message);
		sending = true;
		activeSendSessionId = sessionId;
		activeStreamingMessage = cloneStreamingMessage(message);
		emitStateChange();
		if (isForegroundSession(sessionId)) deps.foregroundStream.patch(cloneStreamingMessage(message));
	}
	function updateStream(sessionId, message) {
		const active = activeSends.get(sessionId);
		if (!active) return;
		active.message = cloneStreamingMessage(message);
		if (sessionId === activeSendSessionId) activeStreamingMessage = active.message;
		emitStateChange();
		if (isForegroundSession(sessionId)) deps.foregroundStream.patch(cloneStreamingMessage(message));
	}
	function resetForegroundStream(sessionId) {
		if (isForegroundSession(sessionId)) deps.foregroundStream.reset();
	}
	function ingestRuntimeContexts() {
		for (const provider of deps.runtimeContextProviders ?? []) {
			const contextMessage = provider();
			if (contextMessage) deps.context.ingest(contextMessage);
		}
	}
	function getStablePromptTimestamp(message, fallbackCreatedAt) {
		if (typeof message.createdAt === "number") return message.createdAt;
		message.createdAt = fallbackCreatedAt;
		return fallbackCreatedAt;
	}
	function buildContext(history) {
		const nowTs = now();
		const messagesById = new Map(history.flatMap((message) => message.id ? [[message.id, message]] : []));
		return { turns: history.flatMap((message, historyIndex) => {
			if (message.role === "assistant" && message.generationTranscript) return [structuredClone(unwrapMessage(message.generationTranscript))];
			const noticePrefix = message.role === "user" && message.notice ? `[Notice from ${message.notice.source}, not a message from the owner.]\n` : "";
			const source = message.role === "user" ? prependTextToContent(unwrapMessage(message), `${formatTimePrefix(getStablePromptTimestamp(message, nowTs))}${noticePrefix}${formatReplyPromptPrefix(message.replyToMessageId, messagesById)}`) : unwrapMessage(message);
			const turns = chatMessagesToTurns(source.role === "assistant" && source.providerTranscript?.length ? source.providerTranscript : [source], message.id ?? `history-${historyIndex}`);
			if (message.role === "user" && message.skills?.length) {
				const userTurn = turns.find((turn) => turn.type === "user");
				if (userTurn?.type === "user") userTurn.content.push(...message.skills.map((skill) => ({
					type: "text",
					text: `\n\n[The owner used the skill "${skill.name}". Follow its steps in this reply and in later replies while they fit.]\n${skill.instructions}`
				})));
			}
			return turns;
		}) };
	}
	function trimConversationHistory(sessionId, generation, history, contextWindow) {
		if (contextWindow === void 0 || !Number.isInteger(contextWindow) || contextWindow < 0) {
			historyCuts.delete(sessionId);
			return history;
		}
		const systemMessages = history.filter((message) => message.role === "system");
		if (contextWindow === 0) {
			historyCuts.delete(sessionId);
			const currentInput = history.findLast((message) => message.role === "user");
			return currentInput ? [...systemMessages, currentInput] : systemMessages;
		}
		const previous = historyCuts.get(sessionId);
		const anchor = previous?.limit === contextWindow && previous.generation === generation ? previous.start : void 0;
		const turnStarts = [];
		let userStart;
		let reachedAnchor = false;
		for (let index = history.length - 1; index >= 0; index--) {
			const message = history[index];
			if (message.role === "user") {
				userStart = index;
				if (anchor && (anchor.id ? message.id === anchor.id : message === anchor)) reachedAnchor = true;
			} else if ((message.role === "assistant" || message.role === "tool") && userStart !== void 0) {
				turnStarts.push(userStart);
				userStart = void 0;
				if (reachedAnchor || turnStarts.length > contextWindow) break;
			}
		}
		if (userStart !== void 0) turnStarts.push(userStart);
		const retainedTurns = Math.ceil(contextWindow * .9);
		const start = turnStarts.length > contextWindow ? turnStarts[retainedTurns - 1] : turnStarts.at(-1) ?? history.length;
		const nextAnchor = history[start];
		if (nextAnchor) historyCuts.set(sessionId, {
			limit: contextWindow,
			generation,
			start: nextAnchor
		});
		else historyCuts.delete(sessionId);
		return [...systemMessages, ...history.slice(start).filter((message) => message.role !== "system")];
	}
	async function performSend(sendingMessage, options, generation, sessionId, abortSignal, activeProvider, accepted) {
		if (!sendingMessage && !options.attachments?.length) return;
		const existingSessionMessages = deps.session.getSessionMessages(sessionId);
		let replyToMessageId = resolveReplyTargetId(options.replyToMessageId, existingSessionMessages);
		const turnIndex = existingSessionMessages.filter((message) => message.role === "user").length + 1;
		const isActivationAttempt = !existingSessionMessages.some((message) => message.role === "assistant" && !message.interrupted);
		ingestRuntimeContexts();
		const sendingCreatedAt = now();
		const streamContextMessageId = createId();
		const assistantMessageId = createId();
		const roundId = options.messageId ?? createId();
		const streamingMessageContext = {
			sessionId,
			turnId: roundId,
			message: {
				role: "user",
				content: sendingMessage,
				createdAt: sendingCreatedAt,
				id: streamContextMessageId,
				...replyToMessageId ? { replyToMessageId } : {}
			},
			contexts: deps.context.snapshot(),
			composedMessage: [],
			input: options.input,
			speaks: !options.background && !options.scene
		};
		deps.onLifecycle?.({
			phase: "before-compose",
			channel: "chat",
			sessionId,
			textPreview: sendingMessage,
			details: { contexts: streamingMessageContext.contexts }
		});
		const isStaleGeneration = () => deps.session.getSessionGeneration(sessionId) !== generation;
		const shouldAbort = () => isStaleGeneration() || abortSignal.aborted;
		if (shouldAbort()) return;
		const buildingMessage = {
			role: "assistant",
			content: "",
			slices: [],
			tool_results: [],
			createdAt: now(),
			id: assistantMessageId,
			...options.notice ? { proactive: {
				turnId: roundId,
				source: options.notice.source
			} } : {}
		};
		const storeInterruptedAssistant = () => deps.session.commitAssistantMessage(sessionId, {
			...cloneStreamingMessage(buildingMessage),
			id: assistantMessageId,
			interrupted: true,
			completedAt: now()
		}).catch((error) => console.error("Failed to store an interrupted assistant message:", error));
		const pendingSlices = /* @__PURE__ */ new Set();
		const contentCalls = /* @__PURE__ */ new Map();
		const openContentCalls = /* @__PURE__ */ new Set();
		function preservePendingSlices() {
			buildingMessage.slices.push(...pendingSlices);
			pendingSlices.clear();
		}
		activeSends.get(sessionId).turnId = roundId;
		beginStream(sessionId, buildingMessage);
		const hasVoice = options.input?.type === "input:voice" || options.input?.type === "input:text:voice";
		const sendSource = hasVoice ? "voice" : "text";
		const correlation = {
			conversationId: sessionId,
			roundId,
			turnIndex
		};
		deps.onTrackFirstMessage?.();
		if (isActivationAttempt) deps.onChatActivationStarted?.({
			...correlation,
			source: sendSource,
			model: options.model,
			provider: activeProvider
		});
		deps.onMessageSendStarted?.({
			...correlation,
			source: sendSource,
			model: options.model
		});
		const roundStartedAt = monotonicNow();
		let assistantStored = false;
		let generationCompleted = false;
		let failed = false;
		try {
			await hooks.emitBeforeMessageComposedHooks(sendingMessage, streamingMessageContext);
			const contentParts = [{
				type: "text",
				text: sendingMessage
			}];
			if (options.attachments) for (const attachment of options.attachments) {
				if (attachment.type === "audio") contentParts.push({
					type: "input_audio",
					input_audio: {
						data: attachment.url ?? attachment.data,
						format: attachment.mimeType === "audio/wav" ? "wav" : "mp3"
					}
				});
				if (attachment.type === "image") contentParts.push({
					type: "image_url",
					image_url: { url: attachment.url ?? `data:${attachment.mimeType};base64,${attachment.data}` }
				});
			}
			const finalContent = contentParts.length > 1 ? contentParts : sendingMessage;
			const audioTranscripts = options.attachments?.filter((attachment) => attachment.type === "audio").map((attachment) => attachment.transcript ?? "");
			if (!streamingMessageContext.input) streamingMessageContext.input = {
				type: "input:text",
				data: { text: sendingMessage }
			};
			if (shouldAbort()) return;
			replyToMessageId = resolveReplyTargetId(options.replyToMessageId, deps.session.getSessionMessages(sessionId));
			if (replyToMessageId) streamingMessageContext.message.replyToMessageId = replyToMessageId;
			else delete streamingMessageContext.message.replyToMessageId;
			const userMessage = {
				role: "user",
				content: finalContent,
				createdAt: sendingCreatedAt,
				id: roundId,
				...replyToMessageId ? { replyToMessageId } : {},
				...options.toolReferences?.length ? { tools: options.toolReferences } : {},
				...options.skills?.length ? { skills: options.skills.map((skill) => ({ ...skill })) } : {},
				...audioTranscripts?.some(Boolean) ? { audioTranscripts } : {},
				...options.notice ? { notice: { source: options.notice.source } } : {}
			};
			const receipt = await deps.session.commitUserMessage(sessionId, userMessage);
			accepted.resolve({
				sessionId,
				messageId: receipt.messageId
			});
			if (receipt.status === "existing" || shouldAbort()) {
				resetForegroundStream(sessionId);
				return;
			}
			if (!options.notice) deps.onUserMessageAppended?.({
				sessionId,
				message: userMessage,
				messageText: sendingMessage,
				source: sendSource,
				model: options.model,
				provider: activeProvider,
				roundId,
				turnIndex
			});
			const sessionMessagesForSend = deps.session.getSessionMessages(sessionId);
			deps.onUserTurnReady?.({
				sessionId,
				messageText: sendingMessage,
				sessionMessages: sessionMessagesForSend
			});
			const categorizer = createStreamingCategorizer(activeProvider);
			let streamPosition = 0;
			let pendingSpeechWhitespace = "";
			let speechStarted = false;
			const stickers = options.stickers;
			let stickerEmitted = false;
			const parser = useLlmmarkerParser({
				onLiteral: async (literal) => {
					if (shouldAbort()) return;
					categorizer.consume(literal);
					let speechOnly = categorizer.filterToSpeech(literal, streamPosition);
					streamPosition += literal.length;
					if (speechOnly) {
						if (!speechStarted) {
							pendingSpeechWhitespace += speechOnly;
							if (!pendingSpeechWhitespace.trim()) return;
							speechOnly = pendingSpeechWhitespace;
							pendingSpeechWhitespace = "";
							speechStarted = true;
						}
						buildingMessage.content += speechOnly;
						await hooks.emitTokenLiteralHooks(speechOnly, streamingMessageContext);
						if (shouldAbort()) return;
						if (openContentCalls.size === 0 && speechOnly.trim()) delete buildingMessage.pendingContent;
						const lastSlice = buildingMessage.slices.at(-1);
						if (lastSlice?.type === "text") lastSlice.text += speechOnly;
						else buildingMessage.slices.push({
							type: "text",
							text: speechOnly
						});
						updateStream(sessionId, buildingMessage);
					}
				},
				onSpecial: async (special) => {
					if (shouldAbort()) return;
					if (/^<\|STICKER\b/.test(special)) {
						if (!categorizer.filterToSpeech(special, streamPosition)) return;
						const id = /^<\|STICKER ([a-z0-9-]+)\|>$/.exec(special)?.[1];
						if (!stickerEmitted && id && stickers?.some((sticker) => sticker.id === id)) {
							buildingMessage.slices.push({
								type: "sticker",
								stickerId: id
							});
							stickerEmitted = true;
							updateStream(sessionId, buildingMessage);
						}
						return;
					}
					await hooks.emitTokenSpecialHooks(special, streamingMessageContext);
				},
				onEnd: async (fullText) => {
					if (shouldAbort()) return;
					const finalCategorization = categorizeResponse(fullText.replace(/<(?:\||\{'\|'\})STICKER\b[\s\S]*?(?:(?:\||\{'\|'\})>|$)/g, ""), activeProvider);
					const reasoningContentField = buildingMessage.categorization?.reasoning?.trim();
					buildingMessage.categorization = {
						speech: finalCategorization.speech,
						reasoning: reasoningContentField || finalCategorization.reasoning
					};
					updateStream(sessionId, buildingMessage);
				},
				minLiteralEmitLength: 1
			});
			const toolCallQueue = createQueue({ handlers: [async (ctx) => {
				if (shouldAbort()) return;
				if (ctx.data.type === "tool-call") {
					if (!pendingSlices.delete(ctx.data)) return;
					buildingMessage.slices.push(ctx.data);
					updateStream(sessionId, buildingMessage);
					return;
				}
				if (ctx.data.type === "tool-call-result") {
					buildingMessage.tool_results.push(ctx.data);
					updateStream(sessionId, buildingMessage);
					return;
				}
				if (ctx.data.type === "card") {
					if (!pendingSlices.delete(ctx.data)) return;
					buildingMessage.slices.push(ctx.data);
					delete buildingMessage.pendingContent;
					updateStream(sessionId, buildingMessage);
				}
			}] });
			const systemPrompt = deps.getSystemPrompt?.(sessionId);
			const context = buildContext(trimConversationHistory(sessionId, generation, deps.getSystemPrompt ? sessionMessagesForSend.filter((message) => message.role !== "system") : sessionMessagesForSend, deps.getContextWindow?.(sessionId)));
			if (options.notice) {
				const lastTurn = context.turns.at(-1);
				if (lastTurn?.type === "user") lastTurn.content.push({
					type: "text",
					text: "\n[Speak about this notice only if it fits now, or stay quiet.]"
				});
			}
			if (systemPrompt?.trim()) context.turns.unshift({
				id: "system-identity",
				type: "system",
				authority: "system",
				content: [{
					type: "text",
					text: systemPrompt
				}]
			});
			const stickerPrompt = stickers?.length ? [
				"You can send one optional sticker per reply with a marker from this catalog.",
				"Use stickers when the user requests one or when a lighthearted response fits. Avoid them in serious conversations.",
				"Keep your text complete. Never invent sticker IDs or image URLs.",
				"Choose the ID whose name and emotion tags best fit the conversation.",
				...stickers.map((sticker) => `<|STICKER ${sticker.id}|>: ${sticker.description}`)
			].join("\n") : "";
			const systemPromptSupplement = [options.systemPromptSupplement?.trim(), stickerPrompt].filter(Boolean).join("\n\n");
			if (systemPromptSupplement) {
				const systemMessage = context.turns.find((turn) => turn.type === "system" && turn.authority === "system");
				if (systemMessage?.type === "system") systemMessage.content.push({
					type: "text",
					text: `\n\n${systemPromptSupplement}`
				});
				else context.turns.unshift({
					id: "system-supplement",
					type: "system",
					authority: "system",
					content: [{
						type: "text",
						text: systemPromptSupplement
					}]
				});
			}
			const contextsSnapshot = deps.context.snapshot();
			const entries = Object.entries(contextsSnapshot).flatMap(([source, messages]) => messages.map((message) => ({
				source,
				text: message.text
			})));
			if (entries.length) {
				const lastMessage = context.turns.at(-1);
				if (lastMessage?.type === "user") lastMessage.content.push({
					type: "runtime-context",
					entries
				});
				deps.onLifecycle?.({
					phase: "prompt-context-built",
					channel: "chat",
					sessionId,
					details: { contexts: contextsSnapshot }
				});
			}
			streamingMessageContext.composedMessage = renderConversationPreview(context);
			deps.onPromptProjection?.({
				sessionId,
				message: sendingMessage,
				contexts: contextsSnapshot,
				composedMessage: streamingMessageContext.composedMessage
			});
			deps.onLifecycle?.({
				phase: "after-compose",
				channel: "chat",
				sessionId,
				textPreview: sendingMessage,
				details: { composedMessage: streamingMessageContext.composedMessage }
			});
			await hooks.emitAfterMessageComposedHooks(sendingMessage, streamingMessageContext);
			await hooks.emitBeforeSendHooks(sendingMessage, streamingMessageContext);
			let fullText = "";
			const headers = options.providerConfig?.headers || {};
			if (shouldAbort()) return;
			const llmRequestStartedAt = monotonicNow();
			let llmFirstTokenEmitted = false;
			let generationUsage = { source: "unavailable" };
			let generatedTurn;
			deps.onLlmRequestStarted?.({
				...correlation,
				model: options.model,
				provider: activeProvider || "unknown",
				hasVoice
			});
			const resolveOwnerStep = options.resolveStep;
			await waitForProvider(deps.llm.stream(options.model, options.chatProvider, context, {
				headers,
				providerId: activeProvider,
				resolveStep: resolveOwnerStep ? async () => {
					const step = await resolveOwnerStep();
					return {
						...step,
						systemPrompt: [step.systemPrompt, systemPromptSupplement].filter(Boolean).join("\n\n")
					};
				} : void 0,
				supportsAudioInput: options.supportsAudioInput,
				supportsVisionInput: options.supportsVisionInput,
				abortSignal,
				onGeneratedTurn: (turn) => {
					generatedTurn = structuredClone(turn);
				},
				requestCorrelation: {
					conversationId: correlation.conversationId,
					turnId: correlation.roundId
				},
				tools: options.tools,
				temperature: options.temperature,
				topP: options.topP,
				waitForTools: true,
				onUsage: (usage) => {
					if (shouldAbort()) return;
					generationUsage = usage;
					deps.onLlmGeneration?.({
						...correlation,
						model: options.model,
						provider: activeProvider,
						inputTokens: usage.inputTokens,
						outputTokens: usage.outputTokens,
						totalTokens: usage.totalTokens,
						usageSource: usage.source
					});
				},
				onStreamEvent: async (event) => {
					if (shouldAbort()) return;
					switch (event.type) {
						case "search":
							buildingMessage.search = {
								id: event.id,
								status: event.status
							};
							updateStream(sessionId, buildingMessage);
							break;
						case "citations":
							buildingMessage.citations = [...buildingMessage.citations ?? [], ...event.citations];
							updateStream(sessionId, buildingMessage);
							break;
						case "tool-call-start": {
							const content = deps.toolContents?.[event.toolName];
							if (content) {
								openContentCalls.add(event.toolCallId);
								buildingMessage.pendingContent = content.kind;
								updateStream(sessionId, buildingMessage);
							}
							break;
						}
						case "tool-call": {
							const content = deps.toolContents?.[event.toolName];
							if (content) {
								const flushed = parser.flush().catch(() => void 0);
								contentCalls.set(event.toolCallId, {
									content,
									args: event.args,
									flushed
								});
								openContentCalls.add(event.toolCallId);
								buildingMessage.pendingContent = content.kind;
								updateStream(sessionId, buildingMessage);
								break;
							}
							const call = {
								type: "tool-call",
								toolCall: event
							};
							pendingSlices.add(call);
							const enqueue = () => {
								if (pendingSlices.has(call)) toolCallQueue.enqueue(call);
							};
							parser.flush().then(enqueue, enqueue);
							break;
						}
						case "tool-result": {
							const contentCall = contentCalls.get(event.toolCallId);
							if (contentCall) {
								contentCalls.delete(event.toolCallId);
								openContentCalls.delete(event.toolCallId);
								const slices = contentCall.content.contentOf(contentCall.args, event.result);
								slices.forEach((slice) => pendingSlices.add(slice));
								contentCall.flushed.then(() => slices.forEach((slice) => {
									if (pendingSlices.has(slice)) toolCallQueue.enqueue(slice);
								}));
								break;
							}
							toolCallQueue.enqueue({
								type: "tool-call-result",
								id: event.toolCallId,
								result: event.result
							});
							break;
						}
						case "tool-error":
							openContentCalls.delete(event.toolCallId);
							if (contentCalls.delete(event.toolCallId)) break;
							toolCallQueue.enqueue({
								type: "tool-call-result",
								id: event.toolCallId,
								isError: true,
								result: event.result
							});
							break;
						case "text-delta":
							if (!llmFirstTokenEmitted) {
								llmFirstTokenEmitted = true;
								deps.onLlmFirstToken?.({
									...correlation,
									model: options.model,
									ttfbMs: Math.round(monotonicNow() - llmRequestStartedAt)
								});
							}
							fullText += event.text;
							await parser.consume(event.text);
							break;
						case "reasoning-delta": {
							if (shouldAbort()) return;
							const { reasoning = "" } = buildingMessage.categorization ?? {};
							const nextReasoning = reasoning + event.text;
							buildingMessage.categorization = {
								speech: typeof buildingMessage.content === "string" ? buildingMessage.content : "",
								reasoning: nextReasoning
							};
							const crossesBoundary = Math.floor(nextReasoning.length / REASONING_UI_FLUSH_CHUNK_SIZE) > Math.floor(reasoning.length / REASONING_UI_FLUSH_CHUNK_SIZE);
							if (!reasoning || crossesBoundary) updateStream(sessionId, buildingMessage);
							break;
						}
						case "finish": break;
						case "error": throw event.error ?? /* @__PURE__ */ new Error("Stream error");
					}
				}
			}), abortSignal);
			if (shouldAbort()) return;
			await parser.end();
			if (shouldAbort()) return;
			generationCompleted = true;
			buildingMessage.generationTranscript = generatedTurn;
			try {
				deps.onAssistantResponseRendered?.({
					...correlation,
					model: options.model,
					latencyMs: Math.round(monotonicNow() - llmRequestStartedAt)
				});
			} catch (error) {
				console.error("Assistant response observer failed:", error);
			}
			const hasVisibleReply = buildingMessage.slices.some((slice) => slice.type === "sticker" || slice.type === "card" || slice.type === "tool-call" || slice.type === "text" && Boolean(slice.text.trim()));
			const silent = Boolean(options.notice) && !hasVisibleReply;
			if (!silent && !shouldAbort() && (buildingMessage.slices.length > 0 || generatedTurn?.rounds.length)) {
				const finalAssistant = buildingMessage;
				finalAssistant.completedAt = now();
				await deps.session.commitAssistantMessage(sessionId, {
					...finalAssistant,
					id: assistantMessageId
				});
				assistantStored = true;
				deps.onAssistantMessageAppended?.({
					sessionId,
					roundId,
					message: finalAssistant,
					messageText: fullText
				});
			}
			if (shouldAbort()) return;
			await hooks.emitStreamEndHooks(streamingMessageContext);
			if (shouldAbort()) return;
			await hooks.emitAssistantResponseEndHooks(fullText, streamingMessageContext);
			if (shouldAbort()) return;
			await hooks.emitAfterSendHooks(sendingMessage, streamingMessageContext);
			if (shouldAbort()) return;
			if (!silent) await hooks.emitAssistantMessageHooks({ ...buildingMessage }, fullText, streamingMessageContext);
			if (shouldAbort()) return;
			await hooks.emitChatTurnCompleteHooks({
				output: { ...buildingMessage },
				outputText: fullText,
				toolCalls: sessionMessagesForSend.filter((msg) => msg.role === "tool")
			}, streamingMessageContext);
			if (shouldAbort()) return;
			deps.onAssistantTurnReady?.({
				sessionId,
				messageText: fullText,
				sessionMessages: sessionMessagesForSend
			});
			resetForegroundStream(sessionId);
			const durationMs = Math.round(monotonicNow() - roundStartedAt);
			deps.onMessageRound?.({
				...correlation,
				durationMs,
				hasVoice,
				model: options.model,
				inputTokens: generationUsage.inputTokens,
				outputTokens: generationUsage.outputTokens,
				totalTokens: generationUsage.totalTokens,
				usageSource: generationUsage.source
			});
			if (isActivationAttempt) deps.onChatActivationSucceeded?.({
				...correlation,
				durationMs,
				source: sendSource,
				model: options.model,
				provider: activeProvider
			});
		} catch (error) {
			if (shouldAbort()) return;
			failed = true;
			preservePendingSlices();
			if (!assistantStored && !generationCompleted && hasAssistantOutput(buildingMessage)) await storeInterruptedAssistant();
			resetForegroundStream(sessionId);
			console.error("Error sending message:", error);
			deps.onMessageRoundFailed?.({
				...correlation,
				source: sendSource,
				model: options.model,
				provider: activeProvider,
				failureStage: "llm_response",
				errorCode: "llm_response_failed"
			});
			if (isActivationAttempt) deps.onChatActivationFailed?.({
				...correlation,
				source: sendSource,
				model: options.model,
				provider: activeProvider,
				failureStage: "llm_response",
				errorCode: "llm_response_failed"
			});
			throw error;
		} finally {
			if (abortSignal.aborted && !isStaleGeneration()) preservePendingSlices();
			pendingSlices.clear();
			if (!assistantStored && !generationCompleted && abortSignal.aborted && !isStaleGeneration() && hasAssistantOutput(buildingMessage)) {
				await storeInterruptedAssistant();
				resetForegroundStream(sessionId);
			}
			activeSends.delete(sessionId);
			sending = activeSends.size > 0;
			if (activeSendSessionId === sessionId) {
				activeSendSessionId = activeSends.keys().next().value;
				activeStreamingMessage = activeSendSessionId ? activeSends.get(activeSendSessionId)?.message : void 0;
			}
			emitStateChange();
			deps.onSendSettled?.({
				sessionId,
				turnId: roundId,
				status: shouldAbort() ? "cancelled" : failed ? "failed" : "finished"
			});
		}
	}
	/** Each session owns its FIFO. A blocked provider cannot prevent another session from starting. */
	function queueFor(sessionId) {
		const existing = sendQueues.get(sessionId);
		if (existing) return existing;
		const sendQueue = createQueue({ handlers: [async ({ data }) => {
			const { sendingMessage, options, generation, deferred, sessionId, cancelled, providerId } = data;
			if (cancelled) return;
			if (deps.session.getSessionGeneration(sessionId) !== generation) {
				const error = /* @__PURE__ */ new Error("Chat session was reset before send could start");
				data.accepted.reject(error);
				deferred.reject(error);
				return;
			}
			const controller = new AbortController();
			activeSends.set(sessionId, { controller });
			try {
				await performSend(sendingMessage, options, generation, sessionId, options.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal, providerId, data.accepted);
				deferred.resolve();
			} catch (error) {
				data.accepted.reject(error);
				deferred.reject(error);
			} finally {
				data.accepted.reject(/* @__PURE__ */ new Error("Chat request ended before persistence"));
				activeSends.delete(sessionId);
			}
		}] });
		sendQueue.on("enqueue", (queuedSend) => {
			pendingQueuedSends.push(queuedSend);
			emitStateChange();
		});
		sendQueue.on("dequeue", (queuedSend) => {
			pendingQueuedSends = pendingQueuedSends.filter((item) => item !== queuedSend);
			emitStateChange();
		});
		sendQueue.on("drain", () => {
			if (sendQueues.get(sessionId) === sendQueue) sendQueues.delete(sessionId);
		});
		sendQueues.set(sessionId, sendQueue);
		return sendQueue;
	}
	function submit(sendingMessage, options, targetSessionId) {
		const sessionId = targetSessionId ?? deps.getActiveSessionId();
		const generation = deps.session.getSessionGeneration(sessionId);
		const accepted = Promise.withResolvers();
		const deferred = Promise.withResolvers();
		accepted.promise.catch(() => {});
		deferred.promise.catch(() => {});
		queueFor(sessionId).enqueue({
			providerId: options.providerId ?? deps.getActiveProvider?.() ?? "",
			sendingMessage,
			options: {
				...options,
				systemPromptSupplement: options.systemPromptSupplement ?? deps.getSystemPromptSupplement?.(),
				stickers: options.stickers?.map(({ id, description }) => ({
					id,
					description
				}))
			},
			generation,
			sessionId,
			accepted,
			deferred
		});
		return {
			accepted: accepted.promise,
			done: deferred.promise
		};
	}
	function ingest(sendingMessage, options, targetSessionId) {
		return submit(sendingMessage, options, targetSessionId).done;
	}
	function cancelPendingSends(sessionId) {
		if (sessionId) historyCuts.delete(sessionId);
		else historyCuts.clear();
		for (const [activeSessionId, active] of activeSends) if (!sessionId || sessionId === activeSessionId) active.controller.abort(/* @__PURE__ */ new Error("Chat session send was cancelled"));
		for (const queued of pendingQueuedSends) {
			if (sessionId && queued.sessionId !== sessionId) continue;
			queued.cancelled = true;
			const error = /* @__PURE__ */ new Error("Chat session was reset before send could start");
			queued.accepted.reject(error);
			queued.deferred.reject(error);
		}
		pendingQueuedSends = sessionId ? pendingQueuedSends.filter((item) => item.sessionId !== sessionId) : [];
		emitStateChange();
	}
	function cancelTurn(turn) {
		if (activeSends.get(turn.sessionId)?.turnId === turn.turnId) activeSends.get(turn.sessionId)?.controller.abort(/* @__PURE__ */ new Error("Chat turn was cancelled"));
		for (const queued of pendingQueuedSends) {
			if (queued.sessionId !== turn.sessionId || queued.options.messageId !== turn.turnId) continue;
			queued.cancelled = true;
			const error = /* @__PURE__ */ new Error("Chat turn was cancelled before it started");
			queued.accepted.reject(error);
			queued.deferred.reject(error);
		}
		pendingQueuedSends = pendingQueuedSends.filter((queued) => !queued.cancelled);
		emitStateChange();
	}
	function getPendingQueuedSendSnapshot() {
		return pendingQueuedSends.map((queued) => ({
			sessionId: queued.sessionId,
			generation: queued.generation,
			cancelled: !!queued.cancelled,
			messagePreview: queued.sendingMessage.slice(0, 120),
			hasAttachments: !!queued.options.attachments?.length,
			inputType: queued.options.input?.type
		}));
	}
	return {
		cancelTurn,
		submit,
		ingest,
		cancelPendingSends,
		getPendingQueuedSendSnapshot,
		getPendingQueuedSendCount: () => pendingQueuedSends.length,
		getSending: () => sending,
		setSending,
		hooks
	};
}
//#endregion
//#region src/runtime/context-registry.ts
const CONTEXT_UPDATE_REPLACE_SELF = "replace-self";
const CONTEXT_UPDATE_APPEND_SELF = "append-self";
function formatMetadataSource(source) {
	if (!source) return void 0;
	if ("extension" in source) return `${source.extension.id}:${source.id}`;
	return source.id;
}
function defaultGetSourceKey(event, fallback = "unknown") {
	return formatMetadataSource(event.metadata?.source) ?? event.source ?? fallback;
}
/**
* Creates a context registry that owns active buckets and bounded ingest history.
*
* Use when:
* - Runtime contexts need replace-self or append-self bucket semantics.
* - UI or transport layers need cloned snapshots without owning mutation policy.
*
* Expects:
* - Context messages are structured-cloneable before they enter the registry.
* - Unknown strategies should still be recorded in history for observability.
*
* Returns:
* - A registry whose snapshots cannot mutate internal active bucket state.
*/
function createContextRegistry(options = {}) {
	const historyLimit = options.historyLimit ?? 400;
	const getSourceKey = options.getSourceKey ?? defaultGetSourceKey;
	let currentActiveContexts = /* @__PURE__ */ new Map();
	let currentContextHistory = [];
	function ingest(envelope) {
		const sourceKey = getSourceKey(envelope);
		const safeEnvelopeToStore = structuredClone(envelope);
		if (!currentActiveContexts.has(sourceKey)) currentActiveContexts.set(sourceKey, []);
		let result;
		if (envelope.strategy === CONTEXT_UPDATE_REPLACE_SELF) {
			currentActiveContexts.set(sourceKey, [safeEnvelopeToStore]);
			result = {
				sourceKey,
				mutation: "replace",
				entryCount: currentActiveContexts.get(sourceKey)?.length ?? 0
			};
		} else if (envelope.strategy === CONTEXT_UPDATE_APPEND_SELF) {
			currentActiveContexts.get(sourceKey)?.push(safeEnvelopeToStore);
			result = {
				sourceKey,
				mutation: "append",
				entryCount: currentActiveContexts.get(sourceKey)?.length ?? 0
			};
		}
		currentContextHistory = [...currentContextHistory, {
			...safeEnvelopeToStore,
			sourceKey
		}].slice(-historyLimit);
		return result;
	}
	function reset() {
		currentActiveContexts = /* @__PURE__ */ new Map();
		currentContextHistory = [];
	}
	function snapshot() {
		return Object.fromEntries(Array.from(currentActiveContexts, ([sourceKey, messages]) => [sourceKey, structuredClone(messages)]));
	}
	return {
		ingest,
		reset,
		removeWriter: (sourceKey) => currentActiveContexts.delete(sourceKey),
		snapshot,
		activeContexts: snapshot,
		contextHistory: () => structuredClone(currentContextHistory)
	};
}
//#endregion
//#region src/runtime/generation.ts
/** A generation is owned by its caller's turn; anonymous callers receive an independent identity. */
function createAssistantTurn(turnId, runId) {
	return {
		type: "assistant",
		id: turnId ?? nanoid(),
		runId,
		status: "completed",
		rounds: []
	};
}
/**
* Saves the native step even when its portable content is unknown. A later protocol change reports
* projectionIssues instead of silently omitting data. SDK tool failures stay attached to their call.
*/
function recordRound(turn, native, step, model, roundOffset, decode) {
	const id = `${turn.id}/${roundOffset + turn.rounds.length}`;
	const entries = [];
	const issues = [];
	for (const item of native.data) try {
		entries.push(...decode(item));
	} catch (error) {
		issues.push(errorMessageFrom(error) ?? "Unknown native content");
	}
	const round = readRound(id, entries);
	round.projectionIssues.push(...issues);
	round.modelCall = {
		model,
		finishReason: step.finishReason,
		usage: step.usage
	};
	round.continuation = native;
	for (const result of step.toolResults) {
		const invocation = round.toolInvocations.find((call) => call.callId === result.toolCallId);
		if (invocation && result.isError && invocation.execution.status === "succeeded") invocation.execution = {
			...invocation.execution,
			status: "failed"
		};
	}
	turn.rounds.push(round);
	return round;
}
/**
* Owns step boundaries and produces a turn only after all model and tool steps settle.
* Each adapter supplies its native envelope and portable projection policy.
*/
function createGeneration(input) {
	const starts = [];
	const models = [];
	/** SDK snapshots mark step starts; only offsets remain owned by this generation. */
	function prepareStep({ input: current, model }) {
		starts.push(current.length);
		models.push(model ?? input.model);
		return {};
	}
	async function complete(items, steps) {
		const [final, completedSteps] = await Promise.all([items, steps]);
		const turn = createAssistantTurn(input.turnId, input.runId);
		for (const [index, step] of completedSteps.entries()) {
			const start = starts[index];
			if (start === void 0) throw new Error("Missing SDK model step boundary");
			const output = final.slice(start, starts[index + 1] ?? final.length);
			recordRound(turn, input.continuation(output, index), step, models[index] ?? input.model, input.roundOffset ?? 0, input.project);
		}
		return turn;
	}
	return {
		prepareStep,
		complete
	};
}
//#endregion
//#region src/runtime/request-context.ts
/** Removes provider fields that the next request no longer defines. */
function replaceProviderConfig(target, previousKeys, next) {
	for (const key of previousKeys) if (!Object.hasOwn(next, key)) Reflect.deleteProperty(target, key);
	Object.assign(target, next);
	return Object.keys(next);
}
/** Builds a compatibility-cache key from the same configuration used by the request. */
function modelKey(model, { protocol, config }) {
	return `${protocol === "responses" ? "responses:" : ""}${config.baseURL}-${model}`;
}
/** Applies a caller override before the learned tool compatibility for this exact model request. */
function supportsTools(model, request, options) {
	return options?.supportsTools ?? options?.toolsCompatibility?.get(modelKey(model, request)) !== false;
}
/** Applies a caller override before the learned Chat content compatibility for this exact model request. */
function supportsContentArray(model, request, options) {
	return options?.supportsContentArray ?? options?.contentArrayCompatibility?.get(modelKey(model, request)) !== false;
}
/**
* Request overrides replace configured headers without regard to casing.
* Authorization keeps the SDK spelling so it also replaces the SDK apiKey default.
*/
function mergeRequestHeaders(configured, overrides) {
	const headers = new Headers(configured);
	new Headers(overrides).forEach((value, name) => headers.set(name, value));
	return Object.fromEntries(Array.from(headers, ([name, value]) => [name === "authorization" ? "Authorization" : name, value]));
}
/**
* Native continuation belongs to one provider identity, endpoint, model and conversation.
* Request credentials and headers do not participate in this persisted scope.
*/
function createContinuationScope(config, options) {
	return JSON.stringify([
		options?.providerId,
		String(config.baseURL),
		config.model,
		options?.requestCorrelation?.conversationId
	]);
}
//#endregion
//#region src/runtime/request-switch.ts
/** Carries completed tool rounds to a new continuation scope without persisting a partial turn. */
var RequestSwitch = class extends Error {
	next;
	partialTurn;
	constructor(next, partialTurn) {
		super("Model request scope changed");
		this.next = next;
		this.partialTurn = partialTurn;
	}
};
//#endregion
//#region src/runtime/xsai-events.ts
/**
* Maps xsAI stream events onto the AIRI {@link StreamEvent} contract.
*
* xsAI 0.5.0-beta.8 marks failed tool executions with `isError: true` on
* `tool-result.done` instead of aborting the stream, so AIRI can distinguish
* `tool-error` from `tool-result` directly from the event payload.
*/
function toAiriStreamEvent(event) {
	switch (event.type) {
		case "text.delta": return {
			type: "text-delta",
			text: event.delta
		};
		case "reasoning.delta": return {
			type: "reasoning-delta",
			text: event.delta
		};
		case "tool-call.start": return {
			type: "tool-call-start",
			toolCallId: event.toolCallId,
			toolName: event.toolName
		};
		case "tool-call.done": return {
			...event,
			type: "tool-call"
		};
		case "tool-result.done":
			if (event.isError === true) return {
				type: "tool-error",
				toolCallId: event.toolCallId,
				result: typeof event.result === "string" ? event.result : JSON.stringify(event.result),
				isError: true
			};
			return {
				type: "tool-result",
				toolCallId: event.toolCallId,
				result: typeof event.result === "string" || Array.isArray(event.result) ? event.result : JSON.stringify(event.result)
			};
		case "error": return {
			type: "error",
			error: event.cause ?? new Error(event.message)
		};
		case "text.start":
		case "text.done":
		case "reasoning.start":
		case "reasoning.done":
		case "step.start":
		case "step.done":
		case "tool-call.delta": return null;
	}
}
//#endregion
//#region src/runtime/chat-completions.ts
/** Projects one context snapshot and returns only the newly generated turn. */
function streamChatCompletions(input) {
	const messages = conversationToChatMessages(input.conversation, input.supportsContentArray, input.scope);
	const scopes = [];
	const generation = createGeneration({
		turnId: input.options?.requestCorrelation?.turnId ?? input.options?.generationTurnId,
		runId: input.options?.requestCorrelation?.runId,
		model: input.config.model,
		roundOffset: input.options?.generationRoundOffset,
		continuation: (data, index) => ({
			protocol: "chat-completions",
			scope: scopes[index] ?? input.scope,
			data
		}),
		project: (item) => chatMessagesToProjectionEntries([item])
	});
	const callerToolChoice = (steps) => steps.length === 0 && !input.options?.generationRoundOffset ? input.options?.toolChoice : void 0;
	let providerConfigKeys = Object.keys(input.config);
	const requestOptions = {
		...input.config,
		prepareStep: ({ input: current, steps }) => {
			const resolveStep = input.options?.resolveStep;
			if (!resolveStep) {
				scopes.push(input.scope);
				generation.prepareStep({ input: current });
				return { toolChoice: callerToolChoice(steps) };
			}
			return (async () => {
				const firstStep = scopes.length === 0 && input.initialStep;
				const next = firstStep || await resolveStep();
				const nextRequest = firstStep ? {
					protocol: "chat-completions",
					config: input.config
				} : next.chatProvider.generation(next.model);
				const nextScope = createContinuationScope(nextRequest.config, {
					...input.options,
					providerId: next.providerId
				});
				if (nextRequest.protocol !== "chat-completions" || nextScope !== input.scope) throw new RequestSwitch(next, await generation.complete(Promise.resolve(current), Promise.resolve(steps)));
				const toolsSupported = supportsTools(next.model, nextRequest, input.options);
				providerConfigKeys = replaceProviderConfig(requestOptions, providerConfigKeys, nextRequest.config);
				Object.assign(requestOptions, {
					apiKey: nextRequest.config.apiKey,
					fetch: nextRequest.config.fetch,
					temperature: next.temperature,
					topP: next.topP,
					maxTokens: next.maxTokens ?? input.options?.maxTokens,
					headers: mergeRequestHeaders(nextRequest.config.headers, next.headers),
					tools: toolsSupported && next.tools?.length ? next.tools : void 0,
					toolChoice: void 0
				});
				generation.prepareStep({
					input: current,
					model: next.model
				});
				const contentArraySupported = supportsContentArray(next.model, nextRequest, input.options);
				scopes.push(nextScope);
				if (!contentArraySupported) for (const [index, message] of current.entries()) {
					if (!Array.isArray(message.content)) continue;
					current[index] = {
						...message,
						content: chatContentToString(message.content)
					};
				}
				const systemIndex = current.findIndex((message) => message.role === "system");
				const systemMessage = current[systemIndex];
				if (systemMessage?.role === "system") current[systemIndex] = {
					...systemMessage,
					content: next.systemPrompt
				};
				else if (next.systemPrompt) current.unshift({
					role: "system",
					content: next.systemPrompt
				});
				return {
					input: current,
					model: next.model,
					toolChoice: toolsSupported ? callerToolChoice(steps) : void 0
				};
			})();
		},
		abortSignal: input.options?.abortSignal,
		temperature: input.options?.temperature,
		topP: input.options?.topP,
		maxTokens: input.options?.maxTokens,
		messages,
		headers: mergeRequestHeaders(input.config.headers, input.options?.headers),
		streamOptions: { includeUsage: true },
		stopWhen: not(hasToolCall()),
		tools: input.tools,
		onEvent: async (event) => {
			const mapped = toAiriStreamEvent(event);
			if (mapped) await input.onEvent(mapped);
		}
	};
	const result = streamText(requestOptions);
	const generatedTurn = generation.complete(result.messages, result.steps);
	return {
		...result,
		generatedTurn
	};
}
//#endregion
//#region src/runtime/responses.ts
function inputPart(segment) {
	switch (segment.type) {
		case "image": return {
			type: "input_image",
			image_url: segment.url,
			detail: segment.detail
		};
		case "file":
			if (segment.providerFileId) throw new Error("Responses file references require native input Items");
			return {
				type: "input_file",
				file_data: segment.data,
				filename: segment.name,
				file_url: segment.url
			};
		case "audio": return {
			type: "input_audio",
			input_audio: {
				data: segment.data,
				format: segment.format
			}
		};
		default: return {
			type: "input_text",
			text: renderSegmentText(segment)
		};
	}
}
/** A tool result accepts the input parts of a user message, except audio. */
function toolOutputPart(segment) {
	const part = inputPart(segment);
	if (part.type === "input_audio") throw new Error("Responses tool output does not support audio");
	return part;
}
function renderMessage(message) {
	const items = [];
	const role = message.role === "context" || message.role === "event" || message.role === "summary" ? "user" : message.role;
	let parts = [];
	function flush() {
		if (!parts.length) return;
		if (role === "tool") throw new Error("Tool messages require a correlated tool result");
		if (role === "assistant") {
			const content = parts.map((part) => part.type === "refusal" ? {
				type: "refusal",
				refusal: part.text
			} : {
				type: "output_text",
				text: renderSegmentText(part)
			});
			items.push({
				type: "message",
				role,
				content
			});
		} else if (role === "user") {
			const content = parts.map(inputPart);
			items.push({
				type: "message",
				role,
				content: content.every((part) => part.type === "input_text") ? content.map((part) => part.text).join("") : content
			});
		} else items.push({
			type: "message",
			role,
			content: parts.map((part) => ({
				type: "input_text",
				text: renderSegmentText(part)
			}))
		});
		parts = [];
	}
	for (const segment of message.segments) if (segment.type === "tool-call") {
		if (role !== "assistant") throw new Error("Only assistant messages can invoke tools");
		flush();
		items.push({
			type: "function_call",
			call_id: segment.callId,
			name: segment.name,
			arguments: segment.arguments
		});
	} else if (segment.type === "tool-result") {
		flush();
		const content = segment.content.map(toolOutputPart);
		items.push({
			type: "function_call_output",
			call_id: segment.callId,
			output: content.every((part) => part.type === "input_text") ? content.map((part) => part.text).join("") : content
		});
	} else parts.push(segment);
	flush();
	return items;
}
function renderConversation(conversation, scope) {
	return conversation.turns.flatMap((turn) => {
		if (turn.type !== "assistant") return renderMessage(projectInput(turn));
		return turn.rounds.flatMap((round) => {
			const continuation = round.continuation;
			if (continuation?.protocol === "responses" && continuation.scope === scope) {
				if (!Array.isArray(continuation.data)) throw new Error("Responses continuation must contain an item array");
				return continuation.data;
			}
			return projectRound(round).flatMap(renderMessage);
		});
	});
}
function readToolResultContent(content) {
	if (typeof content === "string") return [{
		type: "text",
		text: content
	}];
	return content.map((part) => {
		switch (part.type) {
			case "input_text": return {
				type: "text",
				text: part.text
			};
			case "input_image":
				if (!part.image_url) throw new Error("Responses image output requires a URL");
				return {
					type: "image",
					url: part.image_url,
					detail: part.detail ?? void 0
				};
			case "input_file":
				if (part.file_data != null && part.file_url == null) return {
					type: "file",
					data: part.file_data,
					name: part.filename ?? void 0
				};
				if (part.file_url != null && part.file_data == null) return {
					type: "file",
					url: part.file_url,
					name: part.filename ?? void 0
				};
				throw new Error("Responses file requires exactly one source");
			case "input_video": throw new Error("Video tool output is not supported by the conversation model");
		}
		throw new Error("Unsupported Responses tool output");
	});
}
function readCitations(part) {
	return part.annotations?.map((entry) => ({
		url: entry.url,
		title: entry.title,
		startIndex: entry.start_index,
		endIndex: entry.end_index
	}));
}
function readOutput(items) {
	return items.flatMap((item, index) => {
		const id = `output-${index}`;
		if (item.type === "function_call") return [{
			id,
			role: "assistant",
			segments: [{
				type: "tool-call",
				callId: item.call_id,
				name: item.name,
				arguments: item.arguments
			}]
		}];
		if (item.type === "function_call_output") return [{
			id,
			role: "tool",
			segments: [{
				type: "tool-result",
				callId: item.call_id,
				content: readToolResultContent(item.output)
			}]
		}];
		if (item.type === "message" && item.role === "assistant") return [{
			id,
			role: "assistant",
			segments: typeof item.content === "string" ? [{
				type: "text",
				text: item.content
			}] : item.content.map((part) => {
				if (part.type === "output_text") return {
					type: "text",
					text: part.text,
					citations: readCitations(part)
				};
				if (part.type === "refusal") return {
					type: "refusal",
					text: part.refusal
				};
				throw new Error("Unsupported Responses assistant content");
			})
		}];
		if (item.type === "reasoning" || item.type === "compaction" || item.type === "web_search_call") return [];
		throw new Error(`Unsupported Responses output item: ${item.type}`);
	});
}
function toolChoice(choice) {
	if (choice == null || typeof choice === "string") return choice;
	if (choice.type === "function") return {
		type: "function",
		name: choice.function.name
	};
	return {
		type: "allowed_tools",
		mode: choice.mode,
		tools: choice.tools.map((tool) => ({
			type: "function",
			name: tool.function.name
		}))
	};
}
/**
* Projects context directly into Responses and runs stateless tool steps.
* Only a fully settled generation produces a generated turn for the caller to commit.
*/
function streamResponses(input) {
	const items = renderConversation(input.conversation, input.scope);
	const scopes = [];
	const generation = createGeneration({
		turnId: input.options?.requestCorrelation?.turnId ?? input.options?.generationTurnId,
		runId: input.options?.requestCorrelation?.runId,
		model: input.config.model,
		roundOffset: input.options?.generationRoundOffset,
		continuation: (data, index) => ({
			protocol: "responses",
			scope: scopes[index] ?? input.scope,
			data
		}),
		project: (item) => readOutput([item])
	});
	const callerToolChoice = (steps) => steps.length === 0 && !input.options?.generationRoundOffset ? input.options?.toolChoice : void 0;
	let providerConfigKeys = Object.keys(input.config);
	const requestOptions = {
		...input.config,
		prepareStep: ({ input: current, steps }) => {
			const resolveStep = input.options?.resolveStep;
			if (!resolveStep) {
				scopes.push(input.scope);
				generation.prepareStep({ input: current });
				return { toolChoice: toolChoice(callerToolChoice(steps)) };
			}
			return (async () => {
				const firstStep = scopes.length === 0 && input.initialStep;
				const next = firstStep || await resolveStep();
				const nextRequest = firstStep ? {
					protocol: "responses",
					config: input.config,
					webSearch: input.webSearch ?? false
				} : next.chatProvider.generation(next.model);
				const nextScope = createContinuationScope(nextRequest.config, {
					...input.options,
					providerId: next.providerId
				});
				if (nextRequest.protocol !== "responses" || nextScope !== input.scope) throw new RequestSwitch(next, await generation.complete(Promise.resolve(current), Promise.resolve(steps)));
				const toolsSupported = supportsTools(next.model, nextRequest, input.options);
				providerConfigKeys = replaceProviderConfig(requestOptions, providerConfigKeys, nextRequest.config);
				Object.assign(requestOptions, {
					apiKey: nextRequest.config.apiKey,
					fetch: nextRequest.config.fetch,
					reasoning: nextRequest.config.reasoning,
					temperature: next.temperature,
					topP: next.topP,
					maxOutputTokens: next.maxTokens ?? input.options?.maxTokens,
					headers: mergeRequestHeaders(nextRequest.config.headers, next.headers),
					tools: toolsSupported ? nextRequest.webSearch && input.options?.providerTools !== false ? [...next.tools ?? [], { type: "web_search" }] : next.tools : void 0,
					toolChoice: void 0
				});
				generation.prepareStep({
					input: current,
					model: next.model
				});
				scopes.push(nextScope);
				const systemIndex = current.findIndex((item) => item.type === "message" && item.role === "system");
				const systemMessage = current[systemIndex];
				if (systemMessage?.type === "message" && systemMessage.role === "system") current[systemIndex] = {
					...systemMessage,
					content: next.systemPrompt
				};
				else if (next.systemPrompt) current.unshift({
					type: "message",
					role: "system",
					content: next.systemPrompt
				});
				return {
					input: current,
					model: next.model,
					toolChoice: toolsSupported ? toolChoice(callerToolChoice(steps)) : void 0
				};
			})();
		},
		input: items,
		store: false,
		include: ["reasoning.encrypted_content"],
		abortSignal: input.options?.abortSignal,
		temperature: input.options?.temperature,
		topP: input.options?.topP,
		maxOutputTokens: input.options?.maxTokens,
		headers: mergeRequestHeaders(input.config.headers, input.options?.headers),
		tools: input.webSearch ? [...input.tools ?? [], { type: "web_search" }] : input.tools,
		stopWhen: not(hasToolCall()),
		onEvent: async (event) => {
			const mapped = toAiriStreamEvent(event);
			if (mapped) await input.onEvent(mapped);
		},
		onNativeEvent: async (event) => {
			if (event.type !== "response.output_item.done" && event.type !== "response.output_item.added") return;
			const item = event.item;
			if (item?.type === "web_search_call") await input.onEvent({
				type: "search",
				id: item.id,
				status: item.status
			});
			if (event.type === "response.output_item.done" && item?.type === "message" && item.role === "assistant") for (const part of item.content) {
				if (part.type !== "output_text") continue;
				const citations = readCitations(part);
				if (citations?.length) await input.onEvent({
					type: "citations",
					citations
				});
			}
		}
	};
	const result = responses(requestOptions);
	const generatedTurn = generation.complete(result.input, result.steps);
	return {
		...result,
		generatedTurn
	};
}
//#endregion
//#region src/runtime/llm-service.ts
/**
* Automatic retry for provider requests that fail with a temporary HTTP status
* before any stream event reaches the consumer.
*/
const transientRetry = {
	/** Wait before each retry when the provider sends no usable `Retry-After`; its length caps the retry count. */
	backoffMs: [
		3e3,
		6e3,
		12e3
	],
	/** Longest server-requested `Retry-After` to wait silently; a longer one fails the turn so the user decides. */
	maxRetryAfterMs: 3e4
};
/** Returns the wait before the next attempt, or `undefined` when the failure is permanent or retries are spent. */
function transientRetryDelayMs(error, attempt) {
	if (attempt >= transientRetry.backoffMs.length || !(error instanceof APICallError)) return void 0;
	if (error.statusCode !== 408 && error.statusCode !== 429 && error.statusCode < 500) return void 0;
	const retryAfter = error.responseHeaders["retry-after"];
	if (!retryAfter) return transientRetry.backoffMs[attempt];
	const seconds = Number(retryAfter);
	const delayMs = Number.isFinite(seconds) ? seconds * 1e3 : Date.parse(retryAfter) - Date.now();
	if (Number.isNaN(delayMs)) return transientRetry.backoffMs[attempt];
	return delayMs <= transientRetry.maxRetryAfterMs ? Math.max(delayMs, 0) : void 0;
}
function waitBeforeRetry(delayMs, signal) {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(signal.reason);
			return;
		}
		const timer = setTimeout(() => {
			signal?.removeEventListener("abort", onAbort);
			resolve();
		}, delayMs);
		signal?.addEventListener("abort", onAbort, { once: true });
		function onAbort() {
			clearTimeout(timer);
			reject(signal?.reason);
		}
	});
}
async function resolveTools(options) {
	return (typeof options?.tools === "function" ? await options.tools() : options?.tools) ?? [];
}
/** Runs the selected protocol adapter and waits for its generated turn and event consumers. */
async function streamOnce({ model, chatProvider, conversation, options, builtinToolsResolver }) {
	const initialStep = await options?.resolveStep?.();
	const currentModel = initialStep?.model ?? model;
	const request = (initialStep?.chatProvider ?? chatProvider).generation(currentModel);
	if (options?.prepareConversation) conversation = await options.prepareConversation(conversation, {
		model: currentModel,
		providerId: initialStep?.providerId ?? options.providerId,
		request
	});
	const supportedTools = supportsTools(currentModel, request, options);
	const contentArraySupported = supportsContentArray(currentModel, request, options);
	if (request.protocol === "chat-completions" && !contentArraySupported && options?.prepareStringContent) conversation = await options.prepareStringContent(conversation);
	options?.abortSignal?.throwIfAborted();
	const builtinTools = supportedTools && !initialStep ? await (builtinToolsResolver?.(model, chatProvider) ?? Promise.resolve([])) : [];
	const customTools = supportedTools ? initialStep ? initialStep.tools ?? [] : await resolveTools(options) : [];
	const mergedTools = supportedTools ? [...builtinTools, ...customTools] : [];
	const tools = mergedTools.length > 0 ? mergedTools : void 0;
	const scope = createContinuationScope(request.config, {
		...options,
		providerId: initialStep?.providerId ?? options?.providerId
	});
	return new Promise((resolve, reject) => {
		let settled = false;
		let stepsSettled = false;
		const resolveOnce = () => {
			if (settled) return;
			settled = true;
			resolve();
		};
		const rejectOnce = (error) => {
			if (settled || stepsSettled) return;
			settled = true;
			reject(error);
		};
		const reportsFailure = (error) => !(error instanceof RequestSwitch) && !options?.abortSignal?.aborted;
		const onEvent = async (streamEvent) => {
			try {
				if (streamEvent != null) await options?.onStreamEvent?.(streamEvent);
				if (streamEvent?.type === "error") rejectOnce(streamEvent.error);
			} catch (error) {
				rejectOnce(error);
				if (request.protocol === "responses") throw error;
			}
		};
		try {
			const streamResult = request.protocol === "responses" ? streamResponses({
				config: request.config,
				webSearch: supportedTools && options?.providerTools !== false && request.webSearch,
				conversation,
				scope,
				options,
				tools,
				initialStep,
				onEvent
			}) : streamChatCompletions({
				config: request.config,
				conversation,
				scope,
				options,
				tools,
				initialStep,
				onEvent,
				supportsContentArray: contentArraySupported
			});
			streamResult.steps.then(async () => {
				if (settled) return;
				stepsSettled = true;
				try {
					const generatedTurn = await streamResult.generatedTurn;
					await options?.onStreamEvent?.({ type: "finish" });
					if (options?.abortSignal?.aborted) throw options.abortSignal.reason;
					await options?.onGeneratedTurn?.(generatedTurn);
				} catch (error) {
					if (!settled) {
						settled = true;
						reject(error);
					}
					return;
				}
				let usage;
				try {
					usage = await streamResult.totalUsage;
				} catch (error) {
					console.error("Stream totalUsage error:", error);
				}
				try {
					const normalizedUsage = !usage || usage.inputTokens == null && usage.outputTokens == null && usage.totalTokens == null ? { source: "unavailable" } : {
						...usage,
						source: "reported"
					};
					await options?.onUsage?.(normalizedUsage);
				} catch (error) {
					console.error("Stream usage callback error:", error);
				}
				resolveOnce();
			}).catch((error) => {
				if (stepsSettled) {
					console.error("Stream usage observation error:", error);
					resolveOnce();
					return;
				}
				rejectOnce(error);
				if (reportsFailure(error)) console.error("Stream steps error:", error);
			});
			streamResult.generatedTurn.catch((error) => {
				if (reportsFailure(error)) console.error("Stream generated turn error:", error);
			});
			streamResult.usage.catch((error) => {
				if (reportsFailure(error)) console.error("Stream usage error:", error);
			});
			streamResult.totalUsage.catch((error) => {
				if (reportsFailure(error)) console.error("Stream totalUsage error:", error);
			});
		} catch (error) {
			rejectOnce(error);
		}
	});
}
/**
* Runs one request and repeats it while the provider reports temporary unavailability.
*
* Retrying is only safe while the consumer has seen no stream event. After the
* first event, text may already be rendered or spoken and tools may already have
* run, so a repeat would duplicate them; those failures surface for manual Retry.
* Cancelling through `abortSignal` also ends a pending retry wait.
*/
async function streamWithTransientRetry(input) {
	for (let attempt = 0;; attempt++) {
		let consumerNotified = false;
		try {
			return await streamOnce({
				...input,
				options: {
					...input.options,
					onStreamEvent: (event) => {
						consumerNotified = true;
						return input.options?.onStreamEvent?.(event);
					}
				}
			});
		} catch (error) {
			const delayMs = consumerNotified ? void 0 : transientRetryDelayMs(error, attempt);
			if (delayMs == null) throw error;
			console.warn(`[llm] Retrying provider request in ${delayMs}ms (retry ${attempt + 1}/${transientRetry.backoffMs.length}):`, error);
			await waitBeforeRetry(delayMs, input.options?.abortSignal);
		}
	}
}
function mergeGenerationUsage(rounds, last) {
	const partial = rounds.flatMap((round) => round.modelCall?.usage ? [round.modelCall.usage] : []);
	if (partial.length === 0) return last;
	return {
		inputTokens: partial.reduce((sum, usage) => sum + usage.inputTokens, last?.inputTokens ?? 0),
		outputTokens: partial.reduce((sum, usage) => sum + usage.outputTokens, last?.outputTokens ?? 0),
		totalTokens: partial.reduce((sum, usage) => sum + usage.totalTokens, last?.totalTokens ?? 0),
		source: "reported"
	};
}
/** Keeps one assistant turn across xsAI tool loops when the next request changes provider scope. */
async function streamFrom(input) {
	if (!input.options?.resolveStep) return streamWithTransientRetry(input);
	const completedRounds = [];
	let turnId = input.options.requestCorrelation?.turnId;
	let request = input;
	while (true) {
		let finalTurn;
		let lastUsage;
		try {
			await streamWithTransientRetry({
				...request,
				options: {
					...request.options,
					generationTurnId: turnId,
					generationRoundOffset: completedRounds.length,
					onGeneratedTurn: (turn) => {
						finalTurn = turn;
					},
					onUsage: (usage) => {
						lastUsage = usage;
					}
				}
			});
			if (finalTurn) await input.options.onGeneratedTurn?.({
				...finalTurn,
				rounds: [...completedRounds, ...finalTurn.rounds]
			});
			const usage = mergeGenerationUsage(completedRounds, lastUsage);
			if (usage) await input.options.onUsage?.(usage);
			return;
		} catch (error) {
			if (!(error instanceof RequestSwitch)) throw error;
			turnId = error.partialTurn.id;
			completedRounds.push(...error.partialTurn.rounds);
			request = {
				...input,
				model: error.next.model,
				chatProvider: error.next.chatProvider,
				options: {
					...input.options,
					providerId: error.next.providerId,
					headers: error.next.headers
				},
				conversation: { turns: [...input.conversation.turns, {
					...error.partialTurn,
					rounds: [...completedRounds]
				}] }
			};
		}
	}
}
const TOOLS_RELATED_ERROR_PATTERNS = [
	/does not support tools/i,
	/no endpoints found that support tool use/i,
	/functions are not supported/i,
	/unrecognized request argument.+tools/i,
	/tool use with function calling is unsupported/i,
	/does not support function.?calling/i,
	/tools?\s+(is|are)\s+not\s+supported/i
];
function isToolRelatedError(error) {
	const message = String(error);
	return TOOLS_RELATED_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}
const CONTENT_ARRAY_RELATED_ERROR_PATTERNS = [/messages\[\d+\][^"]*invalid type:\s*sequence,\s*expected\s+a\s+string/i, /messages\.\d+\.content[^"]*(?:expected|should be).*string/i];
/**
* Whether the given error indicates the provider rejected content-part arrays
* and the caller should auto-degrade to string-only `content` for this model.
*
* Use when:
* - Catching errors thrown by {@link streamFrom} so the chat store can flip
*   `contentArrayCompatibility` for the failing model key.
*
* Expects:
* - `error` may be an Error instance, a thrown SDK response object, a string,
*   or anything else; we coerce via `String(error)` and pattern-match.
*
* Returns:
* - `true` when the message matches a known "content array unsupported" wire
*   format from an OpenAI-compatible gateway, otherwise `false`.
*/
function isContentArrayRelatedError(error) {
	const message = String(error);
	return CONTENT_ARRAY_RELATED_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}
//#endregion
//#region src/runtime/recipe.ts
/**
* Instructions that let the model decide what each run does, from the recipe's purpose.
* A model proposal writes them when the owner wants the model to decide each run, and Settings recognize them to show that choice. The runtime treats them as plain instructions.
*/
const MODEL_DECIDES_STEPS = "Decide what this run does from the recipe's purpose and what you know now, and use your tools to do it.";
/** Recipes that can run now: enabled and authorized. */
function usableRecipes(recipes) {
	return recipes.filter((recipe) => recipe.enabled && recipe.approved);
}
/** Whether a recipe runs in its own session. */
function isBackgroundRecipe(recipe) {
	return recipe.background === true;
}
/** Usable recipes whose keyword appears in the text. Matching ignores letter case. */
function matchKeywordRecipes(recipes, text) {
	const lower = text.toLowerCase();
	return usableRecipes(recipes).filter((recipe) => recipe.keywords.some((keyword) => keyword.trim() && lower.includes(keyword.trim().toLowerCase())));
}
/**
* The answers of a decision in order: yes then no, or the options.
* The character answers with the id: `yes` or `no`, or an option number from 1.
*/
function decisionOptions(question) {
	if (question.type === "noul") return [{
		id: "yes",
		key: "true",
		meaning: question.criteria.true
	}, {
		id: "no",
		key: "false",
		meaning: question.criteria.false
	}];
	return Object.entries(question.criteria).map(([key, meaning], index) => ({
		id: String(index + 1),
		key,
		meaning
	}));
}
/**
* Picks what follows the character's answer. The character commits to one answer, and code picks its action.
* A decision has no unsure answer, so every judgment leads to the action of the answer that the character chose.
*
* Returns:
* - The answered option and its action. Without an action, the character replies as usual.
* - An error text for an answer that the decision does not have, so the character can fix its call.
*/
function judgeDecision(decision, answerId) {
	const options = decisionOptions(decision.question);
	const option = options.find((entry) => entry.id === answerId.trim());
	if (!option) return `The answer must be one of: ${options.map((entry) => entry.id).join(", ")}.`;
	const action = decision.actions[option.key];
	return {
		option,
		...action ? { action } : {}
	};
}
//#endregion
//#region src/session/merge-loaded-session-messages.ts
function extractMessageContent(message) {
	if (typeof message.content === "string") return message.content;
	if (Array.isArray(message.content)) return message.content.map((part) => {
		if (typeof part === "string") return part;
		if (part && typeof part === "object" && "text" in part) return String(part.text ?? "");
		return "";
	}).join("");
	return "";
}
function getMessageFingerprint(message) {
	return [
		message.id ?? "",
		message.role,
		message.createdAt ?? "",
		extractMessageContent(message)
	].join("");
}
function mergeLoadedSessionMessages(storedMessages, currentMessages) {
	if (currentMessages.length === 0) return storedMessages;
	const currentNonSystemMessages = currentMessages.filter((message, index) => index !== 0 || message.role !== "system");
	if (currentNonSystemMessages.length === 0) return storedMessages;
	const seen = new Set(storedMessages.map(getMessageFingerprint));
	const extraMessages = currentNonSystemMessages.filter((message) => {
		const fingerprint = getMessageFingerprint(message);
		if (seen.has(fingerprint)) return false;
		seen.add(fingerprint);
		return true;
	});
	if (extraMessages.length === 0) return storedMessages;
	const systemMessage = storedMessages[0]?.role === "system" ? storedMessages[0] : currentMessages[0]?.role === "system" ? currentMessages[0] : void 0;
	if (storedMessages.length === 0 && systemMessage) return [systemMessage, ...extraMessages];
	return [...storedMessages, ...extraMessages];
}
//#endregion
//#region src/utils/error.ts
/** Returns a message for runtime diagnostics, including values thrown without an Error wrapper. */
function errorMessageFromValue(error) {
	return errorMessageFrom(error) ?? String(error);
}
/**
* Preserves an Error thrown by a provider and wraps other thrown values with operation context.
*
* @example
* errorFromCause('offline', 'Speech synthesis failed')
* // => Error('Speech synthesis failed', { cause: 'offline' })
*/
function errorFromCause(cause, message) {
	return cause instanceof Error ? cause : new Error(message, { cause });
}
//#endregion
//#region src/voice/input/transcript.ts
/** Owns provider revisions and raw history. A completed transcript cannot reopen. */
var Transcript = class {
	current = Object.freeze({
		revision: 0,
		text: "",
		segments: Object.freeze([])
	});
	updates = [];
	complete = false;
	revision = 0;
	patches = [];
	get raw() {
		return this.current;
	}
	get history() {
		return this.updates.slice();
	}
	get ended() {
		return this.complete;
	}
	/** Raw text with every active patch applied. `revision` counts raw updates and patch changes. */
	get corrected() {
		const patches = this.patches.filter((patch) => patch.active);
		const segments = this.raw.segments.map((segment) => {
			const spans = patches.flatMap((patch) => patch.spans.filter((span) => span.segmentId === segment.id)).sort((a, b) => b.start - a.start);
			let text = segment.text;
			for (const span of spans) text = text.slice(0, span.start) + span.replacement + text.slice(span.end);
			return Object.freeze({
				...segment,
				text
			});
		});
		return Object.freeze({
			revision: this.revision,
			text: segments.map((segment) => segment.text).join(""),
			segments: Object.freeze(segments)
		});
	}
	get patchHistory() {
		return this.patches.map((patch) => Object.freeze({
			...patch.record,
			active: patch.active
		}));
	}
	patch(author, proposal, manual = false) {
		const spans = [];
		for (const edit of proposal.edits) {
			if (edit.range.kind === "tokens" && (!Number.isSafeInteger(edit.range.start) || !Number.isSafeInteger(edit.range.end) || edit.range.start < 0 || edit.range.end <= edit.range.start)) return {
				status: "rejected",
				reason: "conflict"
			};
			const segment = this.raw.segments.find((segment) => segment.id === edit.segmentId);
			if (!segment) return {
				status: "rejected",
				reason: "stale"
			};
			const start = edit.range.kind === "segment" ? 0 : segment.tokens[edit.range.start]?.start;
			const end = edit.range.kind === "segment" ? segment.text.length : segment.tokens[edit.range.end - 1]?.end;
			if (start === void 0 || end === void 0 || end < start || segment.text.slice(start, end) !== edit.expectedText) return {
				status: "rejected",
				reason: "conflict"
			};
			const overlaps = (span) => span.segmentId === segment.id && (start < span.end && end > span.start || start === end && start === span.start);
			if (spans.some(overlaps) || this.patches.some((patch) => patch.active && patch.spans.some(overlaps))) return {
				status: "rejected",
				reason: "conflict"
			};
			spans.push({
				segmentId: segment.id,
				revision: segment.revision,
				start,
				end,
				expectedText: edit.expectedText,
				replacement: edit.replacement
			});
		}
		if (!spans.length) return {
			status: "rejected",
			reason: "conflict"
		};
		this.patches.push({
			record: Object.freeze({
				id: nanoid$1(),
				author,
				manual,
				edits: Object.freeze(proposal.edits.map((edit) => Object.freeze({
					...edit,
					range: Object.freeze({ ...edit.range })
				}))),
				evidenceIds: Object.freeze([...proposal.evidenceIds])
			}),
			spans,
			active: true
		});
		this.revision += 1;
		return { status: "applied" };
	}
	invalidate() {
		let changed = false;
		for (const patch of this.patches) {
			const targetChanged = patch.spans.some((span) => {
				const segment = this.raw.segments.find((segment) => segment.id === span.segmentId);
				if (!segment) return true;
				return patch.record.manual ? segment.text.slice(span.start, span.end) !== span.expectedText : segment.revision !== span.revision;
			});
			if (patch.active && targetChanged) {
				patch.active = false;
				changed = true;
			}
		}
		if (changed) this.revision += 1;
		return changed;
	}
	/** Triggering workflow: provider output → SpeechInputAttempt → raw document update or completion. */
	accept(event) {
		if (this.complete) throw new Error("Transcription emitted after completion");
		if (event.type === "complete") {
			if (event.revision !== this.current.revision || this.current.segments.some((segment) => !segment.final)) throw new Error("Transcription completion does not match final text");
			this.complete = true;
			return;
		}
		if (!Number.isSafeInteger(event.revision) || event.revision <= this.current.revision) throw new Error("Transcription revisions must increase");
		const ids = /* @__PURE__ */ new Set();
		const segments = event.segments.map((segment) => {
			if (ids.has(segment.id) || !segment.id || !Number.isSafeInteger(segment.revision) || segment.revision < 0) throw new Error("Invalid transcription segment identity");
			ids.add(segment.id);
			const previous = this.current.segments.find((item) => item.id === segment.id);
			const changedTokens = previous && (segment.tokens.length !== previous.tokens.length || segment.tokens.some((token, index) => {
				const old = previous.tokens[index];
				return token.text !== old?.text || token.start !== old?.start || token.end !== old?.end;
			}));
			if (previous && (segment.revision < previous.revision || segment.revision === previous.revision && (segment.text !== previous.text || segment.final !== previous.final || changedTokens))) throw new Error("Changed segment requires a new revision");
			let end = 0;
			for (const token of segment.tokens) {
				if (!Number.isSafeInteger(token.start) || !Number.isSafeInteger(token.end) || token.start < end || token.end <= token.start || token.end > segment.text.length || segment.text.slice(token.start, token.end) !== token.text) throw new Error("Invalid transcription token range");
				end = token.end;
			}
			return Object.freeze({
				...segment,
				tokens: Object.freeze(segment.tokens.map((token) => Object.freeze({ ...token })))
			});
		});
		this.current = Object.freeze({
			revision: event.revision,
			text: segments.map((segment) => segment.text).join(""),
			segments: Object.freeze(segments)
		});
		this.updates.push(this.current);
		this.revision += 1;
	}
};
//#endregion
//#region src/voice/input/speech-input.ts
/**
* The document of one accepted speech input.
*
* State model:
* - Open: provider updates, manual corrections, and speaker evidence change the document. Each change increases
*   `document.version` and notifies listeners synchronously.
* - Transcribed: `finishTranscription` freezes provider text and speaker evidence. Corrections still apply, so
*   finalization stages can patch the complete text.
* - Sealed: `seal` rejects every write and removes listeners. The submission reads the sealed document.
*/
var SpeechInput = class {
	id;
	sessionId;
	text = new Transcript();
	listeners = /* @__PURE__ */ new Set();
	sealed = false;
	transcribed = false;
	speaker;
	version = 0;
	cached;
	constructor(id, sessionId) {
		this.id = id;
		this.sessionId = sessionId;
	}
	get closed() {
		return this.sealed;
	}
	get transcript() {
		return this.text;
	}
	get document() {
		this.cached ??= Object.freeze({
			inputId: this.id,
			sessionId: this.sessionId,
			version: this.version,
			raw: this.text.raw,
			corrected: this.text.corrected,
			...this.speaker ? { speakers: this.speaker } : {}
		});
		return this.cached;
	}
	accept(event) {
		if (this.sealed) throw new Error("Speech input is closed");
		this.text.accept(event);
		this.text.invalidate();
		this.changed();
	}
	/** `manual` marks a user correction. Plugin corrections apply only after transcription ends. */
	patch(author, proposal, manual = false) {
		if (this.sealed) return {
			status: "rejected",
			reason: "closed"
		};
		if (!manual && !this.transcribed) return {
			status: "rejected",
			reason: "denied"
		};
		const result = this.text.patch(author, proposal, manual);
		if (result.status === "applied") this.changed();
		return result;
	}
	finishTranscription() {
		if (!this.text.ended) throw new Error("Provider closed without transcription completion");
		this.transcribed = true;
	}
	updateSpeakers(evidence) {
		if (this.sealed || this.transcribed) return {
			status: "rejected",
			reason: "closed"
		};
		if (!Number.isFinite(evidence.voicedMs) || evidence.voicedMs < 0 || evidence.candidates.some((candidate) => !candidate.speakerId || !Number.isFinite(candidate.score))) throw new Error("Invalid speaker evidence");
		this.speaker = Object.freeze({
			...evidence,
			revision: (this.speaker?.revision ?? 0) + 1,
			candidates: Object.freeze(evidence.candidates.map((candidate) => Object.freeze({ ...candidate })))
		});
		this.changed();
		return { status: "applied" };
	}
	/** The listener receives each new document version synchronously, in change order. */
	subscribe(listener) {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}
	seal() {
		this.sealed = true;
		this.listeners.clear();
	}
	changed() {
		this.version += 1;
		this.cached = void 0;
		const document = this.document;
		for (const listener of this.listeners) listener(document);
	}
};
//#endregion
//#region src/voice/input/attempt.ts
/** Owns one admission, capture, provider request, and submission. Normal end never aborts the provider. */
var SpeechInputAttempt = class {
	owner;
	options;
	id = nanoid$1();
	sessionId;
	cause;
	done;
	completion = Promise.withResolvers();
	abort = new AbortController();
	listeners = /* @__PURE__ */ new Set();
	capture;
	reader;
	current = {
		phase: "pending",
		waitingFor: "source"
	};
	accepted;
	plugins;
	audio;
	from;
	liveStart = 0;
	sealedFrame;
	stage = "source";
	started = false;
	transcriptionTimer;
	constructor(owner, options) {
		this.owner = owner;
		this.options = options;
		this.sessionId = options.sessionId;
		this.cause = options.cause;
		this.done = this.completion.promise;
	}
	get state() {
		return this.current;
	}
	get input() {
		return this.accepted;
	}
	subscribe(listener) {
		this.listeners.add(listener);
		this.notify(listener);
		return () => this.listeners.delete(listener);
	}
	end() {
		if (this.current.phase === "pending") this.cancel("Input ended before capture started");
		if (this.current.phase === "capturing") {
			this.owner.seal(this);
			this.sealedFrame = this.audio?.position?.frame;
			this.change({ phase: "finalizing" });
			this.transcriptionTimer = setTimeout(() => {
				this.settle({
					status: "failed",
					stage: "transcription",
					error: /* @__PURE__ */ new Error("Speech recognition did not finish after the input ended")
				});
			}, this.owner.transcriptionTimeoutMs);
			this.capture?.finish();
		}
		return this.done;
	}
	cancel(reason) {
		this.settle({
			status: "cancelled",
			reason
		});
	}
	acceptsEvidence(range) {
		if (!this.from || range.sourceId !== this.from.sourceId) return false;
		const latestFrame = this.sealedFrame ?? this.audio?.position?.frame ?? 0;
		return range.startFrame >= this.from.frame && range.endFrame > range.startFrame && range.endFrame <= latestFrame;
	}
	/** Triggering workflow: VoiceController.beginInput → admission → capture and provider output → submit. */
	async start() {
		if (this.started) throw new Error("Speech input attempt already started");
		this.started = true;
		try {
			const prepared = await this.admitCapture();
			if (!prepared) return;
			const { provider, capture } = prepared;
			this.accepted = new SpeechInput(this.id, this.sessionId);
			this.plugins = this.owner.createPlugins(this, this.accepted);
			this.change({
				phase: "capturing",
				from: this.from
			});
			const transcribed = await this.readTranscription(provider, capture);
			clearTimeout(this.transcriptionTimer);
			if (!transcribed) return;
			await this.submitInput();
		} catch (cause) {
			this.settle({
				status: "failed",
				stage: this.stage,
				error: errorFromCause(cause, "Speech input failed")
			});
		} finally {
			this.reader?.releaseLock();
		}
	}
	/**
	* Speech onset reserves its capture before playback silence, so retained pre-roll survives the fade.
	* A manual input starts capture after silence, so the assistant's last audio stays out of the transcript.
	* Admission ends when the source delivers audio, which also covers a pending microphone permission.
	*/
	async admitCapture() {
		const audio = this.owner.audio();
		if (!audio) throw new Error("Audio input is not connected");
		let reserved = this.options.start.kind === "speech-onset" ? this.prepareCapture(audio) : void 0;
		const interruption = this.options.interruptTurns.length ? this.owner.interrupt({
			turns: this.options.interruptTurns,
			cause: "speech-input"
		}) : void 0;
		if (interruption) {
			this.change({
				phase: "pending",
				waitingFor: "silence"
			});
			this.stage = "admission";
			const failed = (await interruption.silenced).find((receipt) => receipt.status === "failed");
			if (failed) throw failed.error ?? /* @__PURE__ */ new Error("Playback silence was not confirmed");
		}
		if (this.abort.signal.aborted) return;
		reserved ??= this.prepareCapture(audio);
		this.stage = "source";
		this.change({
			phase: "pending",
			waitingFor: "source"
		});
		await Promise.race([reserved.capture.started, reserved.capture.done]);
		if (this.abort.signal.aborted || this.current.phase === "settled") return;
		this.from ??= audio.position && {
			sourceId: audio.position.sourceId,
			frame: this.liveStart
		};
		return reserved;
	}
	async readTranscription(provider, capture) {
		this.stage = "transcription";
		this.reader = provider.transcribe({
			audio: capture.stream,
			signal: this.abort.signal
		}).getReader();
		while (!this.abort.signal.aborted) {
			const result = await this.reader.read();
			if (this.abort.signal.aborted) return false;
			if (result.done) break;
			if (result.value.type === "complete" && this.current.phase !== "finalizing") throw new Error("Provider completed before capture ended");
			this.accepted.accept(result.value);
			this.change(this.current);
		}
		this.accepted.finishTranscription();
		return (await capture.done).status === "finished" && !this.abort.signal.aborted;
	}
	async submitInput() {
		this.stage = "submission";
		await this.plugins.finish();
		if (this.abort.signal.aborted) return;
		const accepted = this.accepted;
		const transcript = accepted.transcript;
		const { speakers } = accepted.document;
		const submission = Object.freeze({
			submissionId: this.id,
			sessionId: this.sessionId,
			text: transcript.corrected.text,
			transcript: Object.freeze({
				raw: transcript.raw,
				corrected: transcript.corrected,
				history: transcript.history,
				patches: transcript.patchHistory
			}),
			context: Object.freeze(this.plugins.context),
			...speakers ? { speakers } : {}
		});
		accepted.seal();
		if (!this.owner.options.submit) throw new Error("Speech submission is not configured");
		const outcome = await this.owner.options.submit(submission, this.abort.signal);
		if (!this.abort.signal.aborted) this.settle(outcome);
	}
	prepareCapture(audio) {
		this.stage = "capture";
		this.audio = audio;
		const provider = this.owner.options.transcriber?.({
			inputId: this.id,
			sessionId: this.sessionId
		});
		if (!provider) throw new Error("Speech transcription is not configured");
		let from;
		if (this.options.start.kind === "speech-onset") {
			const { at, preRollMs } = this.options.start;
			if (preRollMs && !audio.sampleRate) throw new Error("Source sample rate is unavailable for pre-roll");
			from = preRollMs ? {
				...at,
				frame: Math.max(0, at.frame - Math.floor(preRollMs * audio.sampleRate / 1e3))
			} : at;
		} else this.liveStart = audio.position?.frame ?? 0;
		this.from = from ?? audio.position;
		const recording = capture(audio, {
			from,
			signal: this.abort.signal
		});
		this.capture = recording;
		recording.done.then((outcome) => {
			if (outcome.status === "failed") this.settle({
				status: "failed",
				stage: "capture",
				error: outcome.error
			});
			if (outcome.status === "cancelled") this.cancel(outcome.reason);
			if (outcome.status === "finished" && this.current.phase === "capturing") this.end();
		});
		return {
			provider,
			capture: recording
		};
	}
	change(state) {
		this.current = Object.freeze(state);
		for (const listener of this.listeners) this.notify(listener);
	}
	/** Triggering workflow: {@link change} or {@link subscribe} → state snapshot → UI listener and host diagnostics. */
	notify(listener) {
		try {
			listener(this.current);
		} catch (error) {
			this.owner.reportError("subscriber", error);
		}
	}
	settle(outcome) {
		if (this.current.phase === "settled") return;
		clearTimeout(this.transcriptionTimer);
		this.owner.seal(this);
		this.change({
			phase: "settled",
			outcome
		});
		if (outcome.status === "cancelled" || outcome.status === "failed") {
			this.abort.abort(outcome);
			this.capture?.cancel("Speech input closed");
			this.reader?.cancel(outcome).catch(() => {});
		}
		this.accepted?.seal();
		this.plugins?.close(outcome.status === "cancelled" ? outcome.reason : "Speech input settled");
		this.completion.resolve(outcome);
	}
};
//#endregion
//#region src/voice/output/speech-transformation/language.ts
/** The primary language subtag of a BCP 47 code, see `primaryLanguage` of `@proj-airi/speech-transformer-math`. */
function toSpeechLanguage(code) {
	return code === void 0 ? void 0 : primaryLanguage(code) || void 0;
}
const kana = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;
const hangul = /\p{Script=Hangul}/u;
const han = /\p{Script=Han}/u;
const latinWord = /[a-z]{2,}/i;
/**
* Selects the language of a formula or a price from the words around it, as a primary language subtag.
* Han characters without kana are Chinese, unless the voice is Japanese.
*/
function detectSpeechLanguage(context, fallback) {
	if (kana.test(context)) return "ja";
	if (hangul.test(context)) return "ko";
	if (han.test(context)) return fallback === "ja" ? "ja" : "zh";
	if (latinWord.test(context)) return "en";
	return fallback ?? "en";
}
//#endregion
//#region src/voice/output/speech-transformation/markdown.ts
/** Code that markdown keeps as written: fenced blocks and inline code. Math delimiters inside it are not math. */
const codeSpans = /(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/;
/**
* Converts `\(...\)` to `$...$` and `\[...\]` to `$$...$$`, outside code.
* CommonMark reads `\(` as an escaped parenthesis, so the backslash is gone after parsing.
*/
function normalizeMathDelimiters(markdown) {
	return markdown.split(codeSpans).map((part, index) => index % 2 === 1 ? part : part.replace(/\\\[([\s\S]+?)\\\]/g, (_, tex) => `$$${tex}$$`).replace(/\\\(([\s\S]+?)\\\)/g, (_, tex) => `$${tex}$`)).join("");
}
//#endregion
//#region src/voice/output/speech-transformation/preprocessor/math/speech.ts
/**
* The formula reader of AIRI: the built-in locale packs of `@proj-airi/speech-transformer-math`, with chemistry.
* A contributor adds or changes a language with `mathSpeech.register`.
*/
const mathSpeech = new MathSpeech({ extensions: [chemistry()] });
/** Reads TeX math source as words of one language. `\ce{}` is read as chemistry. See {@link MathSpeech.speak}. */
function speakMath(tex, language) {
	return mathSpeech.speak(tex, language);
}
/** Lowers TeX math source into MathJSON, without reading it. See {@link MathSpeech.toMathJson}. */
function toMathJson(tex) {
	return mathSpeech.toMathJson(tex);
}
//#endregion
//#region src/voice/output/speech-transformation/preprocessor/math/bare-latex.ts
/** Commands that start a formula in plain text. Unknown commands, such as a path `C:\Users`, do not. */
const knownCommands = new Set([
	...Object.keys(mathSpeech.locale("en").words),
	...Object.keys(mathSpeech.locale("en").relations),
	...Object.keys(mathSpeech.locale("en").operators),
	...mathSpeech.rawCommands.map((command) => `\\${command}`),
	...[
		"frac",
		"dfrac",
		"tfrac",
		"sqrt",
		"text",
		"mathrm",
		"mathbb",
		"overline",
		"vec",
		"hat",
		"left",
		"right",
		"sum",
		"prod",
		"int",
		"binom",
		"overset",
		"prime",
		"circ"
	].map((name) => `\\${name}`)
].filter((key) => key.startsWith("\\")));
/** One symbol that can continue a formula: an operator, a digit, an uppercase name, or one lowercase letter. */
const mathToken = /^(?:\s+|\d+(?:\.\d+)?|[A-Z]+|[a-z](?![a-z])|[=+\-*/<>()|'!^_[\]∞⊥∥≤≥≠≈∈∉⊆⊂∠△°±×÷→])/;
const trigger = /\\([a-z]+)|[a-z0-9)]\^[{\w]|_\{/gi;
function readBalanced(text, start) {
	let depth = 0;
	for (let index = start; index < text.length; index++) {
		if (text[index] === "\\") {
			index++;
			continue;
		}
		if (text[index] === "{") depth++;
		if (text[index] === "}" && --depth === 0) return index + 1;
	}
	return text.length;
}
/** Finds TeX that a reply writes without delimiters, for example `设 \alpha 为锐角` or `\ce{H2O}`. */
function findBareLatex(text) {
	const spans = [];
	for (const match of text.matchAll(trigger)) {
		if (match.index < (spans.at(-1)?.end ?? 0)) continue;
		if (match[1] !== void 0 && !knownCommands.has(`\\${match[1]}`)) continue;
		let start = match.index;
		while (start > 0) {
			const before = text.slice(0, start);
			const token = /(?:\s+|\d+(?:\.\d+)?|[A-Z]+|(?<![a-z])[a-z]|[=+\-*/<>()|'!^_])$/.exec(before);
			if (!token || before.length - token[0].length < (spans.at(-1)?.end ?? 0)) break;
			start -= token[0].length;
		}
		let end = match.index;
		while (end < text.length) {
			const rest = text.slice(end);
			if (rest[0] === "\\") {
				end += /^\\(?:[a-z]+|.)/i.exec(rest)[0].length;
				continue;
			}
			if (rest[0] === "{") {
				end = readBalanced(text, end);
				continue;
			}
			const token = mathToken.exec(rest);
			if (!token) break;
			end += token[0].length;
		}
		while (start < end && /\s/.test(text[start])) start++;
		while (end > start && /\s/.test(text[end - 1])) end--;
		if (end > start) spans.push({
			start,
			end
		});
	}
	return spans;
}
/**
* Braces a multi-digit script in TeX that a reply writes without delimiters.
* TeX applies `^` and `_` to one character, but `2^10` in plain text means 2 to the 10th power.
* Formulas inside `$` keep the TeX rule, because the renderer shows them by that rule.
*
* @example
* braceBareScripts('2^10 + x_12')
* // => '2^{10} + x_{12}'
*/
function braceBareScripts(tex) {
	return tex.replace(/([\^_])(\d{2,}(?:\.\d+)?|\d+\.\d+)/g, "$1{$2}");
}
//#endregion
//#region src/voice/output/speech-transformation/preprocessor/math/index.ts
/**
* Reads TeX formulas, chemistry in `\ce{}`, and units as words.
*
* Formulas go through `mathSpeech`, see ./speech. In prose, the plugin also finds TeX without delimiters, for example
* `\ce{H2O}`, and reads it as a formula.
*/
function mathSpeechPreprocessor() {
	return {
		name: "math",
		formula: (tex, { language }) => speakMath(tex, language),
		prose: (text, { readFormula }) => {
			const spans = findBareLatex(text);
			if (spans.length === 0) return text;
			const context = spans.reduceRight((rest, { start, end }) => rest.slice(0, start) + rest.slice(end), text);
			let result = "";
			let last = 0;
			for (const { start, end } of spans) {
				result += text.slice(last, start) + readFormula(braceBareScripts(text.slice(start, end)), context);
				last = end;
			}
			return result + text.slice(last);
		}
	};
}
//#endregion
//#region src/voice/output/speech-transformation/preprocessor/money/locales.ts
/**
* The money words of each language, by primary language subtag.
* Chinese keeps the digits, because a Chinese voice reads them. The other languages spell them, so the voice does not
* read them in another language.
*/
const locales$1 = {
	en: { dollars: (digits) => `${spellNumber(digits, "en")} ${digits === "1" ? "dollar" : "dollars"}` },
	ja: { dollars: (digits) => `${spellNumber(digits, "ja")}ドル` },
	ko: { dollars: (digits) => `${spellNumber(digits, "ko")} 달러` },
	zh: { dollars: (digits) => `${digits}美元` }
};
/** The money words of a language, or English for a language without them. */
function moneyLocale(language) {
	return locales$1[language] ?? locales$1.en;
}
//#endregion
//#region src/voice/output/speech-transformation/preprocessor/money/prices.ts
/** A dollar amount after `$`, with optional grouping commas and cents, for example `$1,200` or `$19.99`. */
const priceSource = String.raw`\$(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?`;
/** A price ends at a space, punctuation, CJK text, or the end. `$5\%$` and `$5$` are formulas, not prices. */
const priceEndSource = String.raw`(?=$|[\s,.;:!?)\]、，。！？）」』\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}])`;
const price$1 = new RegExp(`^${priceSource}${priceEndSource}`, "u");
const prices = new RegExp(`${priceSource}${priceEndSource}`, "gu");
/**
* Returns true when the `$` after `from` closes an inline formula by the Pandoc rule: no space before it, and no digit
* after it. The search stops at a blank line, because a formula does not cross paragraphs.
*/
function closesFormula(text, from) {
	for (let index = from; index < text.length; index++) {
		if (text[index] === "\n" && text[index + 1] === "\n") return false;
		if (text[index] === "\\") {
			index++;
			continue;
		}
		if (text[index] === "$") return !/\s/.test(text[index - 1] ?? " ") && !/\d/.test(text[index + 1] ?? "");
	}
	return false;
}
/**
* Escapes the `$` of a price, outside code, so the markdown parser keeps it as text.
*
* remark-math pairs any two `$`, so `$5, and the area is $x^2$` became one formula from `$5` to `$x`. A `$` that starts
* a price, and whose next `$` cannot close a formula, is a price. `$2 + 3$` stays a formula.
*
* @example
* escapePrices('A ticket is $5, and the area is $x^2$.')
* // => 'A ticket is \\$5, and the area is $x^2$.'
*/
function escapePrices(markdown) {
	return markdown.split(codeSpans).map((part, index) => {
		if (index % 2 === 1) return part;
		let result = "";
		let last = 0;
		for (let at = 0; at < part.length; at++) {
			if (part[at] !== "$" || part[at - 1] === "\\") continue;
			if (part[at + 1] === "$") {
				at++;
				continue;
			}
			const match = price$1.exec(part.slice(at));
			if (!match || closesFormula(part, at + match[0].length)) continue;
			result += `${part.slice(last, at)}\\`;
			last = at;
		}
		return result + part.slice(last);
	}).join("");
}
/**
* Reads the dollar amounts of a text as words of one language.
*
* @example
* speakPrices('Apples cost $3.', 'en')
* // => 'Apples cost three dollars.'
*/
function speakPrices(text, language) {
	const locale = moneyLocale(language);
	return text.replace(prices, (match) => locale.dollars(match.slice(1).replaceAll(",", "")));
}
//#endregion
//#region src/voice/output/speech-transformation/preprocessor/money/index.ts
/**
* Reads dollar amounts in prose as words of their sentence, for example `$3` as "three dollars".
*
* Before parsing, it escapes the `$` of a price with the Pandoc rule, so `$5 and $10` is not a formula.
* Inline code keeps its prices as written.
*/
function moneySpeechPreprocessor() {
	return {
		name: "money",
		prepare: escapePrices,
		prose: (text, { kind, language }) => kind === "text" ? speakPrices(text, language) : text
	};
}
//#endregion
//#region src/voice/output/speech-transformation/preprocessor/token/locales.ts
/** The token words of each language, by primary language subtag. */
const locales = {
	en: {
		dot: "dot",
		slash: "slash",
		backslash: "backslash",
		colon: "colon",
		tilde: "tilde",
		port: "port"
	},
	zh: {
		dot: "点",
		slash: "斜杠",
		backslash: "反斜杠",
		colon: "冒号",
		tilde: "波浪号",
		port: "端口"
	}
};
/** The token words of a language, or English for a language without them. */
function tokenLocale(language) {
	return locales[language] ?? locales.en;
}
//#endregion
//#region src/voice/output/speech-transformation/preprocessor/token/address.ts
/** A host name with a top-level domain of letters. `3.14` and `v1.2.3` are not hosts. */
const domain = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/;
const ipv4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;
const scheme = /^([a-z][a-z0-9+.-]*):\/\//i;
function toUrl(text) {
	try {
		return new URL(text);
	} catch {}
}
/**
* Whether a token is one address.
*
* A token with `://` is an address when `URL` parses it. Without a scheme, `URL` also parses `3.14` as an IPv4 address
* and `user@example.com` as a user and a host. So a token without a scheme needs a domain name, or an IPv4 address with
* a port or a path, and no user.
*/
function isAddress(token) {
	if (scheme.test(token)) return toUrl(token) !== void 0;
	const url = toUrl(`https://${token}`);
	if (!url || url.username) return false;
	return domain.test(url.hostname) || ipv4.test(url.hostname) && token.startsWith(url.hostname) && /[:/]/.test(token);
}
/** A path segment as written. A percent escape, as `%20`, reads as its character. */
function decodeSegment(segment) {
	try {
		return decodeURIComponent(segment);
	} catch {
		return segment;
	}
}
/**
* Reads web addresses, for example `https://home.example.com:8123/config` as `https home 点 example 点 com 端口 8123 斜杠
* config`. The words come from the token as written, so the case, an internationalized domain, and a default port stay.
* The scheme separator, a user, a query, a fragment, and a trailing slash have no words that a listener can use.
*/
const addressReader = {
	name: "address",
	read: (token, { language }) => {
		if (!isAddress(token)) return;
		const words = tokenLocale(language);
		const dotted = (part) => part.split(".").filter(Boolean).join(` ${words.dot} `);
		const schemeName = scheme.exec(token)?.[1];
		const location = (schemeName ? token.slice(schemeName.length + 3) : token).split(/[?#]/)[0];
		const slash = location.indexOf("/");
		const authority = slash === -1 ? location : location.slice(0, slash);
		const hostAndPort = authority.slice(authority.lastIndexOf("@") + 1);
		const port = /:(\d+)$/.exec(hostAndPort);
		const host = port ? hostAndPort.slice(0, port.index) : hostAndPort;
		const segments = slash === -1 ? [] : location.slice(slash).split("/").filter(Boolean);
		return [
			...schemeName ? [schemeName] : [],
			...host ? [dotted(host)] : [],
			...port ? [`${words.port} ${port[1]}`] : [],
			...segments.flatMap((segment) => [words.slash, dotted(decodeSegment(segment))])
		].join(" ");
	}
};
//#endregion
//#region src/voice/output/speech-transformation/preprocessor/token/path.ts
/**
* A path from the root, the home folder, the current folder, or a drive, for example `/etc`, `~/a`, `./a`, `.\a`, or
* `C:\a`. A token that starts with one `\`, as `\alpha`, is TeX, not a path.
*/
const rooted = /^(?:~|\.{1,2})?\/|^\.{1,2}\\|^[a-z]:\\/i;
/** A file name with an extension of letters and digits, for example `index.ts` or `archive.tar.gz`. */
const fileName = /^[\w-]+(?:\.[\w-]+)*\.[a-z][a-z0-9]*$/i;
/**
* A file name in prose needs a name and an extension of two characters or more, so `e.g` and `U.S` are not file names.
* Inline code also accepts `main.c`.
*/
const proseFileName = /^[\w-]{2,}(?:\.[\w-]+)*\.[a-z][a-z0-9]+$/i;
/** A hidden file in inline code, for example `.env` or `.gitignore`. */
const dotFile = /^\.[a-z][\w.-]*$/i;
function isPath(token, { kind }) {
	if (rooted.test(token) || kind === "code" && dotFile.test(token)) return true;
	const name = token.split(/[/\\]/).at(-1);
	return (kind === "code" ? fileName : proseFileName).test(name);
}
/** One part between separators, for example `~`, `C:`, `..`, `.env`, or `index.ts`. */
function speakSegment(segment, words) {
	if (segment === "~") return words.tilde;
	const drive = /^([a-z]):$/i.exec(segment);
	if (drive) return `${drive[1]} ${words.colon}`;
	if (/^\.+$/.test(segment)) return Array.from(segment, () => words.dot).join(" ");
	const spoken = segment.split(".").filter(Boolean).join(` ${words.dot} `);
	return segment.startsWith(".") ? `${words.dot} ${spoken}` : spoken;
}
/**
* Reads file paths, for example `./src/index.ts` as `点 斜杠 src 斜杠 index 点 ts`.
* A path without a file name in its last part, as `and/or` in prose, is not a path, so it stays as written.
*/
const pathReader = {
	name: "path",
	read: (token, context) => {
		if (!isPath(token, context)) return;
		const words = tokenLocale(context.language);
		const separators = {
			"/": words.slash,
			"\\": words.backslash
		};
		return token.split(/([/\\])/).filter(Boolean).map((part) => separators[part] ?? speakSegment(part, words)).join(" ");
	}
};
//#endregion
//#region src/voice/output/speech-transformation/preprocessor/token/tokens.ts
/**
* A run of characters that can make an address or a path. CJK text ends a run, so `访问example.com吧` has the token
* `example.com`. Private use characters belong to the run, because the speech stream marks a special token with one,
* see `controlMarker` in ../../../response.
*/
const tokens = /[\w~.:/\\@%+?#=&[\]\p{Co}-]+/gu;
/**
* A token is a candidate only when a symbol is between its characters, or starts a path, as in `.env`, `~/a`, or `/etc`.
* So `hello` and `end.` are not candidates.
*/
const innerSymbol = /\w[.:/\\@].|^[.~/][\w/\\]/;
/** Punctuation that ends the sentence around a token, not the token. */
const trailingPunctuation = /[.,:;!?)]+$/;
const markers = /\p{Co}/gu;
/**
* Reads each token of a text with the first reader that recognizes it. Other text stays as written.
* Words have no place for a marker inside a token, so its markers follow the words.
*/
function speakTokens(text, context, readers) {
	return text.replace(tokens, (match) => {
		const punctuation = trailingPunctuation.exec(match.replace(markers, ""))?.[0] ?? "";
		const token = match.replace(markers, "").slice(0, -punctuation.length || void 0);
		if (!innerSymbol.test(token)) return match;
		for (const reader of readers) {
			const words = reader.read(token, context);
			if (words !== void 0) return words + (match.match(markers)?.join("") ?? "") + punctuation;
		}
		return match;
	});
}
//#endregion
//#region src/voice/output/speech-transformation/preprocessor/token/index.ts
/** The default token readers: addresses first, because `example.com/docs` is also a valid relative path. */
function defaultTokenReaders() {
	return [addressReader, pathReader];
}
/**
* Reads tokens such as web addresses and file paths as words of their sentence, in prose, inline code, and link text.
* For example `https://home.example.com` reads as `https home 点 example 点 com`. A token that no reader recognizes
* stays as written. To add a reading, pass `readers: [myReader, ...defaultTokenReaders()]`.
*/
function tokenSpeechPreprocessor(options) {
	const readers = options?.readers ?? defaultTokenReaders();
	return {
		name: "token",
		prose: (text, { kind, language }) => speakTokens(text, {
			kind,
			language
		}, readers)
	};
}
//#endregion
//#region src/voice/output/speech-transformation/wiki-link.ts
const embedKinds = {
	avif: "image",
	bmp: "image",
	gif: "image",
	jpeg: "image",
	jpg: "image",
	png: "image",
	svg: "image",
	webp: "image",
	flac: "audio",
	m4a: "audio",
	mp3: "audio",
	ogg: "audio",
	wav: "audio",
	webm: "video",
	mkv: "video",
	mov: "video",
	mp4: "video",
	pdf: "pdf"
};
/** The word for each kind of embedded file, by primary language subtag. */
const embedWords = {
	en: {
		image: "image",
		audio: "audio",
		video: "video",
		pdf: "PDF file"
	},
	zh: {
		image: "图片",
		audio: "音频",
		video: "视频",
		pdf: "PDF 文件"
	}
};
/** The word for an embedded file in `language`, or `undefined` for a note, which reads as its name. */
function embedWord(target, language) {
	const kind = embedKinds[new URL(target, "file:///").pathname.split(".").at(-1)?.toLowerCase() ?? ""];
	return kind && (embedWords[language] ?? embedWords.en)[kind];
}
/** The word for an image without alternative text. */
function imageWord(language) {
	return (embedWords[language] ?? embedWords.en).image;
}
/**
* The words of a wiki link target, as Obsidian shows it: `Note#Heading` reads as `Note Heading`.
* A block reference such as `Note#^a1b2` has no words after the note.
*/
function speakWikiTarget(target) {
	const [page = "", ...headings] = target.split("#");
	return [page, ...headings.filter((heading) => !heading.startsWith("^"))].map((part) => part.trim()).filter(Boolean).join(" ");
}
//#endregion
//#region src/voice/output/speech-transformation/index.ts
/**
* The default preprocessor plugins. Tokens such as addresses read first, so the other plugins do not read their parts.
* Money reads before math, so a price reads before the math plugin looks for bare TeX.
*/
function defaultSpeechPreprocessors() {
	return [
		tokenSpeechPreprocessor(),
		moneySpeechPreprocessor(),
		mathSpeechPreprocessor()
	];
}
/** A delimiter between two ASCII operands is an operator, for example `x**2` or `a*b*c`, not emphasis. */
const asciiOperand = /^[A-Z0-9]$/i;
/** A sentence ends at these characters. The words of the sentence select the language of its formulas. */
const sentenceEnd = /[.!?。！？\n]/;
/** A word is two letters, or one CJK character, which can be a word alone, as 看. */
const word = /\p{L}{2,}|[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
/** One Pandoc or markdown-it attribute, for example `.note`, `#intro`, or `width=300`. */
const attributeSource = String.raw`(?:[.#][\w-]+|[\w-]+=[^\s}]*)`;
/** An attribute list, for example `{.note #intro}`. It has no sound. */
const attributeLists = new RegExp(String.raw`\s*\{${attributeSource}(?:\s+${attributeSource})*\}`, "g");
const leadingAttributeList = new RegExp(String.raw`^\{${attributeSource}(?:\s+${attributeSource})*\}`);
/**
* Compiles markdown to the text that a TTS provider reads.
*
* Markup that has no sound is removed: emphasis delimiters, heading and list markers, link URLs, code
* blocks, and HTML. Blocks are joined with a line break, so the TTS chunker pauses between them.
* Symbols that the parser keeps as text, for example `2 * 3`, `2**10`, or `x ~= 3`, stay unchanged.
*
* TeX formulas in `$...$`, `$$...$$`, `\(...\)`, `\[...\]`, and known commands without delimiters, such as
* `\ce{H2O}`, are read as words. The words of the sentence around a formula select its language, and
* `options.language` is used when they do not.
*/
const remarkSpeech = function(options) {
	this.compiler = (tree, file) => compile(tree, String(file), options);
};
/**
* Compiles markdown to the text that a TTS provider reads, with the preprocessor plugins of `options`.
*
* `\(...\)` and `\[...\]` become `$` delimiters first, because remark-math reads only `$`. Then each `prepare` hook
* rewrites the markdown, in plugin order.
*/
function toSpeechText(markdown, options) {
	const preprocessors = options?.preprocessors ?? defaultSpeechPreprocessors();
	const prepared = preprocessors.reduce((text, preprocessor) => preprocessor.prepare?.(text) ?? text, normalizeMathDelimiters(markdown));
	return String(unified().use(remarkParse).use(remarkCjkFriendly).use(remarkMath).use(remarkWikiLink).use(remarkSpeech, {
		...options,
		preprocessors
	}).processSync(prepared));
}
function compile(tree, source, options) {
	const marker = options?.marker;
	const fallback = toSpeechLanguage(options?.language);
	const preprocessors = options?.preprocessors ?? defaultSpeechPreprocessors();
	function count(text) {
		return marker ? text.split(marker).length - 1 : 0;
	}
	function range(node) {
		const start = node.position?.start.offset;
		const end = node.position?.end.offset;
		return start === void 0 || end === void 0 ? "" : source.slice(start, end);
	}
	/** Adds the markers that the source of a node has but its spoken text lost, for example in a link URL. */
	function keepMarkers(node, spoken) {
		const missing = count(range(node)) - count(spoken);
		return marker && missing > 0 ? spoken + marker.repeat(missing) : spoken;
	}
	function isOperator(node) {
		const start = node.position?.start.offset;
		const end = node.position?.end.offset;
		if (start === void 0 || end === void 0) return false;
		return asciiOperand.test(source[start - 1] ?? "") && asciiOperand.test(source[end] ?? "");
	}
	/** The text of a node without its formulas. */
	function plain(node) {
		if (node.type === "text") return node.value;
		return "children" in node ? node.children.map((child) => plain(child)).join("") : "";
	}
	/**
	* Reads a formula with the first formula hook that returns words, or keeps the source when none does.
	* Its markers move to its end, because words have no place for them.
	*/
	function speakFormula(source, context) {
		const tex = marker ? source.replaceAll(marker, "") : source;
		const language = detectSpeechLanguage(context, fallback);
		let spoken = tex;
		for (const preprocessor of preprocessors) {
			const words = preprocessor.formula?.(tex, { language });
			if (words !== void 0) {
				spoken = words;
				break;
			}
		}
		return spoken + (marker ?? "").repeat(count(source));
	}
	/** Runs the prose hooks over a run of text. `context` is the words of its sentence. */
	function speakProse(text, kind, context) {
		const language = detectSpeechLanguage(context, fallback);
		return preprocessors.reduce((rest, preprocessor) => preprocessor.prose?.(rest, {
			language,
			fallback,
			kind,
			readFormula: speakFormula
		}) ?? rest, text);
	}
	/**
	* Inline math follows the Pandoc rule, so `$5 and $10` stays text:
	* the content does not start or end with a space, and a digit does not follow the closing `$`.
	*/
	function isFormula(node) {
		if (range(node).startsWith("$$")) return true;
		const after = sourceAfter(node);
		return !/^\s|\s$/.test(node.value) && !/^\d/.test(after);
	}
	function sourceAfter(node) {
		const end = node.position?.end.offset;
		return end === void 0 ? "" : source.slice(end, end + 1);
	}
	/** The words of the sentence that holds a formula, in the paragraph `nodes`. Other sentences are the fallback. */
	function sentenceAround(nodes, index) {
		const before = nodes.slice(0, index).map(plain).join("");
		const after = nodes.slice(index + 1).map(plain).join("");
		const sentence = before.split(sentenceEnd).at(-1) + after.split(sentenceEnd)[0];
		if (word.test(sentence)) return sentence;
		return word.test(before + after) ? before + after : options?.before ?? "";
	}
	function blocks(nodes) {
		return nodes.map((node, index) => block(node, nodes, index)).filter(Boolean).join("\n");
	}
	function block(node, siblings, index) {
		switch (node.type) {
			case "paragraph":
			case "heading": return phrasing(node.children);
			case "blockquote":
			case "list":
			case "listItem": return blocks(node.children);
			case "math": {
				const context = [siblings[index - 1] ? plain(siblings[index - 1]) : options?.before ?? "", siblings[index + 1] ? plain(siblings[index + 1]) : ""].join("\n");
				return keepMarkers(node, speakFormula(node.value, context));
			}
			default: return keepMarkers(node, "");
		}
	}
	/** `outer` is the sentence around the parent node, for example around a link. */
	function phrasing(nodes, outer = "") {
		return nodes.map((node, index) => inline(node, nodes, index, outer)).join("");
	}
	function inline(node, siblings, index, outer) {
		const around = () => sentenceAround(siblings, index) + outer;
		const language = () => detectSpeechLanguage(around(), fallback);
		switch (node.type) {
			case "text": {
				const previous = siblings[index - 1]?.type;
				const value = previous === "link" || previous === "image" ? node.value.replace(leadingAttributeList, "") : node.value;
				return speakProse(value, "text", around() + value);
			}
			case "inlineCode": return speakProse(node.value, "code", around() + node.value);
			case "wikiLink": {
				const text = node.data?.alias ?? speakWikiTarget(node.value);
				return keepMarkers(node, speakProse(text, "text", around() + text));
			}
			case "embed": {
				const text = node.data?.alias ?? embedWord(node.value, language()) ?? speakWikiTarget(node.value);
				return keepMarkers(node, speakProse(text, "text", around() + text));
			}
			case "inlineMath": return isFormula(node) ? keepMarkers(node, speakFormula(node.value, around())) : keepMarkers(node, range(node));
			case "emphasis":
			case "strong":
			case "delete": return isOperator(node) ? range(node) : phrasing(node.children, around());
			case "link":
			case "linkReference": {
				const spoken = phrasing(node.children, around());
				return keepMarkers(node, spoken.slice(spoken.lastIndexOf("|") + 1).replace(attributeLists, "").trim());
			}
			case "image":
			case "imageReference": return keepMarkers(node, (node.alt ?? "").replace(/\|\s*\d+(?:x\d+)?$/, "").trim() || imageWord(language()));
			case "break": return "\n";
			default: return keepMarkers(node, "");
		}
	}
	return blocks(tree.children);
}
//#endregion
//#region src/voice/output/speech-transformation/segmenter.ts
/** Sentence ends of CJK text. A segment can end right after them. */
const cjkSentenceEnds = /* @__PURE__ */ new Set([
	"。",
	"！",
	"？"
]);
/** Sentence ends of Latin text. A segment can end after them when a space follows. */
const latinSentenceEnds = /* @__PURE__ */ new Set([
	".",
	"!",
	"?"
]);
/** Closing quotes and brackets that stay with the sentence before them, as in `他说：“好。”`. */
const closers = /* @__PURE__ */ new Set([
	"\"",
	"'",
	"”",
	"’",
	"」",
	"』",
	"）",
	")",
	"】"
]);
/**
* A `$` that starts a price, as `$5` or `$1,200.50`, followed by an end of the amount. It does not open a formula.
* The same rule as the money plugin, see ./preprocessor/money/prices.
*/
const price = /^\$(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?=$|[\s,.;:!?)\]、，。！？）」』\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}])/u;
function isOpen(state) {
	return state.fence !== void 0 || state.code !== void 0 || state.math !== void 0 || state.brackets > 0 || state.url || state.emphasis || state.strong || state.table;
}
/**
* Splits streamed markdown into segments that parse alone as they would inside the whole reply.
*
* `toSpeechText` needs whole markdown constructs: a formula, a code block, a link, or a table that is cut in two reads
* as its source. The model streams text in pieces, so the segmenter holds the text after the last safe end. A segment
* ends after a sentence end or a line, when no code, formula, link, emphasis, or table is open.
*
* Markdown is not fully streamable. A construct that refers to later text, as a reference link definition, reads as
* text when its segment has ended. Model replies rarely use them.
*
* @example
* const segmenter = new MarkdownSegmenter()
* segmenter.push('The area is $x^') // => []
* segmenter.push('2$. Next') // => ['The area is $x^2$. ']
* segmenter.end() // => ['Next']
*/
var MarkdownSegmenter = class {
	buffer = "";
	/** Adds streamed text. Returns the segments that ended. */
	push(text) {
		this.buffer += text;
		const end = this.safeEnd(false);
		return end > 0 ? [this.take(end)] : [];
	}
	/**
	* Ends a segment at the end of the buffer when nothing is open there, for a flush of the producer. A sentence can end
	* in the middle then, which is what a flush asks for.
	*/
	flush() {
		const end = this.safeEnd(true);
		return end > 0 ? [this.take(end)] : [];
	}
	/** Returns the rest of the text. The model has ended, so an open construct stays as written. */
	end() {
		const rest = this.take(this.buffer.length);
		return rest ? [rest] : [];
	}
	take(end) {
		const segment = this.buffer.slice(0, end);
		this.buffer = this.buffer.slice(end);
		return segment;
	}
	/**
	* Scans the buffer and returns the last index where a segment can end, or 0. `atEnd` also accepts the end of the
	* buffer.
	*/
	safeEnd(atEnd) {
		const text = this.buffer;
		const state = {
			brackets: 0,
			url: false,
			emphasis: false,
			strong: false,
			table: false
		};
		let last = 0;
		let lineStart = true;
		for (let index = 0; index < text.length; index++) {
			const char = text[index];
			if (lineStart) {
				lineStart = false;
				const line = text.slice(index, text.indexOf("\n", index) === -1 ? void 0 : text.indexOf("\n", index));
				const fence = /^ {0,3}(`{3,}|~{3,})/.exec(line);
				if (fence && (state.fence === void 0 || fence[1].startsWith(state.fence))) {
					state.fence = state.fence === void 0 ? fence[1] : void 0;
					index += line.length - 1;
					continue;
				}
				if (state.fence !== void 0) {
					index += line.length - 1;
					continue;
				}
				state.table = /^ {0,3}\|/.test(line);
			}
			if (char === "\n") {
				lineStart = true;
				if (text[index + 1] === "\n") {
					state.code = void 0;
					state.emphasis = false;
					state.strong = false;
					if (state.math === "$") state.math = void 0;
				}
				const next = text[index + 1];
				if (next !== void 0 && next !== " " && next !== "	" && next !== "=") {
					if (state.table && next !== "|") state.table = false;
					if (!isOpen(state)) last = index + 1;
				}
				continue;
			}
			if (state.fence !== void 0) continue;
			if (char === "\\") {
				const pair = text.slice(index, index + 2);
				if (state.code === void 0 && (pair === "\\(" || pair === "\\[") && state.math === void 0) state.math = pair;
				else if (state.code === void 0 && (pair === "\\)" && state.math === "\\(" || pair === "\\]" && state.math === "\\[")) state.math = void 0;
				index++;
				continue;
			}
			if (char === "`") {
				let run = "`";
				while (text[index + run.length] === "`") run += "`";
				if (state.math === void 0) {
					if (state.code === void 0) state.code = run;
					else if (state.code === run) state.code = void 0;
				}
				index += run.length - 1;
				continue;
			}
			if (state.code !== void 0) continue;
			if (char === "$") {
				if (text[index + 1] === "$") {
					if (state.math === void 0) state.math = "$$";
					else if (state.math === "$$") state.math = void 0;
					index++;
					continue;
				}
				if (state.math === "$") state.math = void 0;
				else if (state.math === void 0 && text[index + 1] !== void 0 && !/\s/.test(text[index + 1]) && !price.test(text.slice(index))) state.math = "$";
				continue;
			}
			if (state.math !== void 0) continue;
			let terminal = char;
			if (char === "[") state.brackets++;
			else if (char === "]" && state.brackets > 0) {
				state.brackets--;
				if (text[index + 1] === "(") {
					state.url = true;
					index++;
				}
			} else if (char === ")" && state.url) state.url = false;
			else if (char === "*") {
				let run = 1;
				while (text[index + run] === "*") run++;
				if (!(/\s/.test(text[index - 1] ?? " ") && /\s/.test(text[index + run] ?? " "))) {
					if (run >= 2) state.strong = !state.strong;
					if (run % 2 === 1) state.emphasis = !state.emphasis;
				}
				terminal = text[index - 1] ?? "";
				index += run - 1;
			}
			if (isOpen(state)) continue;
			let end;
			if (cjkSentenceEnds.has(terminal)) end = index + 1;
			else if (latinSentenceEnds.has(terminal) && (text[index + 1] === " " || text[index + 1] === "	") && !/^\s*\d+$/.test(text.slice(text.lastIndexOf("\n", index) + 1, index))) end = index + 1;
			if (end === void 0) continue;
			while (closers.has(text[end] ?? "")) end++;
			while (text[end] === " " || text[end] === "	") end++;
			if (end < text.length) last = end;
		}
		if (atEnd && !isOpen(state) && state.fence === void 0 && text.length > 0) return text.length;
		return last;
	}
};
//#endregion
//#region src/voice/output/response.ts
/**
* Marks where a special token or a flush occurs in the streamed text, so that markdown conversion keeps its position.
* It is a Unicode private use character. Model text does not contain it, and producer text is stripped of it.
*/
const controlMarker = "";
/** One producer owns its text, synthesis, queued audio, and cancellation within a response. */
var SpeechStream = class {
	response;
	purpose;
	output;
	abort = new AbortController();
	completion = Promise.withResolvers();
	intent;
	text;
	outputReader;
	started = false;
	sealed = false;
	settled = false;
	timer;
	/** Holds the text after the last safe end of the streamed markdown. A control marker holds the place of a control. */
	segmenter = new MarkdownSegmenter();
	/** Controls whose markers are still in the segmenter, in order. */
	controls = [];
	/** The spoken text of the last segment, for the language of a formula that starts the next one. */
	spoken = "";
	signal = this.abort.signal;
	done = this.completion.promise;
	constructor(response, purpose, output) {
		this.response = response;
		this.purpose = purpose;
		this.output = output;
	}
	/** The response registers this stream before it starts synthesis or playback. Setup errors settle `done`. */
	start(previous, deadlineMs) {
		if (this.started) throw new Error("Speech stream already started");
		this.started = true;
		try {
			this.startProvider(previous, deadlineMs);
		} catch (cause) {
			this.fail(errorFromCause(cause, "Speech stream setup failed"));
		}
	}
	startProvider(previous, deadlineMs) {
		if (deadlineMs !== void 0) this.timer = setTimeout(() => this.cancel("Speech deadline ended"), deadlineMs);
		const { output, response } = this;
		if ("stream" in output) {
			this.text = createPushStream();
			this.playStream(previous, output.stream);
			return;
		}
		const listeners = {
			start: /* @__PURE__ */ new Set(),
			end: /* @__PURE__ */ new Set(),
			interrupt: /* @__PURE__ */ new Set()
		};
		const pending = /* @__PURE__ */ new Set();
		const pipeline = createSpeechPipeline({
			tts: async (request, signal) => {
				const { segmentId } = request;
				response.emit({
					type: "tts-request",
					segmentId,
					text: request.text,
					reason: request.reason
				});
				try {
					const audio = await output.synthesize(request, AbortSignal.any([
						signal,
						this.signal,
						response.signal
					]));
					const aborted = signal.aborted || this.signal.aborted || response.signal.aborted;
					response.emit({
						type: "tts-result",
						segmentId,
						status: aborted ? "cancelled" : audio ? "audio" : "no-audio"
					});
					return aborted ? null : audio;
				} catch (cause) {
					const error = errorFromCause(cause, "Speech synthesis failed");
					const aborted = signal.aborted || this.signal.aborted || response.signal.aborted;
					response.emit(aborted ? {
						type: "tts-result",
						segmentId,
						status: "cancelled"
					} : {
						type: "tts-result",
						segmentId,
						status: "failed",
						error
					});
					this.fail(error);
					return null;
				}
			},
			playback: {
				schedule: (item) => {
					pending.add(item);
					const clip = {
						id: item.segmentId,
						text: item.text
					};
					let started = false;
					Promise.race([previous, this.done]).then(async () => {
						if (this.signal.aborted || response.signal.aborted) return "stopped";
						return response.playback.enqueue({
							id: item.id,
							audio: item.audio,
							signal: this.signal,
							onStart: () => {
								started = true;
								listeners.start.forEach((listener) => listener({
									item,
									startedAt: Date.now()
								}));
								response.emit({
									type: "playback-start",
									segmentId: clip.id,
									text: clip.text
								});
								output.onPlaybackStart?.(clip);
							}
						});
					}).then((result) => {
						if (started) {
							const end = this.clipEnd(result);
							response.emit({
								type: "playback-end",
								segmentId: clip.id,
								text: clip.text,
								...end
							});
							output.onPlaybackEnd?.(clip, end);
						}
						if (!pending.delete(item)) return;
						if (result === "ended") listeners.end.forEach((listener) => listener({
							item,
							endedAt: Date.now()
						}));
						else listeners.interrupt.forEach((listener) => listener({
							item,
							interruptedAt: Date.now(),
							reason: result
						}));
						if (result === "failed") this.fail(/* @__PURE__ */ new Error("Speech playback failed"));
					}, (cause) => this.fail(errorFromCause(cause, "Speech playback failed")));
				},
				stopByIntent: (_id, reason) => {
					for (const item of pending) listeners.interrupt.forEach((listener) => listener({
						item,
						interruptedAt: Date.now(),
						reason
					}));
					pending.clear();
				},
				stopAll: (reason) => this.cancel(reason),
				stopByOwner: (_id, reason) => this.cancel(reason),
				onStart: (listener) => {
					listeners.start.add(listener);
				},
				onEnd: (listener) => {
					listeners.end.add(listener);
				},
				onInterrupt: (listener) => {
					listeners.interrupt.add(listener);
				},
				onReject: () => {}
			}
		});
		pipeline.on("onSpecial", (segment) => {
			if (!segment.special) return;
			response.emit({
				type: "token-special",
				segmentId: segment.segmentId,
				special: segment.special
			});
			output.onSpecial?.(segment.special);
		});
		pipeline.on("onIntentEnd", () => this.settle({
			status: "finished",
			value: void 0
		}));
		this.intent = pipeline.openIntent({
			turnId: response.turn.turnId,
			ownerId: response.turn.sessionId
		});
	}
	/** Triggering workflow: VoiceController response → provider text stream → reserved playback slot → producer completion. */
	async playStream(previous, synthesize) {
		const requestId = nanoid$1();
		this.response.emit({
			type: "tts-request",
			segmentId: requestId,
			text: ""
		});
		try {
			let audio;
			try {
				audio = await synthesize(this.text.stream, AbortSignal.any([this.signal, this.response.signal]));
			} catch (cause) {
				const error = errorFromCause(cause, "Streaming speech failed");
				const aborted = this.signal.aborted || this.response.signal.aborted;
				this.response.emit(aborted ? {
					type: "tts-result",
					segmentId: requestId,
					status: "cancelled"
				} : {
					type: "tts-result",
					segmentId: requestId,
					status: "failed",
					error
				});
				throw error;
			}
			this.response.emit({
				type: "tts-result",
				segmentId: requestId,
				status: this.signal.aborted || this.response.signal.aborted ? "cancelled" : "audio"
			});
			await Promise.race([previous, this.done]);
			if (this.signal.aborted || this.response.signal.aborted) {
				await audio.cancel("Speech producer closed");
				return;
			}
			this.outputReader = audio.getReader();
			const playing = [];
			while (!this.signal.aborted && !this.response.signal.aborted) {
				const result = await this.outputReader.read();
				if (result.done) break;
				const part = result.value;
				const clip = {
					id: nanoid$1(),
					text: part.text ?? ""
				};
				let started = false;
				playing.push(this.response.playback.enqueue({
					id: clip.id,
					audio: part.audio,
					signal: this.signal,
					onStart: () => {
						started = true;
						this.response.emit({
							type: "playback-start",
							segmentId: clip.id,
							text: clip.text
						});
						this.output.onPlaybackStart?.(clip);
					}
				}).then((status) => {
					if (started) {
						const end = this.clipEnd(status);
						this.response.emit({
							type: "playback-end",
							segmentId: clip.id,
							text: clip.text,
							...end
						});
						this.output.onPlaybackEnd?.(clip, end);
					}
					if (status === "failed") this.fail(/* @__PURE__ */ new Error("Speech playback failed"));
				}));
			}
			if (!this.sealed) throw new Error("Speech provider completed before text input ended");
			await Promise.all(playing);
			this.settle({
				status: "finished",
				value: void 0
			});
		} catch (cause) {
			this.fail(errorFromCause(cause, "Streaming speech failed"));
		} finally {
			this.outputReader?.releaseLock();
			this.outputReader = void 0;
		}
	}
	clipEnd(status) {
		if (status === "ended") return { status };
		const signal = this.signal.aborted ? this.signal : this.response.signal;
		return signal.aborted ? {
			status,
			reason: errorMessageFromValue(signal.reason)
		} : { status };
	}
	/** Special tokens keep their position relative to the text. */
	special(value) {
		if (this.sealed || this.response.signal.aborted) return;
		this.controls.push({
			type: "special",
			value
		});
		this.deliver(this.segmenter.push(controlMarker));
	}
	/** Sends the text so far, unless a formula or another construct is still open. Then the flush follows its end. */
	flush() {
		if (this.sealed) return;
		this.controls.push({ type: "flush" });
		this.deliver([...this.segmenter.push(controlMarker), ...this.segmenter.flush()]);
	}
	write(text) {
		if (this.sealed || this.response.signal.aborted) return { status: "closed" };
		this.deliver(this.segmenter.push(text.replaceAll(controlMarker, "")));
		return { status: "accepted" };
	}
	end() {
		if (this.sealed) return;
		if (!this.response.signal.aborted) this.deliver(this.segmenter.end());
		this.sealed = true;
		this.text?.close();
		this.intent?.end();
	}
	/**
	* Sends each segment as speech text, with its controls in source order. Controls that conversion lost are sent after
	* the text of their segment, in order.
	*/
	deliver(segments) {
		if (this.response.signal.aborted) return;
		for (const segment of segments) {
			const count = segment.split(controlMarker).length - 1;
			const controls = this.controls.splice(0, count);
			const parts = toSpeechText(segment, {
				marker: controlMarker,
				language: this.output.language,
				before: this.spoken
			}).split(controlMarker);
			const separator = /\n\s*$/.test(segment) ? "\n" : /[ \t]$/.test(segment) ? " " : "";
			parts.forEach((text, index) => {
				const last = index === parts.length - 1;
				const spoken = last && text ? text + separator : text;
				if (spoken) this.deliverText(spoken);
				if (text.trim()) this.spoken = text;
				const control = controls[index];
				if (control && !last) this.deliverControl(control);
			});
			controls.slice(parts.length - 1).forEach((control) => this.deliverControl(control));
			this.intent?.writeFlush();
		}
	}
	deliverText(text) {
		if (this.text) this.text.write(text);
		else this.intent.writeLiteral(text);
	}
	/** The chunker orders special tokens with the audio. Streaming providers handle them outside their text transport. */
	deliverControl(control) {
		if (control.type === "flush") this.intent?.writeFlush();
		else if (this.intent) this.intent.writeSpecial(control.value);
		else {
			this.response.emit({
				type: "token-special",
				special: control.value
			});
			this.output.onSpecial?.(control.value);
		}
	}
	cancel(reason) {
		if (this.settled) return;
		this.abort.abort(reason);
		this.text?.close();
		this.outputReader?.cancel("Speech producer closed").catch(() => {});
		this.intent?.cancel(reason);
		this.settle({
			status: "cancelled",
			reason
		});
	}
	fail(error) {
		if (this.settled) return;
		this.abort.abort(error);
		this.text?.close();
		this.outputReader?.cancel("Speech producer closed").catch(() => {});
		this.intent?.cancel(error.message);
		this.settle({
			status: "failed",
			error
		});
	}
	settle(outcome) {
		if (this.settled) return;
		this.sealed = true;
		this.settled = true;
		clearTimeout(this.timer);
		this.completion.resolve(outcome);
	}
};
/** Speech producers synthesize concurrently. Their reserved playback order follows creation order. */
var VoiceResponse = class {
	output;
	onClosed;
	abort = new AbortController();
	lifetime = new AbortController();
	listeners = /* @__PURE__ */ new Set();
	streams = [];
	ordered = Promise.resolve();
	sealed = false;
	outcome;
	finishing;
	silence;
	signal = this.abort.signal;
	/** Aborts after the response closes: its producers settled and its playback is silent. `signal` aborts only on a stop. */
	closedSignal = this.lifetime.signal;
	playback;
	turn;
	constructor(turn, output, onClosed) {
		this.output = output;
		this.onClosed = onClosed;
		this.turn = Object.freeze({ ...turn });
		this.playback = output.playback.openGroup(`${turn.sessionId}:${turn.turnId}`);
	}
	get closed() {
		return this.outcome !== void 0;
	}
	/** Receives the speech events of this response until the returned function runs. */
	subscribe(listener) {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}
	/** The producers of this response report their speech here. A failing listener does not stop the speech. */
	emit(event) {
		for (const listener of this.listeners) try {
			listener(event);
		} catch (cause) {
			console.error("[VoiceResponse] Speech event listener failed", cause);
		}
	}
	openSpeech(settings) {
		if (this.sealed) throw new Error("Response is closed to new speech");
		if (settings.deadlineMs !== void 0 && (!Number.isFinite(settings.deadlineMs) || settings.deadlineMs < 0)) throw new Error("Speech deadline must be finite and nonnegative");
		const previous = this.ordered;
		const stream = new SpeechStream(this, settings.purpose, this.output);
		this.ordered = Promise.all([previous, stream.done]);
		this.streams.push(stream);
		stream.start(previous, settings.deadlineMs);
		return stream;
	}
	finish() {
		if (this.finishing) return this.finishing;
		this.sealed = true;
		this.streams.forEach((stream) => stream.end());
		this.finishing = (async () => {
			const results = await Promise.all(this.streams.map((stream) => stream.done));
			const receipt = await (this.silence ?? this.playback.finish());
			this.outcome ??= receipt.status === "failed" || results.some((result) => result.status === "failed") ? "failed" : "finished";
			return this.outcome;
		})();
		const close = () => {
			this.lifetime.abort("Response closed");
			this.listeners.clear();
			this.onClosed();
		};
		this.finishing.then(close, close);
		return this.finishing;
	}
	cancel(reason) {
		if (this.closed) return;
		this.outcome = "cancelled";
		this.stop(reason, 0);
		this.finish().catch(() => {});
	}
	/** Triggering workflow: VoiceController.interrupt → close response delivery → fade playback and abort all producers. */
	interrupt(cause, fadeMs) {
		if (!this.closed) {
			this.outcome = "interrupted";
			this.stop(cause, fadeMs);
			this.finish().catch(() => {});
		}
		return this.silence ?? this.playback.finish();
	}
	stop(reason, fadeMs) {
		this.sealed = true;
		this.silence = this.playback.stop({ fadeMs });
		this.abort.abort(reason);
		this.streams.forEach((stream) => stream.cancel(reason));
	}
};
//#endregion
//#region src/voice/plugins/input-plugins.ts
const closed = Object.freeze({
	status: "rejected",
	reason: "closed"
});
/**
* One plugin's work on one input.
*
* `lifetime` aborts when the input closes or the plugin is disposed. Watchers and stages are children of it, so one
* abort stops all of them. Cleanups registered through `onDispose` run after that abort.
*/
var PluginInput = class {
	installation;
	owner;
	lifetime;
	watchers = [];
	stages = [];
	installing = Promise.resolve();
	constructor(installation, owner) {
		this.installation = installation;
		this.owner = owner;
		this.lifetime = createTask({
			signal: AbortSignal.any([installation.signal, owner.signal]),
			onCleanupError: (cause) => this.report("cleanup", errorFromCause(cause, "Plugin cleanup failed"))
		});
	}
	get name() {
		return this.installation.name;
	}
	install() {
		const input = this.owner.input;
		const scope = {
			inputId: input.id,
			sessionId: input.sessionId,
			signal: this.lifetime.signal,
			control: this.installation.control(() => !this.lifetime.settled),
			watch: (run, options = {}) => {
				if (this.lifetime.settled) return;
				const watcher = createLatest(run, {
					...options,
					signal: this.lifetime.signal,
					onError: (cause) => this.report("watch", errorFromCause(cause, "Transcript watcher failed"))
				});
				this.watchers.push(watcher);
				if (this.owner.watching) watcher.push(input.document);
			},
			finalize: (run, options = {}) => {
				if (options.timeoutMs !== void 0 && (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 0)) throw new Error("Finalization timeout must be finite and nonnegative");
				this.stages.push({
					run,
					options
				});
			},
			onDispose: (cleanup) => this.lifetime.defer(cleanup)
		};
		const installs = this.installation.installers.map(async (install) => {
			try {
				await install(scope);
			} catch (cause) {
				this.report("input", errorFromCause(cause, "Plugin input setup failed"));
				this.lifetime.cancel("Plugin input setup failed");
			}
		});
		this.installing = Promise.all(installs).then(() => {});
	}
	update(document) {
		for (const watcher of this.watchers) watcher.push(document);
	}
	/** Drops debounced watcher inputs. Active runs continue, because a finalization stage can await their results. */
	stopWatching() {
		for (const watcher of this.watchers) watcher.cancelPending();
	}
	/** Runs this plugin's stages in registration order. A failed or timed-out stage does not stop the next one. */
	async finalize() {
		await this.installing;
		for (const stage of this.stages) {
			if (this.lifetime.settled) return;
			await this.runStage(stage.run, stage.options);
		}
	}
	async runStage(run, options) {
		const input = this.owner.input;
		const task = runTask(async (self) => {
			const live = () => !self.settled;
			await run({
				document: input.document,
				signal: self.signal,
				patch: (edits, evidenceIds = []) => live() ? input.patch(this.name, {
					edits,
					evidenceIds
				}) : closed,
				attach: (key, value) => live() ? this.owner.attach(this.name, key, value) : closed
			});
		}, { signal: this.lifetime.signal });
		const timer = options.timeoutMs === void 0 ? void 0 : setTimeout(() => task.cancel("Finalization stage timed out"), options.timeoutMs);
		const outcome = await task.done;
		clearTimeout(timer);
		if (outcome.status === "failed") this.report("finalize", outcome.error);
	}
	/** Aborts watchers and stages, then waits for this plugin's cleanups. */
	dispose(reason) {
		this.lifetime.cancel(reason);
		return this.lifetime.closed;
	}
	report(stage, error) {
		this.installation.report(stage, error, this.owner.input.id);
	}
};
/**
* Owns all plugin work of one accepted input.
*
* Phases:
* - Watching: from install until `finish`. Each new document reaches every watcher.
* - Finalizing: `finish` stops document delivery, then runs every stage in plugin installation order. Speculative
*   watcher runs continue, because a stage can await their results.
* - Closed: `close` aborts all work and waits for plugin cleanups. The attempt calls it once it settles.
*/
var InputPlugins = class {
	input;
	lifetime = new AbortController();
	entries;
	attached = /* @__PURE__ */ new Map();
	unsubscribe;
	watching = true;
	constructor(input, installations) {
		this.input = input;
		this.entries = installations.map((installation) => new PluginInput(installation, this));
		for (const entry of this.entries) {
			entry.installation.inputs.add(entry);
			entry.install();
		}
		this.unsubscribe = input.subscribe((document) => {
			for (const entry of this.entries) entry.update(document);
		});
	}
	get signal() {
		return this.lifetime.signal;
	}
	get context() {
		return [...this.attached].flatMap(([plugin, values]) => [...values].map(([key, value]) => Object.freeze({
			plugin,
			key,
			value
		})));
	}
	attach(plugin, key, value) {
		if (this.lifetime.signal.aborted) return closed;
		const values = this.attached.get(plugin) ?? /* @__PURE__ */ new Map();
		values.set(key, value);
		this.attached.set(plugin, values);
		return { status: "applied" };
	}
	async finish() {
		this.watching = false;
		this.unsubscribe();
		for (const entry of this.entries) entry.stopWatching();
		for (const entry of this.entries) await entry.finalize();
	}
	async close(reason) {
		this.watching = false;
		this.unsubscribe();
		this.lifetime.abort(reason);
		await Promise.all(this.entries.map(async (entry) => {
			await entry.dispose(reason);
			entry.installation.inputs.delete(entry);
		}));
	}
};
//#endregion
//#region src/voice/plugins/output-plugins.ts
function isEventOf(event, type) {
	return event.type === type;
}
/**
* One plugin's work on one response.
*
* `lifetime` aborts when the response closes or the plugin is disposed. Event listeners and cleanups registered
* through `onDispose` belong to it, so one abort stops all of them.
*
* Events wait in `pending` until every installer of the plugin settles. An installer can await before it registers a
* listener, and it still receives the events of the response from the start, also when the response closed meanwhile.
* A disposed plugin receives nothing.
*/
var PluginOutput = class {
	installation;
	response;
	lifetime;
	listeners = /* @__PURE__ */ new Set();
	pending = [];
	constructor(installation, response) {
		this.installation = installation;
		this.response = response;
		this.lifetime = createTask({
			signal: AbortSignal.any([installation.signal, response.closedSignal]),
			onCleanupError: (cause) => this.report(errorFromCause(cause, "Plugin cleanup failed"))
		});
	}
	install() {
		const { response } = this;
		this.lifetime.defer(response.subscribe((event) => {
			if (this.pending) this.pending.push(event);
			else this.dispatch(event);
		}));
		const scope = {
			turn: response.turn,
			signal: this.lifetime.signal,
			controls: this.installation.controls(() => !this.lifetime.settled),
			on: (type, listener) => {
				if (this.installation.signal.aborted || this.lifetime.settled && !this.pending) return;
				const filtered = (event) => {
					if (isEventOf(event, type)) listener(event);
				};
				this.listeners.add(filtered);
				if (!this.lifetime.settled) this.lifetime.defer(() => this.listeners.delete(filtered));
			},
			onDispose: (cleanup) => this.lifetime.defer(cleanup)
		};
		const installs = this.installation.installers.map(async (install) => {
			try {
				await install(scope);
			} catch (cause) {
				this.report(errorFromCause(cause, "Plugin output setup failed"));
			}
		});
		Promise.all(installs).then(() => {
			const events = this.pending ?? [];
			this.pending = void 0;
			if (!this.installation.signal.aborted) events.forEach((event) => this.dispatch(event));
			if (this.lifetime.settled) this.listeners.clear();
		});
	}
	dispatch(event) {
		for (const listener of [...this.listeners]) try {
			listener(event);
		} catch (cause) {
			this.report(errorFromCause(cause, "Speech output listener failed"));
		}
	}
	/** Removes the listeners, then waits for this plugin's cleanups. */
	dispose(reason) {
		this.lifetime.cancel(reason);
		return this.lifetime.closed;
	}
	report(error) {
		this.installation.report("output", error, this.response.turn);
	}
};
/**
* Installs every plugin on a new response, in plugin installation order.
*
* Each installation forgets the output after the response closes, so a long session keeps no closed responses.
*/
function installOutputPlugins(response, installations) {
	for (const installation of installations) {
		if (!installation.installers.length) continue;
		const output = new PluginOutput(installation, response);
		installation.outputs.add(output);
		output.install();
		response.closedSignal.addEventListener("abort", () => installation.outputs.delete(output), { once: true });
	}
}
//#endregion
//#region src/voice/plugins/registry.ts
var PluginInstallation = class {
	host;
	actions;
	plugin;
	settings;
	abort = new AbortController();
	inputs = /* @__PURE__ */ new Set();
	outputs = /* @__PURE__ */ new Set();
	installers = [];
	outputInstallers = [];
	cleanups = [];
	disposing;
	constructor(host, actions, plugin, settings) {
		this.host = host;
		this.actions = actions;
		this.plugin = plugin;
		this.settings = settings;
	}
	report(stage, error, inputId, turn) {
		try {
			if (this.settings.onError) this.settings.onError({
				plugin: this.plugin.name,
				stage,
				error,
				...inputId ? { inputId } : {},
				...turn ? { turn } : {}
			});
			else this.actions.reportError(`plugin:${this.plugin.name}:${stage}`, error);
		} catch (cause) {
			this.actions.reportError("plugin-diagnostic", cause);
		}
	}
	allows(grant, live) {
		return live() && !this.abort.signal.aborted && !!this.settings.grants?.includes(grant);
	}
	/** Drops rule commands that this installation has no grant for. A rule has the grants of the plugin that added it. */
	granted(rule) {
		const grantOf = {
			begin: "input-control",
			seal: "input-control",
			cancel: "cancel-input",
			interrupt: "interrupt-turns"
		};
		return {
			...rule,
			reduce: (state, event, context) => {
				const step = rule.reduce(state, event, context);
				if (!step.commands?.length) return step;
				return {
					...step,
					commands: step.commands.filter((command) => this.allows(grantOf[command.type], () => true))
				};
			}
		};
	}
	/** The commands on one attempt. Each command checks the grant and `live` when it runs, not when it is created. */
	control(attempt, live) {
		const allows = (grant) => this.allows(grant, live);
		return {
			id: attempt.id,
			sessionId: attempt.sessionId,
			end: () => allows("input-control") ? {
				status: "accepted",
				done: attempt.end()
			} : { status: "denied" },
			cancel: (reason) => allows("cancel-input") ? this.actions.cancelInput(attempt.id, reason) : "denied"
		};
	}
	/** The input scope receives commands only with the `input-control` grant. */
	outputInstallation() {
		return {
			name: this.plugin.name,
			signal: this.abort.signal,
			installers: this.outputInstallers,
			outputs: this.outputs,
			controls: (live) => this.controls(live),
			report: (stage, error, turn) => this.report(stage, error, void 0, turn)
		};
	}
	inputInstallation(attempt) {
		return {
			name: this.plugin.name,
			signal: this.abort.signal,
			installers: this.installers,
			inputs: this.inputs,
			control: (live) => this.settings.grants?.includes("input-control") ? this.control(attempt, live) : void 0,
			report: (stage, error, inputId) => this.report(stage, error, inputId)
		};
	}
	controls(live) {
		const allows = (grant) => this.allows(grant, live);
		return {
			activeInput: () => {
				const attempt = this.actions.activeInput();
				return attempt && allows("input-control") ? this.control(attempt, live) : void 0;
			},
			beginInput: (settings) => allows("input-control") ? {
				status: "started",
				input: this.control(this.actions.beginInput(settings), live)
			} : { status: "denied" },
			cancelInput: (id, reason) => allows("cancel-input") ? this.actions.cancelInput(id, reason) : "denied",
			interrupt: (turns, cause) => allows("interrupt-turns") ? {
				status: "started",
				interruption: this.actions.interrupt({
					turns,
					cause
				})
			} : { status: "denied" }
		};
	}
	setup() {
		const { policy } = this.actions;
		const scope = {
			signal: this.abort.signal,
			input: { observe: (settings, run) => this.observe("input", settings, run) },
			output: {
				observe: (settings, run) => this.observe("output", settings, run),
				connect: (node) => this.connect(node)
			},
			onInput: (install) => void this.installers.push(install),
			onOutput: (install) => void this.outputInstallers.push(install),
			emit: (eventa, body) => {
				if (!this.abort.signal.aborted) policy.events.emit(eventa, body);
			},
			on: (eventa, listener) => {
				if (this.abort.signal.aborted) return;
				const stop = policy.events.on(eventa, (event) => {
					try {
						listener(event.body);
					} catch (cause) {
						this.report("setup", errorFromCause(cause, "Voice event listener failed"));
					}
				});
				this.abort.signal.addEventListener("abort", stop, { once: true });
			},
			rule: (rule) => {
				if (this.abort.signal.aborted) return;
				const remove = policy.addRule(this.granted(rule));
				this.abort.signal.addEventListener("abort", remove, { once: true });
			},
			revisions: (inputId) => policy.revisions(inputId),
			conversationContext: (sessionId) => this.actions.conversationContext(sessionId),
			onDispose: (cleanup) => this.cleanups.push(cleanup),
			cancel: () => void this.dispose(),
			fail: (error) => {
				this.report("setup", error);
				this.dispose();
			}
		};
		try {
			const cleanup = this.plugin.setup(scope);
			if (cleanup !== void 0 && typeof cleanup !== "function") throw new Error("Plugin setup must be synchronous");
			if (cleanup) this.cleanups.push(cleanup);
		} catch (cause) {
			scope.fail(errorFromCause(cause, "Plugin setup failed"));
		}
	}
	/** Observes one side of the audio for the life of the plugin. A replaced device closes the old generation and observes the new one. */
	observe(side, settings, run) {
		const completion = Promise.withResolvers();
		const scope = createScope(settings.signal ? AbortSignal.any([this.abort.signal, settings.signal]) : this.abort.signal);
		let generation;
		const detect = async (window, signal) => {
			const outcome = await runTask((self) => run({
				window,
				signal: self.signal,
				controls: this.controls(() => !self.settled),
				publish: (value) => {
					if (self.settled || this.abort.signal.aborted) return {
						status: "rejected",
						reason: "closed"
					};
					this.settings.onAudioEvidence?.({
						plugin: this.plugin.name,
						range: window.range,
						value
					});
					return { status: "applied" };
				},
				cancel: (reason) => self.cancel(reason),
				fail: (error) => self.fail(error)
			}), { signal }).done;
			if (outcome.status === "failed") throw outcome.error;
		};
		const start = () => {
			generation?.close("Audio device replaced");
			const audio = side === "input" ? this.actions.audio() : this.actions.playback()?.output;
			if (!audio || scope.signal.aborted) return;
			const current = scope.child();
			generation = current;
			observe(audio, {
				...settings,
				signal: current.signal
			}, detect, () => {}).done.then((outcome) => {
				if (current.signal.aborted) return;
				if (outcome.status === "failed") this.report("audio", outcome.error);
				if (outcome.status !== "cancelled") completion.resolve(outcome);
				scope.close();
			});
		};
		const binding = { restart: start };
		scope.defer(() => {
			completion.resolve({
				status: "cancelled",
				reason: "Plugin observation closed"
			});
			this.host.unbind(side, binding);
		});
		if (!scope.signal.aborted) {
			this.host.bind(side, binding);
			start();
		}
		return {
			done: completion.promise,
			cancel: (reason) => void scope.close(reason)
		};
	}
	/** Connects a graph node to the current playback until the plugin is disposed. A replaced playback receives it again. */
	connect(node) {
		if (this.abort.signal.aborted) return;
		let disconnect;
		const release = () => {
			try {
				disconnect?.();
			} catch (cause) {
				this.report("output", errorFromCause(cause, "Playback disconnection failed"));
			}
			disconnect = void 0;
		};
		const binding = { restart: () => {
			release();
			try {
				disconnect = this.actions.playback()?.connect?.(node);
			} catch (cause) {
				this.report("output", errorFromCause(cause, "Playback connection failed"));
			}
		} };
		this.host.bind("output", binding);
		binding.restart();
		this.cleanups.push(() => {
			this.host.unbind("output", binding);
			release();
		});
	}
	dispose() {
		if (this.disposing) return this.disposing;
		this.abort.abort();
		this.host.remove(this);
		this.disposing = (async () => {
			await Promise.all([...[...this.inputs].map((input) => input.dispose("Plugin disposed")), ...[...this.outputs].map((output) => output.dispose("Plugin disposed"))]);
			const errors = [];
			for (const cleanup of this.cleanups.reverse()) try {
				await cleanup();
			} catch (cause) {
				errors.push(errorFromCause(cause, "Plugin cleanup failed"));
			}
			return errors.length ? {
				status: "failed",
				errors
			} : { status: "disposed" };
		})();
		return this.disposing;
	}
};
/** Owns trusted installations, their future input and output registrations, and their device bindings. */
var VoicePlugins = class {
	actions;
	installations = /* @__PURE__ */ new Map();
	bindings = {
		input: /* @__PURE__ */ new Set(),
		output: /* @__PURE__ */ new Set()
	};
	constructor(actions) {
		this.actions = actions;
	}
	/** A new microphone moves every input observation to it, including pending source acquisition. */
	replaceAudio() {
		this.restart("input");
	}
	/** A new playback moves every output observation and graph connection to it. */
	replacePlayback() {
		this.restart("output");
	}
	bind(side, binding) {
		this.bindings[side].add(binding);
	}
	unbind(side, binding) {
		this.bindings[side].delete(binding);
	}
	restart(side) {
		for (const binding of [...this.bindings[side]]) binding.restart();
	}
	use(plugin, settings = {}) {
		if (this.installations.has(plugin.name)) throw new Error(`Plugin already installed: ${plugin.name}`);
		const installation = new PluginInstallation(this, this.actions, plugin, settings);
		this.installations.set(plugin.name, installation);
		installation.setup();
		return installation;
	}
	/** Installations take part in the inputs that start after them. Their install order is the finalization order. */
	input(attempt, input) {
		return new InputPlugins(input, [...this.installations.values()].map((installation) => installation.inputInstallation(attempt)));
	}
	/** Installations take part in the responses that open after them, in install order. */
	output(response) {
		installOutputPlugins(response, [...this.installations.values()].map((installation) => installation.outputInstallation()));
	}
	remove(installation) {
		this.installations.delete(installation.plugin.name);
	}
	async close() {
		await Promise.all([...this.installations.values()].map((installation) => installation.dispose()));
	}
};
//#endregion
//#region src/voice/policy/events.ts
const inputBegunEvent = defineEventa("proj-airi:voice:input:begun");
const inputCapturingEvent = defineEventa("proj-airi:voice:input:capturing");
/** Raw provider text. The engine counts a `transcriptText` revision only when the text changes. */
const inputTranscriptEvent = defineEventa("proj-airi:voice:input:transcript");
const inputFinalizingEvent = defineEventa("proj-airi:voice:input:finalizing");
const inputSettledEvent = defineEventa("proj-airi:voice:input:settled");
/** One VAD window. `accepted` and `wake` exist only when the detector evaluated them for this window. */
const speechActivitySignal = defineEventa("proj-airi:voice:signal:speech-activity");
/** One VAD window that the activity rule accepted for its input. Its revision changes when speech starts or stops. */
const inputActivitySignal = defineEventa("proj-airi:voice:signal:input-activity", { metadata: { revision: (body) => body.speech } });
/** The speaker paused after speech, with transcript text. `readAt` holds the revisions of that moment. */
const pausedSignal = defineEventa("proj-airi:voice:signal:paused");
/** A model judgement of a paused input. It is current only while `readAt` matches the input revisions. */
const endJudgedSignal = defineEventa("proj-airi:voice:signal:end-judged");
//#endregion
//#region src/voice/policy/engine.ts
/** Every voice event id starts with this prefix. The engine reads only these events from a shared context. */
const VOICE_EVENT_PREFIX = "proj-airi:voice:";
/**
* Narrows an event that a rule receives to one definition.
*
* @example
* if (isEvent(event, pausedSignal))
*   event.body.text // string
*/
function isEvent(event, eventa) {
	return event.id === eventa.id;
}
/** Builds one emission of a rule step. */
function emission(eventa, body) {
	return {
		eventa,
		body
	};
}
function inputIdOf(event) {
	const body = event.body;
	return typeof body?.inputId === "string" ? body.inputId : void 0;
}
/**
* Runs voice rules over the voice events of one eventa context.
*
* A transport does not promise event order, so the engine imposes it. Events wait in one queue in arrival order.
* An event that a rule emits, or that a command causes, joins the end of the queue. Every rule therefore sees every
* event in one order. Each event first updates input revisions, then reaches the rules in registration order.
*
* Commands for one input follow first-wins: after one `seal` or `cancel`, later ones for that input are dropped.
*/
var VoicePolicy = class {
	events;
	options;
	rules = [];
	inputs = /* @__PURE__ */ new Map();
	decided = /* @__PURE__ */ new Set();
	queue = createQueue({ handlers: [async ({ data }) => this.process(data)] });
	stop;
	context = {
		revisions: (inputId) => this.revisions(inputId),
		isCurrent: (inputId, readAt) => this.isCurrent(inputId, readAt)
	};
	constructor(events, options) {
		this.events = events;
		this.options = options;
		this.stop = events.on(matchBy((event) => event.id.startsWith(VOICE_EVENT_PREFIX)), (event) => this.queue.enqueue(event));
	}
	/** Adds a rule. The returned function removes it. */
	addRule(rule) {
		const entry = {
			rule,
			state: rule.initial()
		};
		this.rules.push(entry);
		return () => {
			const index = this.rules.indexOf(entry);
			if (index >= 0) this.rules.splice(index, 1);
		};
	}
	revisions(inputId) {
		const input = this.inputs.get(inputId);
		if (!input) return {};
		return {
			...input.counts,
			context: this.options.contextRevision?.(input.sessionId) ?? 0
		};
	}
	isCurrent(inputId, readAt) {
		if (!this.inputs.has(inputId)) return false;
		const current = this.revisions(inputId);
		return Object.entries(readAt ?? {}).every(([kind, count]) => (current[kind] ?? 0) === count);
	}
	close() {
		this.stop();
		this.rules.length = 0;
		this.queue.clear();
	}
	process(event) {
		this.count(event);
		for (const entry of this.rules) try {
			const step = entry.rule.reduce(entry.state, event, this.context);
			entry.state = step.state;
			for (const item of step.emit ?? []) this.events.emit(item.eventa, item.body);
			for (const command of step.commands ?? []) this.run(command);
		} catch (cause) {
			this.options.onError?.(errorFromCause(cause, `Voice rule ${entry.rule.name} failed`));
		}
		if (isEvent(event, inputSettledEvent)) {
			this.inputs.delete(event.body.inputId);
			this.decided.delete(event.body.inputId);
		}
	}
	/** Updates input revisions before rules see the event, so a rule reads revisions that include it. */
	count(event) {
		if (isEvent(event, inputBegunEvent)) {
			this.inputs.set(event.body.inputId, {
				sessionId: event.body.sessionId,
				counts: {},
				contents: /* @__PURE__ */ new Map()
			});
			return;
		}
		if (isEvent(event, inputTranscriptEvent)) {
			this.change(event.body.inputId, "transcriptText", event.body.text);
			return;
		}
		const revision = event.metadata?.revision;
		const inputId = inputIdOf(event);
		if (typeof revision === "function" && inputId) this.change(inputId, event.id, revision(event.body));
	}
	change(inputId, kind, content) {
		const input = this.inputs.get(inputId);
		if (!input || input.contents.has(kind) && Object.is(input.contents.get(kind), content)) return;
		input.contents.set(kind, content);
		input.counts[kind] = (input.counts[kind] ?? 0) + 1;
	}
	run(command) {
		if (command.type === "seal" || command.type === "cancel") {
			if (this.decided.has(command.inputId)) return;
			this.decided.add(command.inputId);
		}
		this.options.execute(command);
	}
};
//#endregion
//#region src/voice/turn.ts
/** Encodes both identity fields without delimiter collisions across sessions. */
function turnKey(turn) {
	return JSON.stringify([turn.sessionId, turn.turnId]);
}
//#endregion
//#region src/voice/controller.ts
/** Coordinates input admission and downstream completion without owning browser or provider APIs. */
var VoiceController = class {
	options;
	/**
	* Voice events: input lifecycle and plugin signals. Projections, such as UI state and traces, subscribe here.
	* Rules decide from the same events. A host can link this context to another process or a server.
	*/
	events = createContext();
	policy = new VoicePolicy(this.events, {
		execute: (command) => this.execute(command),
		contextRevision: (sessionId) => this.options.conversationContext?.(sessionId).revision ?? 0,
		onError: (error) => this.reportError("policy", error)
	});
	plugins = new VoicePlugins({
		activeInput: () => this.current,
		audio: () => this.audioInput,
		playback: () => this.currentPlayback,
		beginInput: (options) => this.beginInput(options),
		cancelInput: (id, reason) => this.cancelInput(id, reason),
		interrupt: (options) => this.interrupt(options),
		reportError: (stage, cause) => this.reportError(stage, cause),
		policy: this.policy,
		conversationContext: (sessionId) => this.options.conversationContext?.(sessionId) ?? {
			revision: 0,
			messages: []
		}
	});
	inputListeners = /* @__PURE__ */ new Set();
	current;
	attempts = /* @__PURE__ */ new Map();
	audioInput;
	currentPlayback;
	closing;
	responses = /* @__PURE__ */ new Map();
	/**
	* Turn keys stay here after their response closes, so a late producer cannot reopen finished speech.
	* The set holds one short key per turn and clears when the controller closes.
	*/
	usedTurns = /* @__PURE__ */ new Set();
	interruptions = /* @__PURE__ */ new Map();
	/** Every attempt receives the same narrow view of this controller. */
	inputOwner;
	constructor(options) {
		this.options = options;
		if (options.transcriptionTimeoutMs !== void 0 && (!Number.isFinite(options.transcriptionTimeoutMs) || options.transcriptionTimeoutMs < 0)) throw new Error("Transcription timeout must be finite and nonnegative");
		this.audioInput = options.audio;
		this.currentPlayback = options.playback;
		this.inputOwner = {
			options,
			transcriptionTimeoutMs: options.transcriptionTimeoutMs ?? 3e4,
			audio: () => this.audioInput,
			interrupt: (request) => this.interrupt(request),
			createPlugins: (attempt, input) => this.plugins.input(attempt, input),
			seal: (attempt) => this.sealInput(attempt),
			reportError: (stage, error) => this.reportError(stage, error)
		};
	}
	get audio() {
		return this.audioInput;
	}
	/** Diagnostics cannot take ownership of a domain operation's completion. */
	reportError(stage, cause) {
		const error = errorFromCause(cause, "Voice operation failed");
		try {
			if (this.options.onError) this.options.onError({
				stage,
				error
			});
			else console.error(`[VoiceController] ${stage}`, error);
		} catch (diagnosticError) {
			console.error("[VoiceController] Diagnostic handler failed", diagnosticError);
		}
	}
	get activeInput() {
		return this.current;
	}
	get playback() {
		return this.currentPlayback;
	}
	use(plugin, settings) {
		if (this.closing) throw new Error("Voice controller is closed");
		return this.plugins.use(plugin, settings);
	}
	/** Observers see pending input immediately, including attempts opened by signal plugins. */
	onInput(listener) {
		if (this.closing) throw new Error("Voice controller is closed");
		this.inputListeners.add(listener);
		return () => this.inputListeners.delete(listener);
	}
	beginInput(options) {
		if (this.closing) throw new Error("Voice controller is closed");
		this.current?.cancel("Replaced by a new input");
		const attempt = new SpeechInputAttempt(this.inputOwner, options);
		this.current = attempt;
		this.attempts.set(attempt.id, attempt);
		for (const listener of this.inputListeners) try {
			listener(attempt);
		} catch (error) {
			this.reportError("input-observer", error);
		}
		attempt.done.then(() => this.attempts.delete(attempt.id));
		this.publishLifecycle(attempt, options);
		attempt.start();
		return attempt;
	}
	/** Triggering workflow: attempt state and transcript → lifecycle events → rules and projections. */
	publishLifecycle(attempt, options) {
		const inputId = attempt.id;
		this.events.emit(inputBegunEvent, {
			inputId,
			sessionId: attempt.sessionId,
			start: options.start,
			...options.cause ? { cause: options.cause } : {}
		});
		let stopTranscript;
		let text = "";
		const stopState = attempt.subscribe((state) => {
			if (state.phase === "capturing" && !stopTranscript) {
				this.events.emit(inputCapturingEvent, {
					inputId,
					from: state.from
				});
				stopTranscript = attempt.input?.subscribe((document) => {
					if (document.raw.text === text) return;
					text = document.raw.text;
					this.events.emit(inputTranscriptEvent, {
						inputId,
						text
					});
				});
			}
			if (state.phase === "finalizing") this.events.emit(inputFinalizingEvent, { inputId });
			if (state.phase === "settled") {
				stopTranscript?.();
				stopState();
				this.events.emit(inputSettledEvent, {
					inputId,
					outcome: state.outcome
				});
			}
		});
	}
	/** Runs a rule command. A command for an input that already settled does nothing. */
	execute(command) {
		switch (command.type) {
			case "begin":
				this.beginInput(command.input);
				return;
			case "seal":
				this.attempts.get(command.inputId)?.end();
				return;
			case "cancel":
				this.attempts.get(command.inputId)?.cancel(command.reason);
				return;
			case "interrupt": this.interrupt({
				turns: command.turns,
				cause: command.cause
			});
		}
	}
	cancelInput(inputId, reason) {
		const attempt = this.attempts.get(inputId);
		if (!attempt) return "closed";
		attempt.cancel(reason);
		return "cancelled";
	}
	updateSpeakerEvidence(inputId, evidence) {
		const attempt = this.attempts.get(inputId);
		if (!attempt?.input || attempt.input.closed) return {
			status: "rejected",
			reason: "closed"
		};
		if (!attempt.acceptsEvidence(evidence.range)) return {
			status: "rejected",
			reason: "stale"
		};
		return attempt.input.updateSpeakers(evidence.value);
	}
	correctInput(inputId, edits) {
		const input = this.attempts.get(inputId)?.input;
		if (!input || input.closed) return {
			status: "rejected",
			reason: "closed"
		};
		return input.patch("user", {
			edits,
			evidenceIds: []
		}, true);
	}
	openResponse(turn) {
		if (this.closing) throw new Error("Voice controller is closed");
		const key = turnKey(turn);
		const existing = this.responses.get(key);
		if (existing) return existing;
		if (this.usedTurns.has(key)) throw new Error("Response turn identity is already used");
		if (!this.options.speech) throw new Error("Speech output is not configured");
		const response = new VoiceResponse(turn, this.options.speech(turn), () => this.responses.delete(key));
		this.usedTurns.add(key);
		this.responses.set(key, response);
		this.plugins.output(response);
		return response;
	}
	interrupt(options) {
		const id = nanoid$1();
		const fadeMs = this.options.fadeMs ?? 100;
		const pending = [...new Map(options.turns.map((turn) => [turnKey(turn), Object.freeze({ ...turn })])).entries()].map(([key, turn]) => {
			const response = this.responses.get(key);
			let record = this.interruptions.get(key);
			if (!record && response && !response.closed) {
				record = {
					eventId: nanoid$1(),
					turn,
					cause: options.cause,
					silence: response.interrupt(options.cause, fadeMs)
				};
				this.interruptions.set(key, record);
			}
			const silence = record?.silence ?? response?.interrupt(options.cause, fadeMs);
			if (silence) {
				const result = silence.then((playback) => ({
					turn,
					status: playback.status,
					playback,
					...playback.status === "failed" ? { error: playback.error } : {}
				}));
				return {
					record,
					result,
					known: true
				};
			}
			if (this.usedTurns.has(key)) return {
				record,
				result: Promise.resolve({
					turn,
					status: "silent"
				}),
				known: true
			};
			return {
				record,
				result: Promise.resolve({
					turn,
					status: "failed",
					error: /* @__PURE__ */ new Error("Unknown response turn")
				}),
				known: false
			};
		});
		const silenced = Promise.all(pending.map((target) => target.result));
		const notifications = pending.flatMap((target) => target.record ? [this.notifyInterruption(target.record)] : []);
		return {
			id,
			silenced,
			done: Promise.all(notifications).then((results) => {
				return {
					status: pending.some((target) => !target.known) || results.some((item) => item.status === "failed") ? "failed" : "recorded",
					notifications: results
				};
			})
		};
	}
	/** Triggering workflow: {@link interrupt} → per-turn record → recordInterruption persistence acknowledgment. */
	notifyInterruption(record) {
		if (record.notification) return record.notification;
		const pending = (async () => {
			const playback = await record.silence;
			try {
				if (!this.options.recordInterruption) return {
					turn: record.turn,
					eventId: record.eventId,
					status: "failed"
				};
				const receipt = await this.options.recordInterruption({
					eventId: record.eventId,
					turn: record.turn,
					cause: record.cause,
					playback
				});
				return {
					turn: record.turn,
					eventId: record.eventId,
					status: receipt.status
				};
			} catch (cause) {
				this.reportError("interruption", cause);
				return {
					turn: record.turn,
					eventId: record.eventId,
					status: "failed"
				};
			}
		})();
		record.notification = pending;
		pending.then((result) => {
			if (result.status === "failed" && record.notification === pending) record.notification = void 0;
			else if (result.status !== "failed" && record.notification === pending) this.interruptions.delete(turnKey(record.turn));
		});
		return pending;
	}
	/**
	* Switches future inputs and plugin observations to another shared input, for example after a device change.
	* Active attempts cancel, because their frame coordinates belong to the old source. Responses continue.
	*/
	replaceAudio(audio) {
		if (this.closing) throw new Error("Voice controller is closed");
		if (audio === this.audioInput) return;
		for (const attempt of this.attempts.values()) attempt.cancel("Audio input replaced");
		this.audioInput = audio;
		this.plugins.replaceAudio();
	}
	/**
	* Switches plugin output observations and graph connections to another playback, for example after the stage remounts.
	* Open responses keep the playback that they started with.
	*/
	replacePlayback(playback) {
		if (this.closing) throw new Error("Voice controller is closed");
		if (playback === this.currentPlayback) return;
		this.currentPlayback = playback;
		this.plugins.replacePlayback();
	}
	sealInput(attempt) {
		if (this.current === attempt) this.current = void 0;
	}
	close() {
		if (this.closing) return this.closing;
		for (const attempt of this.attempts.values()) attempt.cancel("Voice controller closed");
		this.inputListeners.clear();
		for (const response of this.responses.values()) response.cancel("Voice controller closed");
		const responsesClosed = [...this.responses.values()].map((response) => response.finish());
		this.closing = Promise.all([this.plugins.close(), ...responsesClosed]).then(() => {}).finally(() => {
			this.policy.close();
			this.responses.clear();
			this.interruptions.clear();
			this.usedTurns.clear();
		});
		return this.closing;
	}
};
//#endregion
//#region src/voice/policy/rules.ts
/** The VAD score that begins speech when the options set no `threshold`. A live input keeps speech at 30 percent of it. */
const DEFAULT_SPEECH_THRESHOLD = .6;
/**
* Turns VAD windows into input commands.
*
* - Speech above `threshold`, or a wake word for another session, begins an input when the echo gate accepted it.
* - For its own input, a window counts only when it is inside the input and continues the last counted window.
*   Each counted window becomes an `input-activity` signal. The pause and speaker rules read that signal.
* - Silence of `silenceMs` seals the input, or cancels it when it has less than `minSpeechMs` of speech.
* - A manual input owns its interval. The rule ignores windows while another input is active.
*/
function createSpeechActivityRule(options) {
	return {
		name: "speech-activity",
		initial: () => ({}),
		reduce(state, event) {
			if (isEvent(event, inputBegunEvent)) {
				const { inputId, sessionId, start, cause } = event.body;
				const from = start.kind === "speech-onset" ? start.at : void 0;
				const active = {
					inputId,
					sessionId,
					from
				};
				const beginning = state.beginning;
				if (!beginning || cause !== beginning.cause) return { state: { active } };
				const owned = {
					inputId,
					sessionId,
					speechMs: 0,
					silenceMs: 0,
					activityEnd: from?.frame,
					waiting: []
				};
				if (!from) return { state: {
					active,
					owned
				} };
				const counted = count(owned, from, [beginning.firstWindow]);
				return {
					state: {
						active,
						owned: counted.owned
					},
					emit: counted.emit,
					commands: counted.commands
				};
			}
			if (isEvent(event, inputCapturingEvent)) {
				if (state.active?.inputId !== event.body.inputId) return { state };
				const active = {
					...state.active,
					from: event.body.from
				};
				if (!state.owned || state.owned.activityEnd !== void 0) return { state: {
					...state,
					active
				} };
				const counted = count({
					...state.owned,
					activityEnd: event.body.from.frame,
					waiting: []
				}, event.body.from, state.owned.waiting);
				return {
					state: {
						...state,
						active,
						owned: counted.owned
					},
					emit: counted.emit,
					commands: counted.commands
				};
			}
			if (isEvent(event, inputFinalizingEvent) || isEvent(event, inputSettledEvent)) {
				if (state.active?.inputId !== event.body.inputId && state.owned?.inputId !== event.body.inputId) return { state };
				return { state: {
					...state,
					active: state.active?.inputId === event.body.inputId ? void 0 : state.active,
					owned: state.owned?.inputId === event.body.inputId ? void 0 : state.owned
				} };
			}
			if (!isEvent(event, speechActivitySignal)) return { state };
			const { range, durationMs, score, discontinuity, accepted, wake } = event.body;
			const owned = discontinuity ? void 0 : state.owned;
			const active = state.active;
			if (active && active.inputId !== owned?.inputId) return { state: {
				...state,
				owned
			} };
			if (options.enabled && !options.enabled()) {
				const commands = owned ? [{
					type: "cancel",
					inputId: owned.inputId,
					reason: "Automatic speech input is paused"
				}] : [];
				return {
					state: {
						...state,
						owned: void 0
					},
					commands
				};
			}
			const threshold = options.threshold ?? .6;
			const speech = score >= (owned ? threshold * .3 : threshold);
			if (wake && wake.sessionId !== owned?.sessionId || !owned && speech) {
				if (!accepted) return { state: {
					...state,
					owned
				} };
				const target = wake ?? options.target();
				if (!target) return { state: {
					...state,
					owned
				} };
				const cause = wake ? "wake-word" : "speech";
				const input = {
					sessionId: target.sessionId,
					interruptTurns: target.interruptTurns,
					cause,
					start: wake ? { kind: "after-silence" } : {
						kind: "speech-onset",
						at: {
							sourceId: range.sourceId,
							frame: range.startFrame
						},
						preRollMs: options.preRollMs ?? 360
					}
				};
				return {
					state: {
						...state,
						owned: void 0,
						beginning: {
							cause,
							firstWindow: {
								speech,
								durationMs,
								range
							}
						}
					},
					commands: [{
						type: "begin",
						input
					}]
				};
			}
			if (!owned || !active) return { state: {
				...state,
				owned
			} };
			const window = {
				range,
				durationMs,
				speech
			};
			if (!active.from) return { state: {
				...state,
				owned: {
					...owned,
					waiting: [...owned.waiting, window]
				}
			} };
			const counted = count(owned, active.from, [window]);
			return {
				state: {
					...state,
					owned: counted.owned
				},
				emit: counted.emit,
				commands: counted.commands
			};
		}
	};
	/** Counts windows in order. Silence of the limit seals or cancels the input, and later windows are dropped. */
	function count(start, from, windows) {
		const emit = [];
		let owned = start;
		for (const { range, durationMs, speech } of windows) {
			const activityEnd = owned.activityEnd ?? from.frame;
			if (!(range.sourceId === from.sourceId && range.startFrame >= from.frame) || range.endFrame <= activityEnd || range.startFrame > activityEnd) continue;
			emit.push(emission(inputActivitySignal, {
				inputId: owned.inputId,
				range,
				speech,
				durationMs
			}));
			owned = {
				...owned,
				speechMs: owned.speechMs + (speech ? durationMs : 0),
				silenceMs: speech ? 0 : owned.silenceMs + durationMs,
				activityEnd: range.endFrame
			};
			const limit = typeof options.silenceMs === "function" ? options.silenceMs() : options.silenceMs ?? 1200;
			if (owned.silenceMs < limit) continue;
			return {
				owned: void 0,
				emit,
				commands: [owned.speechMs < (options.minSpeechMs ?? 300) ? {
					type: "cancel",
					inputId: owned.inputId,
					reason: "Speech segment was too short"
				} : {
					type: "seal",
					inputId: owned.inputId,
					at: {
						sourceId: range.sourceId,
						frame: range.endFrame
					}
				}]
			};
		}
		return {
			owned,
			emit,
			commands: []
		};
	}
}
/**
* Emits `paused` when the speaker of an input stops after speech.
*
* Silence before the first speech is the wait after a wake word, not a pause. Each pause reports one state of the
* transcript once. New text during the same pause reports again, because a judgement of the old text is stale.
*/
function createPauseRule(options = {}) {
	const pauseMs = options.pauseMs ?? 1200;
	return {
		name: "pause",
		initial: () => ({ inputs: /* @__PURE__ */ new Map() }),
		reduce(state, event, context) {
			const inputs = new Map(state.inputs);
			if (isEvent(event, inputBegunEvent)) {
				inputs.set(event.body.inputId, {
					sessionId: event.body.sessionId,
					text: "",
					spoke: false,
					pausedMs: 0
				});
				return { state: { inputs } };
			}
			if (isEvent(event, inputSettledEvent) || isEvent(event, inputFinalizingEvent)) {
				inputs.delete(event.body.inputId);
				return { state: { inputs } };
			}
			if (isEvent(event, inputTranscriptEvent)) {
				const input = inputs.get(event.body.inputId);
				if (input) inputs.set(event.body.inputId, {
					...input,
					text: event.body.text
				});
				return { state: { inputs } };
			}
			if (!isEvent(event, inputActivitySignal)) return { state };
			const { inputId, speech, durationMs } = event.body;
			const input = inputs.get(inputId);
			if (!input) return { state };
			if (speech) {
				inputs.set(inputId, {
					...input,
					spoke: true,
					pausedMs: 0
				});
				return { state: { inputs } };
			}
			const pausedMs = input.pausedMs + durationMs;
			const text = input.text.trim();
			const revisions = context.revisions(inputId);
			const key = JSON.stringify([text, revisions[inputActivitySignal.id] ?? 0]);
			if (!input.spoke || pausedMs < pauseMs || !text || key === input.reported) {
				inputs.set(inputId, {
					...input,
					pausedMs
				});
				return { state: { inputs } };
			}
			inputs.set(inputId, {
				...input,
				pausedMs,
				reported: key
			});
			return {
				state: { inputs },
				emit: [emission(pausedSignal, {
					inputId,
					sessionId: input.sessionId,
					text,
					readAt: revisions
				})]
			};
		}
	};
}
/** Seals an input when a model judged it complete and nothing that the judgement read has changed since. */
function createEndJudgementRule() {
	return {
		name: "end-judgement",
		initial: () => ({ capturing: /* @__PURE__ */ new Set() }),
		reduce(state, event, context) {
			if (isEvent(event, inputCapturingEvent)) return { state: { capturing: new Set(state.capturing).add(event.body.inputId) } };
			if (isEvent(event, inputFinalizingEvent) || isEvent(event, inputSettledEvent)) {
				const capturing = new Set(state.capturing);
				capturing.delete(event.body.inputId);
				return { state: { capturing } };
			}
			if (!isEvent(event, endJudgedSignal)) return { state };
			const { inputId, result, readAt } = event.body;
			if (result !== "complete" || !state.capturing.has(inputId) || !context.isCurrent(inputId, readAt)) return { state };
			return {
				state,
				commands: [{
					type: "seal",
					inputId
				}]
			};
		}
	};
}
//#endregion
export { DEFAULT_SPEECH_THRESHOLD, MODEL_DECIDES_STEPS, SpeechInput, SpeechInputAttempt, SpeechStream, VoiceController, VoicePolicy, VoiceResponse, buildContextPromptMessage, categorizeResponse, chatContentToInputSegments, chatMessagesToTurns, conversationToChatMessages, createChatHooks, createChatOrchestratorRuntime, createContextRegistry, createEndJudgementRule, createPauseRule, createSpeechActivityRule, createStreamingCategorizer, decisionOptions, defaultSpeechPreprocessors, defaultTokenReaders, emission, endJudgedSignal, formatContextPromptText, formatTimePrefix, inputActivitySignal, inputBegunEvent, inputCapturingEvent, inputFinalizingEvent, inputSettledEvent, inputTranscriptEvent, isBackgroundRecipe, isContentArrayRelatedError, isEvent, isToolRelatedError, judgeDecision, matchKeywordRecipes, mathSpeech, mathSpeechPreprocessor, mergeLoadedSessionMessages, modelKey, moneySpeechPreprocessor, pausedSignal, renderConversationPreview, speakMath, speechActivitySignal, streamFrom, toMathJson, toSpeechText, tokenSpeechPreprocessor, turnKey, usableRecipes, useLlmmarkerParser };
