import { nanoid } from "nanoid";
import { ContextUpdateStrategy } from "@proj-airi/server-sdk";
import { z } from "zod/v4";
import { rawTool } from "@xsai/tool";
import { toJsonSchema } from "xsschema";
//#region src/agents/spark-command/schema.ts
/** Allowed intent values for a `spark:command` event. */
const sparkCommandIntentSchema = z.enum([
	"plan",
	"proposal",
	"action",
	"pause",
	"resume",
	"reroute",
	"context"
]);
/** Allowed priority values for a `spark:command` event. */
const sparkCommandPrioritySchema = z.enum([
	"critical",
	"high",
	"normal",
	"low"
]);
/** Allowed interrupt values before the parent tool schema adds its nullable provider form. */
const sparkCommandInterruptSchema = z.union([
	z.literal("force"),
	z.literal("soft"),
	z.literal(false)
]);
/**
* Provider-facing schema for one structured guidance option.
*
* Strict providers require every property in this object. Use `null` for an omitted optional
* value. The command tool removes those null and empty values before it emits `spark:command`.
*/
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
/**
* Provider-facing persona entry used to avoid dynamic object keys in generated JSON Schema.
*
* The command tool converts these entries into the runtime persona map keyed by `traits`.
*/
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
/**
* Provider-facing guidance schema for a Spark Command.
*
* `persona` uses an array of entries instead of a record because some providers reject
* `propertyNames`. The command tool converts it back to the runtime record shape.
*/
const sparkCommandGuidanceSchema = z.object({
	type: z.enum([
		"proposal",
		"instruction",
		"memory-recall"
	]),
	persona: z.union([z.array(sparkCommandPersonaSchema), z.null()]).describe("Personas can be used to adjust the behavior of sub-agents. For example, when using as NPC in games, or player in Minecraft, the persona can help define the character's traits and decision-making style."),
	options: z.array(sparkCommandGuidanceOptionSchema).min(1).describe("Concrete execution options for the target.")
}).strict();
const sparkCommandMetadataEntrySchema = z.object({
	key: z.string().describe("Metadata key."),
	value: z.union([
		z.string(),
		z.number(),
		z.boolean(),
		z.null()
	]).describe("Metadata value.")
}).strict();
const sparkCommandContextSchema = z.object({
	lane: z.union([z.string(), z.null()]).describe("Logical context lane, for example \"game\" or \"memory\"."),
	ideas: z.union([z.array(z.string()), z.null()]).describe("Loose ideas to attach to the target context."),
	hints: z.union([z.array(z.string()), z.null()]).describe("Hints to attach to the target context."),
	strategy: z.enum(ContextUpdateStrategy).describe("How the target should merge this context update."),
	text: z.string().describe("Primary text of the context update."),
	destinations: z.union([
		z.array(z.string()),
		z.object({ all: z.literal(true) }).strict(),
		z.object({
			include: z.union([z.array(z.string()), z.null()]).describe("Included destinations."),
			exclude: z.union([z.array(z.string()), z.null()]).describe("Excluded destinations.")
		}).strict(),
		z.null()
	]).describe("Optional routing for the attached context update."),
	metadata: z.union([z.array(sparkCommandMetadataEntrySchema), z.null()]).describe("JSON-like metadata for the context update, expressed as key-value pairs for schema compatibility.")
}).strict();
/**
* Provider-facing parameter schema for `builtIn_emitSparkCommand`.
*
* Strict providers require every root property. Use `null` when an optional value is absent.
* The command tool converts null and empty values to runtime omissions or defaults before it
* emits `spark:command`.
*
* This schema does not equal the wire-event shape. Persona and metadata use arrays here so
* generated JSON Schema does not contain dynamic `propertyNames`. The tool converts them back
* to records before delivery. The input requires at least one destination. A transport adapter
* can drop that list from the event when its protocol broadcasts an event that omits the field.
*/
const sparkCommandToolSchema = z.object({
	destinations: z.array(z.string()).min(1).describe("One or more target module or agent IDs for this command."),
	interrupt: z.union([sparkCommandInterruptSchema, z.null()]).describe("Whether the command should preempt current work."),
	priority: z.union([sparkCommandPrioritySchema, z.null()]).describe("Priority of the command."),
	intent: z.union([sparkCommandIntentSchema, z.null()]).describe("Intent of the command."),
	ack: z.union([z.string(), z.null()]).describe("Short acknowledgement or instruction summary for the receiver."),
	parentEventId: z.union([z.string(), z.null()]).describe("Optional parent event ID when this command is a response to another event."),
	guidance: z.union([sparkCommandGuidanceSchema, z.null()]).describe("Structured guidance for how the target should interpret and execute the command."),
	contexts: z.union([z.array(sparkCommandContextSchema), z.null()]).describe("Optional context updates to attach to the command.")
}).strict();
/**
* Converts provider-safe metadata entries into the runtime metadata map.
*
* @example
* normalizeSparkCommandMetadata([{ key: 'urgent', value: true }])
* // => { urgent: true }
*/
function normalizeSparkCommandMetadata(metadata) {
	if (!metadata?.length) return void 0;
	return metadata.reduce((acc, entry) => {
		acc[entry.key] = entry.value;
		return acc;
	}, {});
}
/**
* Converts provider-safe persona entries into the runtime persona map.
*
* @example
* normalizeSparkCommandPersona([{ traits: 'bravery', strength: 'high' }])
* // => { bravery: 'high' }
*/
function normalizeSparkCommandPersona(persona) {
	if (!persona?.length) return void 0;
	return persona.reduce((acc, entry) => {
		acc[entry.traits] = entry.strength;
		return acc;
	}, {});
}
/**
* Removes empty optional fields from guidance options.
*
* @example
* normalizeSparkCommandGuidanceOptions([{ label: 'Wait', steps: ['Wait'], rationale: null, possibleOutcome: [], risk: null, fallback: [], triggers: [] }])
* // => [{ label: 'Wait', steps: ['Wait'], rationale: undefined, possibleOutcome: undefined, risk: undefined, fallback: undefined, triggers: undefined }]
*/
function normalizeSparkCommandGuidanceOptions(options) {
	return options.map((option) => ({
		...option,
		rationale: option.rationale ?? void 0,
		possibleOutcome: option.possibleOutcome?.length ? option.possibleOutcome : void 0,
		risk: option.risk ?? void 0,
		fallback: option.fallback?.length ? option.fallback : void 0,
		triggers: option.triggers?.length ? option.triggers : void 0
	}));
}
/**
* Removes empty routing filters from a context update.
*
* @example
* normalizeSparkCommandDestinations({ include: ['memory'], exclude: null })
* // => { include: ['memory'], exclude: undefined }
*/
function normalizeSparkCommandDestinations(destinations) {
	if (destinations == null) return void 0;
	if (Array.isArray(destinations) || "all" in destinations) return destinations;
	const include = destinations.include?.length ? destinations.include : void 0;
	const exclude = destinations.exclude?.length ? destinations.exclude : void 0;
	if (!include && !exclude) return void 0;
	return {
		include,
		exclude
	};
}
/**
* Removes an empty provider-safe string list.
*
* @example
* normalizeSparkCommandStringList([])
* // => undefined
*/
function normalizeSparkCommandStringList(value) {
	return value?.length ? value : void 0;
}
/**
* Converts a nullable provider-safe string into the runtime optional value.
*
* @example
* normalizeSparkCommandStringValue(null)
* // => undefined
*/
function normalizeSparkCommandStringValue(value) {
	return value ?? void 0;
}
//#endregion
//#region src/agents/spark-command/tools.ts
/**
* Creates the LLM tool that emits one `spark:command` event.
*
* The caller owns transport delivery. This function creates provider-facing schemas,
* normalizes the tool payload, and passes the resulting event to `sendSparkCommand`.
*/
async function createSparkCommandTool(options) {
	const parameters = await toJsonSchema(sparkCommandToolSchema);
	return [rawTool({
		name: "builtIn_emitSparkCommand",
		description: "Send a spark:command to one or more frontend-connected modules or sub-agents.",
		parameters,
		execute: async (rawPayload) => {
			const payload = rawPayload;
			const command = {
				id: nanoid(),
				eventId: nanoid(),
				parentEventId: payload.parentEventId ?? void 0,
				commandId: nanoid(),
				interrupt: payload.interrupt ?? false,
				priority: payload.priority ?? "normal",
				intent: payload.intent ?? "action",
				ack: payload.ack ?? void 0,
				guidance: payload.guidance ? {
					type: payload.guidance.type,
					persona: normalizeSparkCommandPersona(payload.guidance.persona ?? void 0),
					options: normalizeSparkCommandGuidanceOptions(payload.guidance.options)
				} : void 0,
				contexts: payload.contexts?.map((context) => ({
					id: nanoid(),
					contextId: nanoid(),
					lane: normalizeSparkCommandStringValue(context.lane),
					ideas: normalizeSparkCommandStringList(context.ideas),
					hints: normalizeSparkCommandStringList(context.hints),
					strategy: context.strategy,
					text: context.text,
					destinations: normalizeSparkCommandDestinations(context.destinations),
					metadata: normalizeSparkCommandMetadata(context.metadata ?? void 0)
				})),
				destinations: payload.destinations
			};
			options.sendSparkCommand(command);
			const dests = Array.isArray(command.destinations) && command.destinations.length > 0 ? command.destinations.join(", ") : "all authenticated peers (broadcast)";
			return `spark:command sent (${command.commandId}) to ${dests}`;
		}
	})];
}
//#endregion
export { createSparkCommandTool, normalizeSparkCommandDestinations, normalizeSparkCommandGuidanceOptions, normalizeSparkCommandMetadata, normalizeSparkCommandPersona, normalizeSparkCommandStringList, normalizeSparkCommandStringValue, sparkCommandGuidanceOptionSchema, sparkCommandGuidanceSchema, sparkCommandIntentSchema, sparkCommandInterruptSchema, sparkCommandPersonaSchema, sparkCommandPrioritySchema, sparkCommandToolSchema };
