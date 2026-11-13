import { errorMessageFrom } from "@moeru/std";
import { nanoid } from "nanoid";
import { rawTool } from "@xsai/tool";
import { toJsonSchema } from "xsschema";
import { z } from "zod";
//#region src/agents/spark-notify/event-source.ts
function formatMetadataSource(source) {
	if (!source) return void 0;
	if ("extension" in source) return `${source.extension.id}:${source.id}`;
	return source.id;
}
function getEventSourceKey(event, fallback = "unknown") {
	return formatMetadataSource(event.metadata?.source) ?? event.source ?? fallback;
}
//#endregion
//#region src/agents/spark-notify/schema.ts
const JSON_SCHEMA_NULLABLE_SCALAR_TYPES = /* @__PURE__ */ new Set([
	"string",
	"number",
	"integer",
	"boolean",
	"null"
]);
function isJsonSchema(value) {
	return Boolean(value && !Array.isArray(value) && typeof value === "object");
}
/**
* Normalizes nullable scalar unions in generated JSON schema.
*
* Before:
* - `{ anyOf: [{ type: 'string' }, { type: 'null' }] }`
*
* After:
* - `{ type: ['string', 'null'] }`
*/
function normalizeNullableAnyOf(schema) {
	const next = { ...schema };
	if (next.properties) next.properties = Object.fromEntries(Object.entries(next.properties).map(([key, value]) => {
		if (!isJsonSchema(value)) return [key, value];
		return [key, normalizeNullableAnyOf(value)];
	}));
	if (Array.isArray(next.items)) next.items = next.items.map((item) => isJsonSchema(item) ? normalizeNullableAnyOf(item) : item);
	else if (isJsonSchema(next.items)) next.items = normalizeNullableAnyOf(next.items);
	if (next.anyOf) {
		next.anyOf = next.anyOf.map((value) => isJsonSchema(value) ? normalizeNullableAnyOf(value) : value);
		const normalizedEntries = next.anyOf.filter(isJsonSchema);
		const primitiveTypes = normalizedEntries.map((entry) => entry.type).filter((type) => typeof type === "string");
		const dedupedPrimitiveTypes = [...new Set(primitiveTypes)];
		if (primitiveTypes.length === normalizedEntries.length && dedupedPrimitiveTypes.length > 0 && dedupedPrimitiveTypes.every((type) => JSON_SCHEMA_NULLABLE_SCALAR_TYPES.has(String(type)))) {
			delete next.anyOf;
			next.type = dedupedPrimitiveTypes;
		}
	}
	if (next.oneOf) next.oneOf = next.oneOf.map((value) => isJsonSchema(value) ? normalizeNullableAnyOf(value) : value);
	return next;
}
const sparkCommandGuidanceOptionSchema = z.object({
	label: z.string().describe("Short label for the option."),
	steps: z.array(z.string()).min(1).describe("Step-by-step actions the target should follow."),
	rationale: z.union([z.string(), z.null()]).describe("Why this option makes sense."),
	possibleOutcome: z.union([z.array(z.string()), z.null()]).describe("Expected outcomes if this option is followed."),
	risk: z.union([z.enum([
		"high",
		"medium",
		"low",
		"none"
	]), z.null()]).describe("Risk level of this option."),
	fallback: z.union([z.array(z.string()), z.null()]).describe("Fallback steps if the main plan fails."),
	triggers: z.union([z.array(z.string()), z.null()]).describe("Conditions that should trigger this option.")
}).strict();
const sparkCommandPersonaSchema = z.object({
	traits: z.string().describe("Trait name to adjust behavior. For example, \"bravery\", \"cautiousness\", \"friendliness\"."),
	strength: z.enum([
		"very-high",
		"high",
		"medium",
		"low",
		"very-low"
	])
}).strict();
const sparkNotifyCommandGuidanceSchema = z.object({
	type: z.enum([
		"proposal",
		"instruction",
		"memory-recall"
	]),
	persona: z.union([z.array(sparkCommandPersonaSchema), z.null()]).describe("Optional persona controls for the receiver."),
	options: z.array(sparkCommandGuidanceOptionSchema)
}).strict();
const sparkNotifyCommandItemSchema = z.object({
	destinations: z.array(z.string()).min(1).describe("List of sub-agent IDs to send the command to"),
	interrupt: z.union([z.enum([
		"force",
		"soft",
		"false"
	]), z.null()]).describe("Interrupt type: force, soft, or false (no interrupt)."),
	priority: z.union([z.enum([
		"critical",
		"high",
		"normal",
		"low"
	]), z.null()]).describe("Semantic priority of the command."),
	intent: z.union([z.enum([
		"plan",
		"proposal",
		"action",
		"pause",
		"resume",
		"reroute",
		"context"
	]), z.null()]).describe("Intent of the command."),
	ack: z.string().describe("Acknowledgment content used to be passed to sub-agents upon command receipt."),
	guidance: z.union([sparkNotifyCommandGuidanceSchema, z.null()]).describe("Guidance for the sub-agent on how to interpret and execute the command.")
}).strict();
const sparkNotifyCommandSchema = z.object({ commands: z.array(sparkNotifyCommandItemSchema).describe("List of commands to issue to sub-agents. Empty array can be used for zero commands.") }).strict();
//#endregion
//#region src/agents/spark-notify/tools.ts
/**
* Normalizes provider-facing notify command payloads into websocket draft commands.
*
* Use when:
* - LLM output has been validated against `sparkNotifyCommandSchema`
* - You need `spark:command`-compatible draft objects
*
* Expects:
* - Input shape from one `commands[]` entry
*
* Returns:
* - Runtime-ready command draft for downstream emitters
*/
function normalizeSparkNotifyCommand(command) {
	return {
		destinations: command.destinations,
		guidance: command.guidance ? {
			type: command.guidance.type,
			persona: command.guidance.persona?.reduce((acc, curr) => {
				acc[curr.traits] = curr.strength;
				return acc;
			}, {}) || void 0,
			options: command.guidance.options.map((option) => ({
				...option,
				rationale: option.rationale ?? void 0,
				possibleOutcome: option.possibleOutcome?.length ? option.possibleOutcome : void 0,
				risk: option.risk ?? void 0,
				fallback: option.fallback?.length ? option.fallback : void 0,
				triggers: option.triggers?.length ? option.triggers : void 0
			}))
		} : void 0,
		contexts: [],
		priority: command.priority || "normal",
		intent: command.intent || "action",
		ack: command.ack || void 0,
		interrupt: command.interrupt === "false" || command.interrupt == null ? false : command.interrupt
	};
}
/**
* Creates built-in tools used by the Spark Notify agent.
*
* Use when:
* - Running the Spark Notify agent on any runtime (web, desktop, eval harness)
* - You need "no response" and "command draft" tool pathways
*
* Expects:
* - Callbacks for command collection and no-response signaling
*
* Returns:
* - Tool array consumable by `@xsai/stream-text`
*/
async function createSparkNotifyTools(options) {
	const allowNoResponse = options.allowNoResponse !== false;
	const allowSparkCommand = options.allowSparkCommand !== false;
	const tools = [];
	if (allowNoResponse) {
		const name = "builtIn_sparkNoResponse";
		tools.push(rawTool({
			name: "builtIn_sparkNoResponse",
			description: "Indicate that no response or action is needed for the current spark:notify event.",
			parameters: normalizeNullableAnyOf(await toJsonSchema(z.object({}).strict())),
			execute: async (_rawPayload, context) => {
				options.onEvent?.({
					type: "model-output-tool-call",
					payload: {
						toolName: name,
						toolCallId: context?.toolCallId
					}
				});
				options.onNoResponse();
				options.onEvent?.({
					type: "tool-execution",
					payload: {
						toolName: name,
						toolCallId: context?.toolCallId,
						responseMode: "no-response"
					}
				});
				return "AIRI System: Acknowledged, no response or action will be processed.";
			}
		}));
	}
	if (allowSparkCommand) {
		const name = "builtIn_sparkCommand";
		tools.push(rawTool({
			name,
			description: "Issue a spark:command to sub-agents. You can call this tool multiple times.",
			parameters: normalizeNullableAnyOf(await toJsonSchema(sparkNotifyCommandSchema)),
			execute: async (rawPayload, context) => {
				options.onEvent?.({
					type: "model-output-tool-call",
					payload: {
						toolName: name,
						toolCallId: context?.toolCallId,
						rawPayload
					}
				});
				try {
					const validated = sparkNotifyCommandSchema.parse(rawPayload);
					options.onCommands(validated.commands.map(normalizeSparkNotifyCommand));
					options.onEvent?.({
						type: "tool-execution",
						payload: {
							toolName: name,
							toolCallId: context?.toolCallId,
							commandCount: validated.commands.length
						}
					});
				} catch (error) {
					options.onEvent?.({
						type: "tool-execution",
						payload: {
							toolName: name,
							toolCallId: context?.toolCallId,
							ok: false,
							error: errorMessageFrom(error)
						}
					});
					return `AIRI System: Error - invalid spark_command parameters: ${errorMessageFrom(error)}`;
				}
				return "AIRI System: Acknowledged, command fired.";
			}
		}));
	}
	return { tools };
}
//#endregion
//#region src/agents/spark-notify/plugins/builtin-tools.ts
/**
* Adds the built-in no-response and Spark Command tools to each notify turn.
*/
function createSparkNotifyBuiltinToolsPlugin() {
	return {
		name: "spark-notify-builtins",
		async prepare(turn) {
			const commands = [];
			const events = [];
			let noResponse = false;
			const { tools } = await createSparkNotifyTools({
				onCommands: (drafts) => commands.push(...drafts),
				onEvent: (event) => events.push(event),
				onNoResponse: () => {
					noResponse = true;
				},
				allowNoResponse: turn.policy.allowNoResponse,
				allowSparkCommand: turn.policy.allowSparkCommand
			});
			return {
				tools,
				getResult: () => ({
					commands,
					noResponse
				}),
				getPendingEvents: () => events.splice(0)
			};
		}
	};
}
//#endregion
//#region src/agents/spark-notify/agent.ts
function renderSparkNotifyUserMessage(input, userSections) {
	const messageOverride = input.control?.messageOverride;
	const defaultUserMessage = JSON.stringify({
		notify: input.event.data,
		source: input.event.metadata?.source
	}, null, 2);
	return [
		messageOverride?.replaceUserMessage ?? defaultUserMessage,
		...messageOverride?.appendUserSections ?? [],
		input.runtimePrompt ?? "",
		...userSections
	].filter((section) => section.trim().length > 0).join("\n\n");
}
/** Builds the instruction block prepended to Spark Notify agent prompts. */
function getSparkNotifyHandlingAgentInstruction(moduleName) {
	return [
		"This is AIRI system, the life pod hosting your consciousness. You do not need to respond to every spark:notify event directly.",
		`Another module "${moduleName}" triggered a spark:notify event for you to inspect.`,
		"You can call the built-in tool \"builtIn_sparkCommand\" to issue spark:command to sub-agents.",
		"If you respond with text, write only the reaction that the character will say."
	].join("\n");
}
function resolveSparkNotifyRuntimePolicy(control) {
	if (control?.forceTextResponse) return {
		allowNoResponse: false,
		allowSparkCommand: false,
		supportsTools: false,
		waitForTools: false,
		ignoreTextOutput: false
	};
	if (control?.forceSparkCommandResponse) return {
		allowNoResponse: false,
		allowSparkCommand: true,
		supportsTools: true,
		waitForTools: true,
		toolChoice: {
			type: "function",
			function: { name: "builtIn_sparkCommand" }
		},
		ignoreTextOutput: true
	};
	if (control?.forceResponse) return {
		allowNoResponse: false,
		allowSparkCommand: true,
		supportsTools: true,
		waitForTools: true,
		ignoreTextOutput: false
	};
	return {
		allowNoResponse: true,
		allowSparkCommand: true,
		supportsTools: true,
		waitForTools: true,
		ignoreTextOutput: false
	};
}
function resultFrom(sessions) {
	const commands = [];
	let noResponse = false;
	for (const session of sessions) {
		const result = session.getResult?.();
		if (result?.commands) commands.push(...result.commands);
		noResponse ||= result?.noResponse === true;
	}
	return {
		commands,
		noResponse
	};
}
function expandCommand(event, command, createId) {
	const destinations = command.destinations ?? [];
	if (destinations.length === 0) return void 0;
	return {
		id: createId(),
		eventId: createId(),
		parentEventId: event.data.id,
		commandId: createId(),
		interrupt: (command.interrupt === true ? "force" : command.interrupt) ?? false,
		priority: command.priority ?? "normal",
		intent: command.intent ?? "action",
		ack: command.ack,
		guidance: command.guidance,
		contexts: command.contexts,
		destinations
	};
}
/**
* Creates a Spark Notify agent from one host runner and composable plugins.
*
* The host resolves model selection and schedules work. This agent only
* prepares and runs one notify turn.
*/
function createSparkNotifyAgent(options) {
	const createId = options.createId ?? nanoid;
	const plugins = [createSparkNotifyBuiltinToolsPlugin(), ...options.plugins ?? []];
	async function handle(request) {
		const policy = resolveSparkNotifyRuntimePolicy(request.control);
		const sessions = (await Promise.all(plugins.map((plugin) => {
			return plugin.prepare({
				event: request.event,
				selectedChat: request.selectedChat,
				systemPrompt: request.systemPrompt,
				control: request.control,
				policy
			});
		}))).filter((session) => session !== void 0);
		const systemInstructions = sessions.flatMap((session) => session.systemInstructions ?? []);
		const userSections = sessions.flatMap((session) => session.userSections ?? []);
		const tools = policy.supportsTools ? sessions.flatMap((session) => session.tools ?? []) : [];
		const turns = [{
			id: "spark-system",
			type: "system",
			authority: "system",
			content: [{
				type: "text",
				text: [
					request.systemPrompt,
					getSparkNotifyHandlingAgentInstruction(getEventSourceKey(request.event)),
					...request.control?.messageOverride?.appendSystemInstructions ?? [],
					...systemInstructions
				].filter(Boolean).join("\n\n")
			}]
		}, {
			id: request.event.data.eventId,
			type: "user",
			content: [{
				type: "text",
				text: renderSparkNotifyUserMessage(request, userSections)
			}]
		}];
		async function emit(event) {
			for (const session of sessions) await session.onEvent?.(event);
		}
		await emit({
			type: "messages-rendered",
			payload: {
				eventId: request.event.data.eventId,
				source: request.event.source,
				messageCount: turns.length
			}
		});
		await emit({
			type: "tools-prepared",
			payload: {
				eventId: request.event.data.eventId,
				toolNames: tools.flatMap((tool) => tool.function?.name ? [tool.function.name] : []),
				toolCount: tools.length,
				supportsTools: policy.supportsTools
			}
		});
		await emit({
			type: "model-input",
			payload: {
				eventId: request.event.data.eventId,
				model: request.selectedChat.model,
				provider: request.selectedChat.providerId,
				supportsTools: policy.supportsTools,
				waitForTools: policy.waitForTools
			}
		});
		let reaction = "";
		await options.runner.run({
			selectedChat: request.selectedChat,
			conversation: { turns },
			tools,
			policy,
			onStreamEvent: async (streamEvent) => {
				if (streamEvent.type === "text-delta") {
					const { noResponse } = resultFrom(sessions);
					if (policy.ignoreTextOutput || noResponse) return;
					reaction += streamEvent.text;
					await emit({
						type: "model-output-text",
						payload: {
							eventId: request.event.data.id,
							text: streamEvent.text,
							accumulatedText: reaction
						}
					});
					return;
				}
				if (streamEvent.type === "tool-call") {
					await emit({
						type: "model-output-tool-call",
						payload: {
							eventId: request.event.data.eventId,
							toolCallId: streamEvent.toolCallId,
							toolName: streamEvent.toolName,
							input: streamEvent.args
						}
					});
					return;
				}
				if (streamEvent.type === "tool-result" || streamEvent.type === "tool-error") {
					await emit({
						type: "tool-execution",
						payload: {
							eventId: request.event.data.eventId,
							kind: streamEvent.type,
							toolCallId: streamEvent.toolCallId,
							output: streamEvent.result
						}
					});
					return;
				}
				if (streamEvent.type === "error") throw streamEvent.error ?? /* @__PURE__ */ new Error("Spark notify stream error");
			}
		});
		for (const session of sessions) for (const event of session.getPendingEvents?.() ?? []) await emit(event);
		const { commands, noResponse } = resultFrom(sessions);
		const finalReaction = noResponse ? "" : reaction.trim();
		const expandedCommands = commands.map((command) => expandCommand(request.event, command, createId)).filter((command) => command !== void 0);
		await emit({
			type: "result",
			payload: {
				eventId: request.event.data.eventId,
				reaction: finalReaction,
				commandCount: expandedCommands.length,
				noResponse
			}
		});
		return { commands: expandedCommands };
	}
	return { handle };
}
//#endregion
//#region src/agents/spark-notify/plugins/observer.ts
/** Adds an observer for diagnostics, telemetry adapters, or test recorders. */
function createSparkNotifyObserverPlugin(observer) {
	return {
		name: "spark-notify-observer",
		prepare: () => ({ onEvent: observer })
	};
}
//#endregion
//#region src/agents/spark-notify/plugins/reaction.ts
/** Sends model reaction text to a host-owned presentation sink. */
function createSparkNotifyReactionPlugin(sink) {
	return {
		name: "spark-notify-reaction",
		prepare(turn) {
			return { onEvent(event) {
				if (event.type === "model-output-text") {
					const text = typeof event.payload.text === "string" ? event.payload.text : "";
					if (text) sink.onDelta(turn.event.data.id, text);
					return;
				}
				if (event.type === "result") {
					const reaction = typeof event.payload.reaction === "string" ? event.payload.reaction : "";
					sink.onEnd(turn.event.data.id, reaction);
				}
			} };
		}
	};
}
//#endregion
export { createSparkNotifyAgent, createSparkNotifyBuiltinToolsPlugin, createSparkNotifyObserverPlugin, createSparkNotifyReactionPlugin, createSparkNotifyTools, getSparkNotifyHandlingAgentInstruction, sparkNotifyCommandItemSchema, sparkNotifyCommandSchema };
