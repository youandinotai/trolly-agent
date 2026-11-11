import { defaultSherpawModelEndpoint, formatSherpawLanguageName, formatSherpawModelName, paraformerBilingualZhEn, selectSherpawModel, sherpawModelArtifactUrl, sherpawModelPath, sherpawModels, sherpawModelsForLanguage, xAsrBilingualZhEnInt8, zipformerMultilingual } from "./providers/local/sherpaw-transcription/models.mjs";
import { t as joinTranscriptSegments } from "./transcript-DbcXedu4.mjs";
import { createChatProvider, createEmbedProvider, createModelProvider, createSpeechProvider, createTranscriptionProvider, merge } from "@xsai-ext/providers/utils";
import { z } from "zod";
import isNetworkError from "is-network-error";
import { errorMessageFrom, merge as merge$1 } from "@moeru/std";
import { responses } from "@xsai-ext/responses";
import { generateText } from "@xsai/generate-text";
import { listModels } from "@xsai/model";
import { message } from "@xsai/utils-chat";
import { Mutex } from "es-toolkit";
import { createCerebras, createDeepSeek, createFireworks, createGoogleGenerativeAI, createMinimax, createMinimaxCn, createMistral, createMoonshotai, createNovita, createOllama, createOpenAI, createOpenRouter, createPerplexity, createTogetherAI, createXai, createXiaomi, createZai } from "@xsai-ext/providers/create";
import { createAzure, createPlayer2, createWorkersAI } from "@xsai-ext/providers/special/create";
import { createUnAlibabaCloud, createUnDeepgram, createUnElevenLabs, createUnMicrosoft, createUnVolcengine, listVoices } from "unspeech";
import { GoogleGenAI } from "@google/genai";
import { toWavFromPCM16 } from "@proj-airi/audio/encoding";
import { EventSourceParserStream } from "@xsai/shared-stream";
import { openaiChatModels } from "model-bank/openai";
import { MODEL_REASONING_EXTEND_PARAMS, MODEL_REASONING_PARAM_LEVELS } from "model-bank/types";
import { array, boolean, number, object, optional, parse, string } from "valibot";
import openRouterModels from "model-bank/openrouter";
//#region src/types.ts
/**
* Image reads that a vision provider answers at once when its definition
* declares no limit. Cloud providers answer several reads in parallel, and four
* keeps a message with several images fast without flooding the provider.
*/
const DEFAULT_CONCURRENT_VISION_READS = 4;
/** Narrows instances that already expose AIRI's protocol-neutral inference capability. */
function isGenerationProvider(provider) {
	return "generation" in provider && typeof provider.generation === "function";
}
/**
* Adapts SDK chat instances at the provider boundary. Existing native instances keep their identity.
* Non-chat definitions return undefined. Core-agent receives only the returned generation interface.
*/
function getGenerationProvider(provider) {
	if (isGenerationProvider(provider)) return provider;
	if ("chat" in provider && typeof provider.chat === "function") return { generation: (model, options) => ({
		protocol: "chat-completions",
		config: provider.chat(model, options)
	}) };
}
/** Applies one reasoning choice to every request of a provider. Undefined options keep the provider default. */
function withReasoning(provider, options) {
	return { generation: (model) => provider.generation(model, options) };
}
function isModelProvider(providerInstance) {
	if ("model" in providerInstance && typeof providerInstance.model === "function") return true;
	return false;
}
/**
* Validator ID fragment for the chat completions probe.
* Matched via `.includes()` against validator instance ids
* (e.g. `openai-compatible:check-chat-completions`).
*/
const CHAT_COMPLETIONS_VALIDATOR_ID = "check-chat-completions";
let ProviderValidationCheck = /* @__PURE__ */ function(ProviderValidationCheck) {
	/** Lightweight GET to /models endpoint to check reachability (definition system) */
	ProviderValidationCheck["Connectivity"] = "connectivity";
	/** Fetch model list and verify non-empty */
	ProviderValidationCheck["ModelList"] = "model_list";
	/** Send generateText ping with fine-grained error handling and caching (definition system) */
	ProviderValidationCheck["ChatCompletions"] = "chat_completions";
	/**
	* @deprecated
	* Being used in builder system (a deprecated provider creation protocol),
	* currently used by only OpenAI TTS && OpenAI Transcription.
	* Send generateText ping with simple pass/fail, fallback to 'test' model (builder system)
	*/
	ProviderValidationCheck["Health"] = "health";
	return ProviderValidationCheck;
}({});
//#endregion
//#region src/validators/openai-compatible.ts
function extractStatusCode(error) {
	if (!error) return null;
	const anyError = error;
	const candidates = [
		anyError.cause?.status,
		anyError.cause?.statusCode,
		anyError.cause?.response?.status
	];
	for (const candidate of candidates) if (typeof candidate === "number") return candidate;
	return null;
}
function extractModelId(model) {
	if (!model) return "";
	if (typeof model === "string") return model;
	if (typeof model.id === "string") return model.id;
	return "";
}
function shouldSkipModelId(modelId) {
	return [
		"embed",
		"tts",
		"models/gemini-2.5-pro"
	].some((fragment) => modelId.includes(fragment));
}
async function resolveModels(config, provider, providerExtra) {
	if (providerExtra?.listModels) return providerExtra.listModels(config, provider);
	if (!isModelProvider(provider)) return listModels({
		baseURL: config.baseUrl,
		apiKey: config.apiKey
	});
	return listModels(provider.model());
}
async function pickValidationModel(config, provider, providerExtra) {
	if ("model" in config && typeof config.model === "string" && config.model.trim()) return config.model.trim();
	try {
		return extractModelId((await resolveModels(config, provider, providerExtra)).find((model) => !shouldSkipModelId(extractModelId(model)))) || null;
	} catch {
		return null;
	}
}
function createOpenAICompatibleValidators(options) {
	const checks = options?.checks ?? ["connectivity", "model_list"];
	const additionalHeaders = options?.additionalHeaders;
	const missingValidationModelReason = "No model available for validation. Configure a model manually and try again.";
	async function runChatCheck(config, provider, providerExtra) {
		const model = await pickValidationModel(config, provider, providerExtra);
		const normalizedModel = model ? options?.normalizeModelId?.(model) ?? model : model;
		if (!normalizedModel) {
			if (options?.allowValidationWithoutModel) return {
				connectivityOk: true,
				chatOk: true
			};
			return {
				connectivityOk: false,
				chatOk: false,
				errorMessage: missingValidationModelReason
			};
		}
		const generation = getGenerationProvider(provider)?.generation(normalizedModel);
		try {
			if (generation?.protocol === "responses") {
				const result = responses({
					...generation.config,
					input: "ping",
					maxOutputTokens: 16,
					store: false,
					headers: additionalHeaders
				});
				await Promise.all([
					result.steps,
					result.input,
					result.usage,
					result.totalUsage
				]);
				return {
					connectivityOk: true,
					chatOk: true
				};
			}
			await generateText({
				apiKey: config.apiKey,
				baseURL: config.baseUrl,
				headers: additionalHeaders,
				model: normalizedModel,
				messages: message.messages(message.user("ping")),
				...options?.chatCompletionTokenParameter === "max_completion_tokens" ? { max_completion_tokens: 16 } : { max_tokens: 16 }
			});
			return {
				connectivityOk: true,
				chatOk: true
			};
		} catch (e) {
			if (isNetworkError(e)) return {
				connectivityOk: false,
				chatOk: false,
				error: e,
				errorMessage: errorMessageFrom(e)
			};
			const status = extractStatusCode(e);
			return {
				connectivityOk: true,
				chatOk: generation?.protocol !== "responses" && (status === 400 || Boolean(status && status >= 200 && status < 300)),
				errorMessage: errorMessageFrom(e)
			};
		}
	}
	const chatCheckCacheKey = "openai-compatible:chat-check";
	const chatCheckMutexKey = "openai-compatible:chat-check:mutex";
	const getChatCheckResult = async (config, provider, providerExtra, contextOptions) => {
		const cache = contextOptions?.validationCache;
		const existing = cache?.get(chatCheckCacheKey);
		if (existing) return existing;
		if (!cache) return runChatCheck(config, provider, providerExtra);
		let mutex = cache.get(chatCheckMutexKey);
		if (!mutex) {
			mutex = new Mutex();
			cache.set(chatCheckMutexKey, mutex);
		}
		await mutex.acquire();
		try {
			const cached = cache.get(chatCheckCacheKey);
			if (cached) return cached;
			const sharedCheck = runChatCheck(config, provider, providerExtra);
			cache.set(chatCheckCacheKey, sharedCheck);
			return sharedCheck;
		} finally {
			mutex.release();
		}
	};
	const validatorConfig = {
		validateConfig: [],
		validateProvider: []
	};
	validatorConfig.validateConfig?.push(({ t }) => ({
		id: "openai-compatible:check-config",
		name: t("settings.pages.providers.catalog.edit.validators.openai-compatible.check-config.title"),
		validator: async (config) => {
			const errors = [];
			const apiKey = typeof config.apiKey === "string" ? config.apiKey.trim() : "";
			const baseUrl = config.baseUrl instanceof URL ? config.baseUrl?.toString() : typeof config.baseUrl === "string" ? config.baseUrl.trim() : "";
			if (!options?.skipApiKeyCheck && !apiKey) errors.push({ error: /* @__PURE__ */ new Error("API key is required.") });
			if (!baseUrl) errors.push({ error: /* @__PURE__ */ new Error("Base URL is required.") });
			if (baseUrl) try {
				if (!new URL(baseUrl).host) errors.push({ error: /* @__PURE__ */ new Error("Base URL is not absolute. Check your input.") });
			} catch {
				errors.push({ error: /* @__PURE__ */ new Error("Base URL is invalid. It must be an absolute URL.") });
			}
			return {
				errors,
				reason: errors.length > 0 ? errors.map((item) => item.error.message).join(", ") : "",
				reasonKey: "",
				valid: errors.length === 0
			};
		}
	}));
	if (checks.includes("connectivity")) validatorConfig.validateProvider?.push(({ t }) => ({
		id: "openai-compatible:check-connectivity",
		name: t("settings.pages.providers.catalog.edit.validators.openai-compatible.check-connectivity.title"),
		schedule: options?.schedule,
		validator: async (config) => {
			const errors = [];
			const baseUrl = String(config.baseUrl ?? "");
			const modelsUrl = baseUrl.endsWith("/") ? `${baseUrl}models` : `${baseUrl}/models`;
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), 1e4);
			try {
				const response = await fetch(modelsUrl, {
					method: "GET",
					headers: {
						...config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {},
						...additionalHeaders
					},
					signal: controller.signal
				});
				if (response.status >= 500) {
					const errorMessage = `Server error: HTTP ${response.status}`;
					const reason = options?.connectivityFailureReason ? options.connectivityFailureReason({
						config,
						error: new Error(errorMessage),
						errorMessage
					}) : `Connectivity check failed: ${errorMessage}`;
					errors.push({ error: new Error(reason) });
				}
			} catch (e) {
				const errorMessage = errorMessageFrom(e) || "Unknown error.";
				const reason = options?.connectivityFailureReason ? options.connectivityFailureReason({
					config,
					error: e,
					errorMessage
				}) : `Connectivity check failed: ${errorMessage}`;
				errors.push({ error: new Error(reason) });
			} finally {
				clearTimeout(timeout);
			}
			return {
				errors,
				reason: errors.length > 0 ? errors.map((item) => item.error.message).join(", ") : "",
				reasonKey: "",
				valid: errors.length === 0
			};
		}
	}));
	if (checks.includes("chat_completions")) validatorConfig.validateProvider?.push(({ t }) => ({
		id: "openai-compatible:check-chat-completions",
		name: t("settings.pages.providers.catalog.edit.validators.openai-compatible.check-supports-chat-completion.title"),
		schedule: options?.schedule,
		validator: async (config, provider, providerExtra, contextOptions) => {
			const errors = [];
			const result = await getChatCheckResult(config, provider, providerExtra, contextOptions);
			if (!result.chatOk) errors.push({ error: /* @__PURE__ */ new Error(`Chat completions check failed: ${result.errorMessage || "Unknown error."}`) });
			return {
				errors,
				reason: errors.length > 0 ? errors.map((item) => item.error.message).join(", ") : "",
				reasonKey: "",
				valid: errors.length === 0
			};
		}
	}));
	if (checks.includes("model_list")) validatorConfig.validateProvider?.push(({ t }) => ({
		id: "openai-compatible:check-model-list",
		name: t("settings.pages.providers.catalog.edit.validators.openai-compatible.check-supports-model-listing.title"),
		schedule: options?.schedule,
		validator: async (config, provider, providerExtra) => {
			const errors = [];
			try {
				const models = await resolveModels(config, provider, providerExtra);
				if (!models || models.length === 0) errors.push({ error: /* @__PURE__ */ new Error("Model list check failed: no models found") });
			} catch (e) {
				const errorMessage = errorMessageFrom(e) || "Unknown error.";
				const reason = options?.modelListFailureReason ? options.modelListFailureReason({
					config,
					error: e,
					errorMessage
				}) : `Model list check failed: ${errorMessage}`;
				errors.push({ error: new Error(reason) });
			}
			return {
				errors,
				reason: errors.length > 0 ? errors.map((item) => item.error.message).join(", ") : "",
				reasonKey: "",
				valid: errors.length === 0
			};
		}
	}));
	return validatorConfig;
}
//#endregion
//#region src/validators/run.ts
function createConfigValidationSteps(configValidators) {
	return configValidators.map((validator) => ({
		id: validator.id,
		label: validator.name,
		status: "idle",
		reason: "",
		kind: "config"
	}));
}
function createProviderValidationSteps(providerValidators) {
	return providerValidators.map((validator) => ({
		id: validator.id,
		label: validator.name,
		status: "idle",
		reason: "",
		kind: "provider"
	}));
}
async function getProviderValidationIntervalMs(options) {
	const validators = await Promise.all((options.definition.validators?.validateProvider || []).map((creator) => creator(options.contextOptions)));
	const defaultIntervalMs = options.defaultIntervalMs ?? 15e3;
	const intervals = validators.filter((validator) => validator.schedule?.mode === "interval").map((validator) => validator.schedule?.intervalMs || defaultIntervalMs);
	if (intervals.length === 0) return;
	return Math.min(...intervals);
}
async function getValidatorsOfProvider(options) {
	const { definition } = options;
	const configValidators = await Promise.all((definition.validators?.validateConfig || []).map((creator) => creator(options.contextOptions)));
	const providerValidators = await Promise.all((definition.validators?.validateProvider || []).map((creator) => creator(options.contextOptions)));
	const steps = [...createConfigValidationSteps(configValidators), ...createProviderValidationSteps(providerValidators)];
	const normalizedConfig = merge$1(options.schemaDefaults, options.config);
	const shouldValidate = await (definition.validationRequiredWhen ?? (() => false))(normalizedConfig);
	return {
		steps,
		config: normalizedConfig,
		definition,
		configValidators,
		providerValidators,
		providerExtra: definition.extraMethods,
		shouldValidate
	};
}
async function validateProvider(plan, contextOptions, callbacks = {}) {
	const { configValidators, providerValidators, steps, config, definition, providerExtra } = plan;
	const runContext = {
		...contextOptions,
		validationCache: /* @__PURE__ */ new Map()
	};
	const { onValidatorError, onValidatorStart, onValidatorSuccess } = callbacks;
	const configIsValid = (await Promise.all(configValidators.map(async (validatorDefinition, index) => {
		const step = steps[index];
		step.status = "validating";
		step.reason = "";
		onValidatorStart?.({
			kind: "config",
			index,
			step
		});
		try {
			const result = await validatorDefinition.validator(config, runContext);
			step.status = result.valid ? "valid" : "invalid";
			step.reason = result.valid ? "" : result.reason;
			onValidatorSuccess?.({
				kind: "config",
				index,
				step,
				result
			});
			return result;
		} catch (error) {
			step.status = "invalid";
			step.reason = errorMessageFrom(error) ?? "Unknown error";
			onValidatorError?.({
				kind: "config",
				index,
				step,
				error
			});
			return {
				valid: false,
				reason: step.reason
			};
		}
	}))).every((result) => result.valid);
	const providerStepOffset = configValidators.length;
	if (!configIsValid) {
		for (let i = 0; i < providerValidators.length; i++) {
			const step = steps[providerStepOffset + i];
			step.status = "invalid";
			step.reason = "Fix configuration checks first.";
		}
		return steps;
	}
	let providerInstance;
	try {
		providerInstance = await definition.createProvider(config);
	} catch (error) {
		for (let i = 0; i < providerValidators.length; i++) {
			const step = steps[providerStepOffset + i];
			step.status = "invalid";
			step.reason = errorMessageFrom(error) ?? "Unknown error";
		}
		return steps;
	}
	try {
		await Promise.all(providerValidators.map(async (validatorDefinition, index) => {
			const step = steps[providerStepOffset + index];
			step.status = "validating";
			step.reason = "";
			onValidatorStart?.({
				kind: "provider",
				index,
				step
			});
			try {
				const result = await validatorDefinition.validator(config, providerInstance, providerExtra ?? {}, runContext);
				step.status = result.valid ? "valid" : "invalid";
				step.reason = result.valid ? "" : result.reason;
				onValidatorSuccess?.({
					kind: "provider",
					index,
					step,
					result
				});
			} catch (error) {
				step.status = "invalid";
				step.reason = errorMessageFrom(error) ?? "Unknown error";
				onValidatorError?.({
					kind: "provider",
					index,
					step,
					error
				});
			}
		}));
	} finally {
		await providerInstance.dispose?.();
	}
	return steps;
}
//#endregion
//#region src/providers/registry.ts
/**
* Keeps the existing declaration style while making provider modules pure.
*
* The application registry receives the returned definitions explicitly.
*/
function defineProvider(definition) {
	return definition;
}
/**
* Creates a deterministic provider registry from explicit definitions.
*
* @throws {Error} When more than one definition declares the same id.
*/
function createProviderRegistry(definitions) {
	const definitionsById = /* @__PURE__ */ new Map();
	for (const definition of definitions) {
		if (definitionsById.has(definition.id)) throw new Error(`Provider definition "${definition.id}" is registered more than once.`);
		definitionsById.set(definition.id, definition);
	}
	const sortedDefinitions = [...definitionsById.values()].toSorted((left, right) => {
		if (left.order === void 0 && right.order !== void 0) return 1;
		if (left.order !== void 0 && right.order === void 0) return -1;
		if (left.order !== void 0 && right.order !== void 0 && left.order !== right.order) return left.order - right.order;
		if (left.name < right.name) return -1;
		if (left.name > right.name) return 1;
		return 0;
	});
	return {
		get: (id) => definitionsById.get(id),
		list: () => [...sortedDefinitions]
	};
}
//#endregion
//#region src/providers/cloud/302-ai/index.ts
const ai302ConfigSchema = z.object({
	apiKey: z.string("API Key"),
	baseUrl: z.string("Base URL").optional().default("https://api.302.ai/v1/")
});
const provider302AI = defineProvider({
	id: "302-ai",
	order: 7,
	name: "302.AI",
	nameLocalize: ({ t }) => t("settings.pages.providers.provider.302-ai.title"),
	description: "302.ai",
	descriptionLocalize: ({ t }) => t("settings.pages.providers.provider.302-ai.description"),
	tasks: ["chat"],
	icon: "i-lobe-icons:ai302",
	iconColor: "i-lobe-icons:ai302-color",
	createProviderConfig: ({ t }) => ai302ConfigSchema.extend({
		apiKey: ai302ConfigSchema.shape.apiKey.meta({
			labelLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label"),
			descriptionLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description"),
			placeholderLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder"),
			type: "password"
		}),
		baseUrl: ai302ConfigSchema.shape.baseUrl.meta({
			labelLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label"),
			descriptionLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description"),
			placeholderLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder")
		})
	}),
	createProvider(config) {
		return merge(createChatProvider({
			apiKey: config.apiKey,
			baseURL: config.baseUrl
		}), createEmbedProvider({
			apiKey: config.apiKey,
			baseURL: config.baseUrl
		}), createModelProvider({
			apiKey: config.apiKey,
			baseURL: config.baseUrl
		}));
	},
	validationRequiredWhen(config) {
		return !!config.apiKey?.trim();
	},
	validators: { ...createOpenAICompatibleValidators({ checks: ["model_list", "chat_completions"] }) }
});
//#endregion
//#region src/providers/cloud/aihubmix/index.ts
const aihubmixConfigSchema = z.object({
	apiKey: z.string("API Key"),
	baseUrl: z.string("Base URL").optional().default("https://aihubmix.com/v1/")
});
const providerAIHubMix = defineProvider({
	id: "aihubmix",
	order: 1,
	name: "AIHubMix",
	nameLocalize: ({ t }) => t("settings.pages.providers.provider.aihubmix.title"),
	description: "AIHubMix",
	descriptionLocalize: ({ t }) => t("settings.pages.providers.provider.aihubmix.description"),
	tasks: ["chat"],
	capabilities: { chat: { reasoning: { modes: ["enabled", "disabled"] } } },
	icon: "i-lobe-icons:aihubmix",
	iconColor: "i-lobe-icons:aihubmix-color",
	createProviderConfig: ({ t }) => aihubmixConfigSchema.extend({
		apiKey: aihubmixConfigSchema.shape.apiKey.meta({
			labelLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label"),
			descriptionLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description"),
			placeholderLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder"),
			type: "password"
		}),
		baseUrl: aihubmixConfigSchema.shape.baseUrl.meta({
			labelLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label"),
			descriptionLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description"),
			placeholderLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder")
		})
	}),
	createProvider(config) {
		const provider = merge(createChatProvider({
			apiKey: config.apiKey,
			baseURL: config.baseUrl
		}), createEmbedProvider({
			apiKey: config.apiKey,
			baseURL: config.baseUrl
		}), createModelProvider({
			apiKey: config.apiKey,
			baseURL: config.baseUrl
		}));
		return {
			...provider,
			chat(model, options) {
				const request = provider.chat(model);
				if (!options?.reasoning) return request;
				return {
					...request,
					reasoningEffort: options.reasoning === "enabled" ? "medium" : "none"
				};
			}
		};
	},
	validationRequiredWhen(config) {
		return !!config.apiKey?.trim();
	},
	validators: { ...createOpenAICompatibleValidators({ checks: ["model_list", "chat_completions"] }) }
});
//#endregion
//#region src/providers/cloud/amazon-bedrock/index.ts
const amazonBedrockConfigSchema = z.object({
	apiKey: z.string("Amazon Bedrock API Key").min(1),
	region: z.string("AWS Region").regex(/^[a-z]{2,3}-[a-z]+-\d+$/, "Must be a valid AWS region (e.g. us-east-1, ap-southeast-1)").optional().default("us-east-1")
});
function mergeConsecutiveRoles(messages) {
	const merged = [];
	for (const msg of messages) {
		const last = merged.at(-1);
		if (last && last.role === msg.role) last.content.push(...msg.content);
		else merged.push({
			role: msg.role,
			content: [...msg.content]
		});
	}
	return merged;
}
function toConverseContent(content) {
	if (typeof content === "string") return [{ text: content }];
	if (Array.isArray(content)) return content.filter((c) => c.type === "text" && c.text).map((c) => ({ text: c.text }));
	return [{ text: String(content) }];
}
function fallbackModels() {
	return [
		{
			id: "us.amazon.nova-pro-v1:0",
			name: "Amazon Nova Pro",
			provider: "amazon-bedrock",
			description: "Amazon Nova highly capable multimodal model"
		},
		{
			id: "us.amazon.nova-lite-v1:0",
			name: "Amazon Nova Lite",
			provider: "amazon-bedrock",
			description: "Amazon Nova very low cost multimodal model"
		},
		{
			id: "us.amazon.nova-micro-v1:0",
			name: "Amazon Nova Micro",
			provider: "amazon-bedrock",
			description: "Amazon Nova text only model, lowest cost"
		},
		{
			id: "us.anthropic.claude-3-5-sonnet-20241022-v2:0",
			name: "Claude Sonnet 3.5 v2",
			provider: "amazon-bedrock",
			description: "Intelligent, fast Claude 3.5 model on Amazon Bedrock"
		},
		{
			id: "us.anthropic.claude-3-7-sonnet-20250219-v1:0",
			name: "Claude Sonnet 3.7",
			provider: "amazon-bedrock",
			description: "Hybrid reasoning model on Amazon Bedrock"
		}
	];
}
function createBedrockConverseProvider(config) {
	const { apiKey, region } = config;
	const baseURL = `https://bedrock-runtime.${region}.amazonaws.com/v1/`;
	const bedrockHeaders = () => ({
		"authorization": `Bearer ${apiKey}`,
		"content-type": "application/json"
	});
	return { chat: (model) => ({
		apiKey,
		baseURL,
		model,
		fetch: async (_input, init) => {
			const body = JSON.parse(init?.body || "{}");
			const messages = body.messages || [];
			const modelId = body.model || model;
			const systemMessages = messages.filter((m) => m.role === "system");
			const converseMessages = mergeConsecutiveRoles(messages.filter((m) => m.role !== "system").map((m) => ({
				role: m.role,
				content: toConverseContent(m.content)
			})));
			const system = systemMessages.length > 0 ? systemMessages.map((m) => ({ text: typeof m.content === "string" ? m.content : Array.isArray(m.content) ? m.content.map((c) => c.text || "").join("") : String(m.content) })) : void 0;
			const converseBody = {
				messages: converseMessages,
				inferenceConfig: {
					maxTokens: body.max_tokens || 4096,
					...body.temperature !== void 0 && { temperature: body.temperature },
					...body.top_p !== void 0 && { topP: body.top_p }
				}
			};
			if (system) converseBody.system = system;
			const converseUrl = `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(modelId)}/converse`;
			const response = await fetch(converseUrl, {
				method: "POST",
				headers: bedrockHeaders(),
				body: JSON.stringify(converseBody)
			});
			if (!response.ok) return response;
			const data = await response.json();
			const fullText = (data.output?.message?.content ?? []).filter((c) => c.text).map((c) => c.text).join("");
			const stopReason = data.stopReason === "end_turn" ? "stop" : data.stopReason ?? "stop";
			const id = `chatcmpl-bedrock-${Date.now()}`;
			const encoder = new TextEncoder();
			const stream = new ReadableStream({ start(controller) {
				const enqueue = (chunk) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
				enqueue({
					id,
					object: "chat.completion.chunk",
					choices: [{
						delta: { role: "assistant" },
						index: 0,
						finish_reason: null
					}]
				});
				enqueue({
					id,
					object: "chat.completion.chunk",
					choices: [{
						delta: { content: fullText },
						index: 0,
						finish_reason: null
					}]
				});
				enqueue({
					id,
					object: "chat.completion.chunk",
					choices: [{
						delta: {},
						index: 0,
						finish_reason: stopReason
					}]
				});
				controller.enqueue(encoder.encode("data: [DONE]\n\n"));
				controller.close();
			} });
			return new Response(stream, { headers: {
				"content-type": "text/event-stream",
				"cache-control": "no-cache"
			} });
		}
	}) };
}
const providerAmazonBedrock = defineProvider({
	id: "amazon-bedrock",
	order: 18,
	name: "Amazon Bedrock",
	nameLocalize: ({ t }) => t("settings.pages.providers.provider.amazon-bedrock.title"),
	description: "aws.amazon.com/bedrock",
	descriptionLocalize: ({ t }) => t("settings.pages.providers.provider.amazon-bedrock.description"),
	tasks: ["chat"],
	icon: "i-lobe-icons:aws",
	iconColor: "i-lobe-icons:aws-color",
	createProviderConfig: ({ t }) => amazonBedrockConfigSchema.extend({
		apiKey: amazonBedrockConfigSchema.shape.apiKey.meta({
			labelLocalized: t("settings.pages.providers.provider.amazon-bedrock.config.api-key.label"),
			descriptionLocalized: t("settings.pages.providers.provider.amazon-bedrock.config.api-key.description"),
			placeholderLocalized: t("settings.pages.providers.provider.amazon-bedrock.config.api-key.placeholder"),
			type: "password"
		}),
		region: amazonBedrockConfigSchema.shape.region.meta({
			labelLocalized: t("settings.pages.providers.provider.amazon-bedrock.config.region.label"),
			descriptionLocalized: t("settings.pages.providers.provider.amazon-bedrock.config.region.description"),
			placeholderLocalized: "us-east-1"
		})
	}),
	onboardingFields: ({ t }) => [{
		key: "apiKey",
		type: "password",
		label: t("settings.pages.providers.provider.amazon-bedrock.config.api-key.label"),
		description: t("settings.pages.providers.provider.amazon-bedrock.config.api-key.description"),
		placeholder: t("settings.pages.providers.provider.amazon-bedrock.config.api-key.placeholder"),
		required: true
	}, {
		key: "region",
		type: "text",
		label: t("settings.pages.providers.provider.amazon-bedrock.config.region.label"),
		description: t("settings.pages.providers.provider.amazon-bedrock.config.region.description"),
		placeholder: "us-east-1",
		defaultValue: "us-east-1"
	}],
	createProvider(config) {
		const region = config.region;
		const baseURL = `https://bedrock-runtime.${region}.amazonaws.com/v1/`;
		const chatProvider = createBedrockConverseProvider({
			apiKey: config.apiKey,
			region
		});
		return merge(chatProvider, createModelProvider({
			apiKey: config.apiKey,
			baseURL
		}));
	},
	extraMethods: { listModels: async (config, _provider) => {
		const { apiKey, region } = config;
		const base = `https://bedrock.${region}.amazonaws.com`;
		const headers = { authorization: `Bearer ${apiKey}` };
		try {
			const allFoundationModels = (await Promise.all([
				"Amazon",
				"Anthropic",
				"Moonshot",
				"Minimax",
				"DeepSeek"
			].map(async (provider) => {
				const url = `${base}/foundation-models?byInferenceType=ON_DEMAND&byOutputModality=TEXT&byProvider=${encodeURIComponent(provider)}`;
				const res = await fetch(url, {
					method: "GET",
					headers
				});
				if (!res.ok) return { modelSummaries: [] };
				return res.json();
			}))).flatMap((r) => r.modelSummaries || []);
			const profilesRes = await fetch(`${base}/inference-profiles?type=SYSTEM_DEFINED&maxResults=1000`, {
				method: "GET",
				headers
			});
			const profilesData = profilesRes.ok ? await profilesRes.json() : { inferenceProfileSummaries: [] };
			const profileMap = /* @__PURE__ */ new Map();
			for (const p of profilesData.inferenceProfileSummaries || []) {
				const id = p.inferenceProfileId;
				if (!id) continue;
				const dotIdx = id.indexOf(".");
				if (dotIdx === -1) continue;
				const prefix = id.slice(0, dotIdx);
				const baseId = id.slice(dotIdx + 1);
				if (!profileMap.has(baseId)) profileMap.set(baseId, {});
				const entry = profileMap.get(baseId);
				if (prefix === "global") entry.global = id;
				else if (prefix === "us") entry.us = id;
			}
			const foundationModelIds = new Set(allFoundationModels.map((m) => m.modelId));
			const results = allFoundationModels.map((m) => {
				const entry = profileMap.get(m.modelId);
				return {
					id: entry?.global ?? entry?.us ?? m.modelId,
					name: m.modelName,
					provider: "amazon-bedrock",
					description: `${m.providerName} · ${m.modelName}`
				};
			});
			const targetPrefixes = [
				"amazon.",
				"anthropic.",
				"moonshot.",
				"minimax.",
				"deepseek."
			];
			const seenBaseIds = new Set(foundationModelIds);
			for (const p of profilesData.inferenceProfileSummaries || []) {
				const id = p.inferenceProfileId;
				if (!id) continue;
				const dotIdx = id.indexOf(".");
				if (dotIdx === -1) continue;
				const prefix = id.slice(0, dotIdx);
				const baseId = id.slice(dotIdx + 1);
				if (prefix !== "global" && prefix !== "us") continue;
				if (seenBaseIds.has(baseId)) continue;
				if (!targetPrefixes.some((pfx) => baseId.startsWith(pfx))) continue;
				const existing = profileMap.get(baseId);
				if (prefix === "us" && existing?.global) continue;
				seenBaseIds.add(baseId);
				const name = p.inferenceProfileName || baseId;
				const providerName = baseId.split(".")[0];
				results.push({
					id,
					name,
					provider: "amazon-bedrock",
					description: `${providerName.charAt(0).toUpperCase() + providerName.slice(1)} · ${name}`
				});
			}
			return results.length > 0 ? results : fallbackModels();
		} catch {
			return fallbackModels();
		}
	} },
	validationRequiredWhen(config) {
		return !!config.apiKey?.trim();
	},
	validators: {
		validateConfig: [],
		validateProvider: [() => ({
			id: "amazon-bedrock:check-credentials",
			name: "Verify Amazon Bedrock API key",
			validator: async (config) => {
				const region = config.region || "us-east-1";
				const apiKey = config.apiKey;
				const errors = [];
				try {
					const res = await fetch(`https://bedrock.${region}.amazonaws.com/foundation-models?byInferenceType=ON_DEMAND&byOutputModality=TEXT&byProvider=Amazon&maxResults=1`, {
						method: "GET",
						headers: { authorization: `Bearer ${apiKey}` }
					});
					if (res.status === 403 || res.status === 401) errors.push({ error: /* @__PURE__ */ new Error("Invalid Amazon Bedrock API key or insufficient permissions.") });
				} catch {
					errors.push({ error: /* @__PURE__ */ new Error("Failed to connect to Amazon Bedrock. Check your region and network.") });
				}
				return {
					errors,
					reason: errors.length > 0 ? errors[0].error.message : "",
					reasonKey: "",
					valid: errors.length === 0
				};
			}
		})]
	}
});
//#endregion
//#region src/providers/cloud/anthropic/index.ts
const anthropicConfigSchema = z.object({
	apiKey: z.string("API Key"),
	baseUrl: z.string("Base URL").optional().default("https://api.anthropic.com/v1/")
});
function createAnthropic(apiKey, baseURL = "https://api.anthropic.com/v1/") {
	const anthropicFetch = async (input, init) => {
		init.headers ??= {};
		if (Array.isArray(init.headers)) init.headers.push(["anthropic-dangerous-direct-browser-access", "true"]);
		else if (init.headers instanceof Headers) init.headers.append("anthropic-dangerous-direct-browser-access", "true");
		else init.headers["anthropic-dangerous-direct-browser-access"] = "true";
		return fetch(input, init);
	};
	return merge(createChatProvider({
		apiKey,
		fetch: anthropicFetch,
		baseURL
	}), createModelProvider({
		apiKey,
		fetch: anthropicFetch,
		baseURL
	}));
}
const providerAnthropic = defineProvider({
	id: "anthropic",
	order: 6,
	name: "Anthropic",
	nameLocalize: ({ t }) => t("settings.pages.providers.provider.anthropic.title"),
	description: "anthropic.com",
	descriptionLocalize: ({ t }) => t("settings.pages.providers.provider.anthropic.description"),
	tasks: ["chat"],
	icon: "i-lobe-icons:claude",
	iconColor: "i-lobe-icons:claude-color",
	createProviderConfig: ({ t }) => anthropicConfigSchema.extend({
		apiKey: anthropicConfigSchema.shape.apiKey.meta({
			labelLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label"),
			descriptionLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description"),
			placeholderLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder"),
			type: "password"
		}),
		baseUrl: anthropicConfigSchema.shape.baseUrl.meta({
			labelLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label"),
			descriptionLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description"),
			placeholderLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder")
		})
	}),
	createProvider(config) {
		return createAnthropic(config.apiKey, config.baseUrl);
	},
	extraMethods: { listModels: async () => [
		{
			id: "claude-haiku-4-5-20251001",
			name: "Claude Haiku 4.5",
			provider: "anthropic",
			description: "Anthropic fastest model with near-frontier intelligence"
		},
		{
			id: "claude-sonnet-4-5-20250929",
			name: "Claude Sonnet 4.5",
			provider: "anthropic",
			description: "Anthropic smartest model for complex agents and coding"
		},
		{
			id: "claude-opus-4-1-20250805",
			name: "Claude Opus 4.1",
			provider: "anthropic",
			description: "Exceptional model for specialized reasoning tasks"
		}
	] },
	validationRequiredWhen(config) {
		return !!config.apiKey?.trim();
	},
	validators: { ...createOpenAICompatibleValidators({
		checks: ["connectivity", "chat_completions"],
		additionalHeaders: { "anthropic-dangerous-direct-browser-access": "true" }
	}) }
});
const atlasCloudConfigSchema = z.object({
	apiKey: z.string("API Key"),
	baseUrl: z.string("Base URL").optional().default("https://api.atlascloud.ai/v1")
});
const providerAtlasCloud = defineProvider({
	id: "atlascloud",
	order: 5,
	name: "Atlas Cloud",
	nameLocalize: () => "Atlas Cloud",
	description: "api.atlascloud.ai",
	descriptionLocalize: () => "api.atlascloud.ai",
	tasks: ["chat"],
	icon: "i-lobe-icons:openai",
	createProviderConfig: ({ t }) => atlasCloudConfigSchema.extend({
		apiKey: atlasCloudConfigSchema.shape.apiKey.meta({
			labelLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label"),
			descriptionLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description"),
			placeholderLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder"),
			type: "password"
		}),
		baseUrl: atlasCloudConfigSchema.shape.baseUrl.meta({
			labelLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label"),
			descriptionLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description"),
			placeholderLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder")
		})
	}),
	createProvider(config) {
		return createOpenAI(config.apiKey, config.baseUrl);
	},
	validationRequiredWhen(config) {
		return !!config.apiKey?.trim();
	},
	validators: { ...createOpenAICompatibleValidators({ checks: [
		"connectivity",
		"model_list",
		"chat_completions"
	] }) }
});
//#endregion
//#region src/providers/cloud/azure-ai-foundry/index.ts
const azureAIFoundryConfigSchema = z.object({
	apiKey: z.string("API Key"),
	resourceName: z.string("Resource Name"),
	modelId: z.string("Model ID"),
	apiVersion: z.string("API Version").optional()
});
const providerAzureAIFoundry = defineProvider({
	id: "azure-ai-foundry",
	order: 17,
	name: "Azure AI Foundry",
	nameLocalize: ({ t }) => t("settings.pages.providers.provider.azure-ai-foundry.title"),
	description: "azure.com",
	descriptionLocalize: ({ t }) => t("settings.pages.providers.provider.azure-ai-foundry.description"),
	tasks: ["chat"],
	capabilities: { chat: { reasoning: { modes: ["enabled", "disabled"] } } },
	icon: "i-lobe-icons:microsoft",
	createProviderConfig: ({ t }) => azureAIFoundryConfigSchema.extend({
		apiKey: azureAIFoundryConfigSchema.shape.apiKey.meta({
			labelLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label"),
			descriptionLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description"),
			placeholderLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder"),
			type: "password"
		}),
		resourceName: azureAIFoundryConfigSchema.shape.resourceName.meta({
			labelLocalized: "Resource Name",
			descriptionLocalized: "Prefix used in https://<prefix>.services.ai.azure.com",
			placeholderLocalized: "my-resource"
		}),
		modelId: azureAIFoundryConfigSchema.shape.modelId.meta({
			labelLocalized: "Model ID",
			descriptionLocalized: "Model ID on Azure AI Foundry",
			placeholderLocalized: "gpt-4o"
		}),
		apiVersion: azureAIFoundryConfigSchema.shape.apiVersion.meta({
			labelLocalized: "API Version",
			descriptionLocalized: "API version for snapshot of the models",
			placeholderLocalized: "2025-04-01-preview",
			section: "advanced"
		})
	}),
	createProvider(config) {
		return createAzure({
			apiKey: async () => config.apiKey.trim(),
			resourceName: config.resourceName.trim(),
			apiVersion: config.apiVersion?.trim()
		}).then((baseProvider) => ({
			...baseProvider,
			chat(model, options) {
				const request = baseProvider.chat(model);
				if (!options?.reasoning) return request;
				return {
					...request,
					reasoningEffort: options.reasoning === "enabled" ? "medium" : "none"
				};
			}
		}));
	},
	extraMethods: { listModels: async (config) => [{
		id: config.modelId,
		name: config.modelId,
		provider: "azure-ai-foundry",
		description: "",
		contextLength: 0,
		deprecated: false
	}] },
	validationRequiredWhen(config) {
		return !!config.apiKey?.trim() || !!config.resourceName?.trim() || !!config.modelId?.trim();
	},
	validators: { validateConfig: [({ t }) => ({
		id: "azure-ai-foundry:check-config",
		name: t("settings.pages.providers.catalog.edit.validators.openai-compatible.check-config.title"),
		validator: async (config) => {
			const errors = [];
			const apiKey = typeof config.apiKey === "string" ? config.apiKey.trim() : "";
			const resourceName = typeof config.resourceName === "string" ? config.resourceName.trim() : "";
			const modelId = typeof config.modelId === "string" ? config.modelId.trim() : "";
			if (!apiKey) errors.push({ error: /* @__PURE__ */ new Error("API key is required.") });
			if (!resourceName) errors.push({ error: /* @__PURE__ */ new Error("Resource name is required.") });
			if (!modelId) errors.push({ error: /* @__PURE__ */ new Error("Model ID is required.") });
			return {
				errors,
				reason: errors.length > 0 ? errors.map((item) => item.error.message).join(", ") : "",
				reasonKey: "",
				valid: errors.length === 0
			};
		}
	})] }
});
//#endregion
//#region src/providers/tool-schema.ts
const JSON_SCHEMA_PRIMITIVE_TYPES = /* @__PURE__ */ new Set([
	"string",
	"number",
	"integer",
	"boolean",
	"null"
]);
function isJsonSchema$1(value) {
	return Boolean(value && !Array.isArray(value) && typeof value === "object");
}
function isJsonSchemaPrimitiveType(value) {
	return typeof value === "string" && JSON_SCHEMA_PRIMITIVE_TYPES.has(value);
}
/**
* Collapses primitive `anyOf` branches into one JSON Schema type array.
*
* Use this function in a provider adapter only after that provider rejects the
* canonical `anyOf` form.
*
* @example
* collapseToolSchemaPrimitiveAnyOf({
*   anyOf: [{ type: 'string' }, { type: 'null' }],
* })
* // => { type: ['string', 'null'] }
*/
function collapseToolSchemaPrimitiveAnyOf(schema) {
	const next = { ...schema };
	if (next.properties) {
		const properties = Object.fromEntries(Object.entries(next.properties).map(([key, value]) => {
			if (!isJsonSchema$1(value)) return [key, value];
			return [key, collapseToolSchemaPrimitiveAnyOf(value)];
		}));
		next.properties = properties;
		if (Array.isArray(next.required)) {
			const propertyNames = new Set(Object.keys(properties));
			next.required = next.required.filter((key) => propertyNames.has(key));
			if (next.required.length === 0) delete next.required;
		}
	}
	if (Array.isArray(next.items)) next.items = next.items.map((item) => isJsonSchema$1(item) ? collapseToolSchemaPrimitiveAnyOf(item) : item);
	else if (isJsonSchema$1(next.items)) next.items = collapseToolSchemaPrimitiveAnyOf(next.items);
	if (next.anyOf) {
		next.anyOf = next.anyOf.map((value) => isJsonSchema$1(value) ? collapseToolSchemaPrimitiveAnyOf(value) : value);
		const normalizedEntries = next.anyOf.filter(isJsonSchema$1);
		const primitiveTypes = normalizedEntries.map((entry) => entry.type).filter(isJsonSchemaPrimitiveType);
		const dedupedPrimitiveTypes = [...new Set(primitiveTypes)];
		if (primitiveTypes.length === normalizedEntries.length && dedupedPrimitiveTypes.length > 0) {
			for (const entry of normalizedEntries) {
				if (entry.type !== "number" && entry.type !== "integer") continue;
				next.multipleOf ??= entry.multipleOf;
				next.minimum ??= entry.minimum;
				next.maximum ??= entry.maximum;
				next.exclusiveMinimum ??= entry.exclusiveMinimum;
				next.exclusiveMaximum ??= entry.exclusiveMaximum;
			}
			delete next.anyOf;
			next.type = dedupedPrimitiveTypes;
		}
	}
	if (next.oneOf) next.oneOf = next.oneOf.map((value) => isJsonSchema$1(value) ? collapseToolSchemaPrimitiveAnyOf(value) : value);
	return next;
}
//#endregion
//#region src/providers/cloud/azure-openai/index.ts
const AZURE_OPENAI_PROVIDER_ID = "azure-openai";
const DEFAULT_COMPLETIONS_API_VERSION = "2024-04-01-preview";
const DEFAULT_AZURE_BASE_URL = "https://YOUR_RESOURCE_NAME.cognitiveservices.azure.com/openai/";
const FALLBACK_AZURE_ORIGIN = "https://YOUR_RESOURCE_NAME.cognitiveservices.azure.com";
const DEFAULT_AZURE_OPENAI_COMPATIBLE_BASE_URL = `${FALLBACK_AZURE_ORIGIN}/openai/v1`;
const DEPLOYMENT_CHAT_COMPLETIONS_PATH_REGEX = /\/openai\/deployments\/[^/]+\/chat\/completions\/?$/i;
const OPENAI_PATH_REGEX = /^\/openai\/?$/i;
const DEPLOYMENT_MATCH_REGEX = /\/openai\/deployments\/([^/]+)\/chat\/completions\/?$/i;
const CHAT_COMPLETIONS_PATH_REGEX = /\/chat\/completions\/?$/i;
const TRAILING_SLASH_REGEX = /\/$/;
const azureOpenAIConfigSchema = z.object({
	apiKey: z.string("API Key"),
	baseUrl: z.string("Base URL").optional().default(DEFAULT_AZURE_BASE_URL),
	completionsApiVersion: z.string("Completions API Version").optional().default(DEFAULT_COMPLETIONS_API_VERSION)
});
function resolveProviderBaseUrl(input) {
	const trimmed = input.trim();
	if (!trimmed) return DEFAULT_AZURE_OPENAI_COMPATIBLE_BASE_URL;
	try {
		const parsed = new URL(trimmed);
		if (DEPLOYMENT_CHAT_COMPLETIONS_PATH_REGEX.test(parsed.pathname) || OPENAI_PATH_REGEX.test(parsed.pathname)) return `${parsed.origin}/openai/v1`;
	} catch {}
	return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}
function parseAzureEndpointHints(baseUrl) {
	const raw = (baseUrl || "").trim();
	if (!raw) return { origin: FALLBACK_AZURE_ORIGIN };
	try {
		const parsed = new URL(raw);
		const apiVersionFromUrl = parsed.searchParams.get("api-version")?.trim();
		const deploymentMatch = parsed.pathname.match(DEPLOYMENT_MATCH_REGEX);
		if (deploymentMatch?.[1]) return {
			origin: parsed.origin,
			completionsUrl: `${parsed.origin}${parsed.pathname}${parsed.search}`,
			completionsDeployment: decodeURIComponent(deploymentMatch[1]),
			apiVersionFromUrl
		};
		return {
			origin: parsed.origin,
			apiVersionFromUrl
		};
	} catch {
		return { origin: FALLBACK_AZURE_ORIGIN };
	}
}
function resolveCompletionsApiVersion(config, hints) {
	return (hints.apiVersionFromUrl || config.completionsApiVersion || DEFAULT_COMPLETIONS_API_VERSION).trim();
}
function resolveConfiguredDeployments(config) {
	const endpointHints = parseAzureEndpointHints(config.baseUrl);
	return endpointHints.completionsDeployment ? [endpointHints.completionsDeployment] : [];
}
function isRecord(value) {
	return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
function isJsonSchema(value) {
	return isRecord(value);
}
/**
* Converts primitive tool unions to the form that Azure OpenAI accepts.
*
* @example
* normalizeAzureOpenAIChatTools([{
*   function: { parameters: { anyOf: [{ type: 'string' }, { type: 'null' }] } },
* }])
* // => [{ function: { parameters: { type: ['string', 'null'] } } }]
*/
function normalizeAzureOpenAIChatTools(tools) {
	if (!Array.isArray(tools)) return tools;
	return tools.map((tool) => {
		if (!isRecord(tool) || !isRecord(tool.function)) return tool;
		const parameters = tool.function.parameters;
		if (!isJsonSchema(parameters)) return tool;
		return {
			...tool,
			function: {
				...tool.function,
				parameters: collapseToolSchemaPrimitiveAnyOf(parameters)
			}
		};
	});
}
function mapChatBodyToCompletions(body) {
	const mappedBody = {
		...body,
		messages: body.messages,
		max_completion_tokens: body.max_completion_tokens ?? body.max_output_tokens ?? body.max_tokens,
		tools: normalizeAzureOpenAIChatTools(body.tools)
	};
	delete mappedBody.input;
	delete mappedBody.max_output_tokens;
	return mappedBody;
}
function createAzureOpenAIFetch(config) {
	const endpointHints = parseAzureEndpointHints(config.baseUrl);
	const completionsApiVersion = resolveCompletionsApiVersion(config, endpointHints);
	const apiKey = (config.apiKey || "").trim();
	return async (input, init) => {
		const request = new Request(input, init);
		const url = new URL(request.url);
		if (!(request.method.toUpperCase() === "POST" && CHAT_COMPLETIONS_PATH_REGEX.test(url.pathname))) return fetch(request);
		const requestBody = await request.clone().json().catch(() => null);
		if (!isRecord(requestBody)) return fetch(request);
		const deployment = endpointHints.completionsDeployment || (typeof requestBody.model === "string" ? requestBody.model.trim() : "");
		if (!deployment) return fetch(request);
		const completionsUrl = endpointHints.completionsUrl ? new URL(endpointHints.completionsUrl) : new URL(`${endpointHints.origin}/openai/deployments/${encodeURIComponent(deployment)}/chat/completions`);
		if (!completionsUrl.searchParams.get("api-version")) completionsUrl.searchParams.set("api-version", completionsApiVersion);
		const headers = new Headers(request.headers);
		headers.set("api-key", apiKey);
		headers.set("content-type", "application/json");
		const mappedBody = mapChatBodyToCompletions(requestBody);
		return fetch(completionsUrl.toString(), {
			method: "POST",
			headers,
			body: JSON.stringify(mappedBody),
			signal: request.signal
		});
	};
}
const providerAzureOpenAI = defineProvider({
	id: "azure-openai",
	order: 2,
	name: "Azure OpenAI",
	nameLocalize: ({ t }) => t("settings.pages.providers.provider.azure-openai.title"),
	description: "Azure OpenAI API",
	descriptionLocalize: ({ t }) => t("settings.pages.providers.provider.azure-openai.description"),
	tasks: ["chat"],
	icon: "i-simple-icons:microsoftazure",
	extraMethods: { listModels: async (config, _provider) => {
		return resolveConfiguredDeployments(config).map((model) => ({
			id: model,
			name: model,
			provider: AZURE_OPENAI_PROVIDER_ID,
			description: "Azure deployment"
		}));
	} },
	createProviderConfig: ({ t }) => azureOpenAIConfigSchema.extend({
		apiKey: azureOpenAIConfigSchema.shape.apiKey.meta({
			labelLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label"),
			descriptionLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description"),
			placeholderLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder"),
			type: "password"
		}),
		baseUrl: azureOpenAIConfigSchema.shape.baseUrl.meta({
			labelLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label"),
			descriptionLocalized: "Azure endpoint or full Chat Completions URL. Full URL is recommended.",
			placeholderLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder")
		}),
		completionsApiVersion: azureOpenAIConfigSchema.shape.completionsApiVersion.meta({
			labelLocalized: "Completions API Version",
			descriptionLocalized: "Used for Azure Chat Completions API requests.",
			placeholderLocalized: "2024-04-01-preview",
			section: "advanced"
		})
	}),
	createProvider(config) {
		const normalizedBaseUrl = resolveProviderBaseUrl(config.baseUrl || DEFAULT_AZURE_BASE_URL);
		const provider = createOpenAI(config.apiKey || "", normalizedBaseUrl);
		const fetch = createAzureOpenAIFetch(config);
		return {
			...provider,
			model: (...args) => ({
				...provider.model(...args),
				fetch
			}),
			chat: (...args) => ({
				...provider.chat(...args),
				fetch
			}),
			embed: (...args) => ({
				...provider.embed(...args),
				fetch
			}),
			image: (...args) => ({
				...provider.image(...args),
				fetch
			}),
			speech: (...args) => ({
				...provider.speech(...args),
				fetch
			}),
			transcription: (...args) => ({
				...provider.transcription(...args),
				fetch
			})
		};
	},
	validationRequiredWhen(config) {
		return !!config.apiKey?.trim();
	},
	validators: {
		validateConfig: [({ t }) => ({
			id: "azure-openai:check-config",
			name: t("settings.pages.providers.catalog.edit.validators.openai-compatible.check-config.title"),
			validator: async (config) => {
				const errors = [];
				const apiKey = typeof config.apiKey === "string" ? config.apiKey.trim() : "";
				const baseUrl = typeof config.baseUrl === "string" ? config.baseUrl.trim() : "";
				if (!apiKey) errors.push({ error: /* @__PURE__ */ new Error("API key is required.") });
				if (!baseUrl) errors.push({ error: /* @__PURE__ */ new Error("Base URL is required.") });
				else try {
					if (!new URL(baseUrl).host) errors.push({ error: /* @__PURE__ */ new Error("Base URL is not absolute. Check your input.") });
				} catch {
					errors.push({ error: /* @__PURE__ */ new Error("Base URL is invalid. It must be an absolute URL.") });
				}
				return {
					errors,
					reason: errors.length > 0 ? errors.map((item) => item.error.message).join(", ") : "",
					reasonKey: "",
					valid: errors.length === 0
				};
			}
		})],
		validateProvider: [({ t }) => ({
			id: "azure-openai:check-completions-connectivity",
			name: t("settings.pages.providers.catalog.edit.validators.openai-compatible.check-connectivity.title"),
			validator: async (config) => {
				const errors = [];
				const apiKey = typeof config.apiKey === "string" ? config.apiKey.trim() : "";
				const baseUrlRaw = typeof config.baseUrl === "string" ? config.baseUrl.trim() : "";
				const endpointHints = parseAzureEndpointHints(baseUrlRaw);
				const completionsApiVersion = resolveCompletionsApiVersion(config, endpointHints);
				const deployment = endpointHints.completionsDeployment || "";
				if (!apiKey || !baseUrlRaw) return {
					errors: [{ error: /* @__PURE__ */ new Error("API key and Base URL are required.") }],
					reason: "API key and Base URL are required.",
					reasonKey: "",
					valid: false
				};
				try {
					if (!deployment) {
						const normalizedBaseUrl = resolveProviderBaseUrl(baseUrlRaw);
						const modelsUrl = new URL(`${normalizedBaseUrl.replace(TRAILING_SLASH_REGEX, "")}/models`);
						const response = await fetch(modelsUrl.toString(), {
							method: "GET",
							headers: { "api-key": apiKey }
						});
						if (response.status === 401 || response.status === 403) {
							const responseText = await response.text();
							errors.push({ error: /* @__PURE__ */ new Error(`Authentication failed (${response.status}). Check API key / endpoint. Response: ${responseText || "empty"}`) });
						} else if (response.status >= 500) {
							const responseText = await response.text();
							errors.push({ error: /* @__PURE__ */ new Error(`Server error (${response.status}). Response: ${responseText || "empty"}`) });
						}
					} else {
						const completionsUrl = endpointHints.completionsUrl ? new URL(endpointHints.completionsUrl) : new URL(`${endpointHints.origin}/openai/deployments/${encodeURIComponent(deployment)}/chat/completions`);
						if (!completionsUrl.searchParams.get("api-version")) completionsUrl.searchParams.set("api-version", completionsApiVersion);
						const response = await fetch(completionsUrl.toString(), {
							method: "POST",
							headers: {
								"api-key": apiKey,
								"content-type": "application/json"
							},
							body: JSON.stringify({
								model: deployment,
								messages: [{
									role: "user",
									content: "ping"
								}],
								max_tokens: 1
							})
						});
						if (response.status >= 400) {
							const responseText = await response.text();
							if (response.status === 400) return {
								errors,
								reason: "",
								reasonKey: "",
								valid: true
							};
							if (response.status === 401 || response.status === 403) errors.push({ error: /* @__PURE__ */ new Error(`Authentication failed (${response.status}). Check API key / endpoint. Response: ${responseText || "empty"}`) });
							else if (response.status === 404) errors.push({ error: /* @__PURE__ */ new Error(`Deployment or endpoint not found (${response.status}). Check Base URL and API version. Response: ${responseText || "empty"}`) });
							else if (response.status >= 500) errors.push({ error: /* @__PURE__ */ new Error(`Server error (${response.status}). Response: ${responseText || "empty"}`) });
							else errors.push({ error: /* @__PURE__ */ new Error(`Completions connectivity check returned ${response.status}. Response: ${responseText || "empty"}`) });
						}
					}
				} catch (error) {
					errors.push({ error: /* @__PURE__ */ new Error(`Connectivity check failed: ${errorMessageFrom(error) || "Unknown error."}`) });
				}
				return {
					errors,
					reason: errors.length > 0 ? errors.map((item) => item.error.message).join(", ") : "",
					reasonKey: "",
					valid: errors.length === 0
				};
			}
		})]
	}
});
//#endregion
//#region src/providers/cloud/ark-shared.ts
const arkProviderConfigSchema = z.object({
	apiKey: z.string("API Key"),
	baseUrl: z.string("Base URL")
});
function stripModelPrefix(modelId, modelPrefix) {
	return modelId.startsWith(modelPrefix) ? modelId.slice(modelPrefix.length) : modelId;
}
function createArkChatProviderDefinition(options) {
	const { id, order, name, nameKey, description, descriptionKey, modelPrefix, defaultBaseUrl, icon, iconColor, models } = options;
	return defineProvider({
		id,
		order,
		name,
		nameLocalize: ({ t }) => t(nameKey),
		description,
		descriptionLocalize: ({ t }) => t(descriptionKey),
		tasks: ["chat"],
		capabilities: { chat: { reasoning: { modes: ["enabled", "disabled"] } } },
		icon,
		iconColor,
		createProviderConfig: ({ t }) => arkProviderConfigSchema.extend({
			apiKey: arkProviderConfigSchema.shape.apiKey.meta({
				labelLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label"),
				descriptionLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description"),
				placeholderLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder"),
				type: "password"
			}),
			baseUrl: arkProviderConfigSchema.shape.baseUrl.default(defaultBaseUrl).meta({
				labelLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label"),
				descriptionLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description"),
				placeholderLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder")
			})
		}),
		createProvider(config) {
			const provider = createOpenAI(config.apiKey ?? "", config.baseUrl ?? defaultBaseUrl);
			const originalChat = provider.chat.bind(provider);
			return {
				...provider,
				chat(model, requestOptions) {
					const request = originalChat(stripModelPrefix(model, modelPrefix));
					if (!requestOptions?.reasoning) return request;
					return {
						...request,
						thinking: { type: requestOptions.reasoning }
					};
				}
			};
		},
		extraMethods: { listModels: async (_config, _provider, contextOptions) => models.map((model) => {
			const modelInfo = {
				id: `${modelPrefix}${model.id}`,
				name: model.id,
				provider: id
			};
			if (model.contextLength !== void 0) modelInfo.contextLength = model.contextLength;
			if (model.deprecated !== void 0) modelInfo.deprecated = model.deprecated;
			if (model.descriptionKey !== void 0 && contextOptions) modelInfo.description = contextOptions.t(model.descriptionKey);
			return modelInfo;
		}) },
		validationRequiredWhen(config) {
			return !!config.apiKey?.trim();
		},
		validators: { ...createOpenAICompatibleValidators({
			checks: [
				"connectivity",
				"model_list",
				"chat_completions"
			],
			normalizeModelId: (modelId) => stripModelPrefix(modelId, modelPrefix)
		}) }
	});
}
//#endregion
//#region src/providers/cloud/byteplus/index.ts
const providerBytePlus = createArkChatProviderDefinition({
	id: "byteplus",
	order: 8,
	name: "BytePlus",
	nameKey: "settings.pages.providers.provider.byteplus.title",
	description: "BytePlus",
	descriptionKey: "settings.pages.providers.provider.byteplus.description",
	modelPrefix: "byteplus/",
	defaultBaseUrl: "https://ark.ap-southeast.bytepluses.com/api/v3",
	icon: "i-lobe-icons:bytedance",
	iconColor: "i-lobe-icons:bytedance-color",
	models: [
		{
			id: "seed-2-0-pro-260328",
			contextLength: 256e3
		},
		{
			id: "seed-2-0-lite-260228",
			contextLength: 256e3
		},
		{
			id: "seed-2-0-mini-260215",
			contextLength: 256e3
		},
		{
			id: "kimi-k2-5-260127",
			contextLength: 256e3
		},
		{
			id: "glm-4-7-251222",
			contextLength: 2e5
		}
	]
});
//#endregion
//#region src/providers/cloud/byteplus-coding-plan/index.ts
const providerBytePlusCodingPlan = createArkChatProviderDefinition({
	id: "byteplus-coding-plan",
	order: 9,
	name: "BytePlus Coding Plan",
	nameKey: "settings.pages.providers.provider.byteplus-coding-plan.title",
	description: "BytePlus Coding Plan",
	descriptionKey: "settings.pages.providers.provider.byteplus-coding-plan.description",
	modelPrefix: "byteplus-coding-plan/",
	defaultBaseUrl: "https://ark.ap-southeast.bytepluses.com/api/coding/v3",
	icon: "i-lobe-icons:bytedance",
	iconColor: "i-lobe-icons:bytedance-color",
	models: [
		{ id: "dola-seed-2.0-pro" },
		{ id: "dola-seed-2.0-lite" },
		{ id: "bytedance-seed-code" },
		{ id: "glm-4.7" },
		{ id: "kimi-k2.5" },
		{ id: "gpt-oss-120b" }
	]
});
//#endregion
//#region src/providers/cloud/cerebras-ai/index.ts
const cerebrasConfigSchema = z.object({
	apiKey: z.string("API Key"),
	baseUrl: z.string("Base URL").optional().default("https://api.cerebras.ai/v1/")
});
const providerCerebrasAI = defineProvider({
	id: "cerebras-ai",
	name: "Cerebras",
	nameLocalize: ({ t }) => t("settings.pages.providers.provider.cerebras.title"),
	description: "cerebras.ai",
	descriptionLocalize: ({ t }) => t("settings.pages.providers.provider.cerebras.description"),
	tasks: ["chat"],
	capabilities: { chat: { reasoning: { modes: ["enabled", "disabled"] } } },
	icon: "i-lobe-icons:cerebras",
	iconColor: "i-lobe-icons:cerebras-color",
	createProviderConfig: ({ t }) => cerebrasConfigSchema.extend({
		apiKey: cerebrasConfigSchema.shape.apiKey.meta({
			labelLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label"),
			descriptionLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description"),
			placeholderLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder"),
			type: "password"
		}),
		baseUrl: cerebrasConfigSchema.shape.baseUrl.meta({
			labelLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label"),
			descriptionLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description"),
			placeholderLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder")
		})
	}),
	createProvider(config) {
		const provider = createCerebras(config.apiKey, config.baseUrl);
		return {
			...provider,
			chat(model, options) {
				const request = provider.chat(model);
				if (!options?.reasoning) return request;
				return {
					...request,
					reasoningEffort: options.reasoning === "enabled" ? "medium" : "none"
				};
			}
		};
	},
	validationRequiredWhen(config) {
		return !!config.apiKey?.trim();
	},
	validators: { ...createOpenAICompatibleValidators({ checks: [
		"connectivity",
		"model_list",
		"chat_completions"
	] }) }
});
//#endregion
//#region src/providers/cloud/cloudflare-workers-ai/index.ts
const cloudflareWorkersAIConfigSchema = z.object({
	apiKey: z.string("API Key"),
	accountId: z.string("Account ID")
});
const providerCloudflareWorkersAI = defineProvider({
	id: "cloudflare-workers-ai",
	name: "Cloudflare Workers AI",
	nameLocalize: ({ t }) => t("settings.pages.providers.provider.cloudflare-workers-ai.title"),
	description: "Cloudflare Workers AI with account-scoped credentials.",
	descriptionLocalize: ({ t }) => t("settings.pages.providers.provider.cloudflare-workers-ai.description"),
	tasks: ["chat"],
	icon: "i-simple-icons:cloudflare",
	iconColor: "i-lobe-icons:cloudflare-color",
	createProviderConfig: ({ t }) => cloudflareWorkersAIConfigSchema.extend({
		apiKey: cloudflareWorkersAIConfigSchema.shape.apiKey.meta({
			labelLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label"),
			descriptionLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description"),
			placeholderLocalized: t("settings.pages.providers.provider.cloudflare-workers-ai.fields.field.api-key.placeholder"),
			type: "password"
		}),
		accountId: cloudflareWorkersAIConfigSchema.shape.accountId.meta({
			labelLocalized: t("settings.pages.providers.provider.cloudflare-workers-ai.fields.field.account-id.label"),
			descriptionLocalized: t("settings.pages.providers.provider.cloudflare-workers-ai.fields.field.account-id.description"),
			placeholderLocalized: t("settings.pages.providers.provider.cloudflare-workers-ai.fields.field.account-id.placeholder")
		})
	}),
	createProvider(config) {
		return createWorkersAI(config.apiKey, config.accountId);
	},
	validationRequiredWhen: (config) => {
		return !!config.apiKey && !!config.accountId;
	},
	validators: { validateConfig: [({ t }) => ({
		id: "cloudflare-workers-ai:check-config",
		name: t("settings.pages.providers.catalog.edit.validators.openai-compatible.check-config.title"),
		validator: async (config) => {
			const errors = [];
			const apiKey = typeof config.apiKey === "string" ? config.apiKey.trim() : "";
			const accountId = typeof config.accountId === "string" ? config.accountId.trim() : "";
			if (!apiKey) errors.push({ error: /* @__PURE__ */ new Error("API token is required.") });
			if (!accountId) errors.push({ error: /* @__PURE__ */ new Error("Account ID is required.") });
			return {
				errors,
				reason: errors.length > 0 ? errors.map((item) => item.error.message).join(", ") : "",
				reasonKey: "",
				valid: errors.length === 0
			};
		}
	})] }
});
//#endregion
//#region src/providers/cloud/comet-api/index.ts
const cometApiConfigSchema = z.object({
	apiKey: z.string("API Key"),
	baseUrl: z.string("Base URL").optional().default("https://api.cometapi.com/v1/")
});
const providerCometAPI = defineProvider({
	id: "comet-api",
	name: "CometAPI",
	nameLocalize: ({ t }) => t("settings.pages.providers.provider.comet-api.title"),
	description: "cometapi.com",
	descriptionLocalize: ({ t }) => t("settings.pages.providers.provider.comet-api.description"),
	tasks: ["chat"],
	icon: "i-lobe-icons:cometapi",
	iconColor: "i-lobe-icons:cometapi-color",
	createProviderConfig: ({ t }) => cometApiConfigSchema.extend({
		apiKey: cometApiConfigSchema.shape.apiKey.meta({
			labelLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label"),
			descriptionLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description"),
			placeholderLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder"),
			type: "password"
		}),
		baseUrl: cometApiConfigSchema.shape.baseUrl.meta({
			labelLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label"),
			descriptionLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description"),
			placeholderLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder")
		})
	}),
	createProvider(config) {
		return merge(createChatProvider({
			apiKey: config.apiKey,
			baseURL: config.baseUrl
		}), createModelProvider({
			apiKey: config.apiKey,
			baseURL: config.baseUrl
		}));
	},
	validationRequiredWhen(config) {
		return !!config.apiKey?.trim();
	},
	validators: { ...createOpenAICompatibleValidators({ checks: ["model_list", "chat_completions"] }) }
});
const providerCometAPISpeech = defineProvider({
	id: "comet-api-speech",
	name: "CometAPI Speech",
	nameLocalize: ({ t }) => t("settings.pages.providers.provider.comet-api.title"),
	description: "cometapi.com",
	descriptionLocalize: ({ t }) => t("settings.pages.providers.provider.comet-api.description"),
	tasks: ["text-to-speech"],
	icon: "i-lobe-icons:cometapi",
	createProviderConfig: providerCometAPI.createProviderConfig,
	createProvider(config) {
		return merge(createModelProvider({
			apiKey: config.apiKey,
			baseURL: config.baseUrl
		}), createSpeechProvider({
			apiKey: config.apiKey,
			baseURL: config.baseUrl
		}));
	},
	validationRequiredWhen: (config) => Boolean(config.apiKey?.trim()),
	validators: createOpenAICompatibleValidators({ checks: ["model_list"] })
});
const providerCometAPITranscription = defineProvider({
	id: "comet-api-transcription",
	name: "CometAPI Transcription",
	nameLocalize: ({ t }) => t("settings.pages.providers.provider.comet-api.title"),
	description: "cometapi.com",
	descriptionLocalize: ({ t }) => t("settings.pages.providers.provider.comet-api.description"),
	tasks: [
		"speech-to-text",
		"automatic-speech-recognition",
		"asr",
		"stt"
	],
	icon: "i-lobe-icons:cometapi",
	capabilities: { transcription: {
		protocol: "http",
		generateOutput: true,
		streamOutput: false,
		streamInput: false
	} },
	createProviderConfig: providerCometAPI.createProviderConfig,
	createProvider(config) {
		const provider = merge(createModelProvider({
			apiKey: config.apiKey,
			baseURL: config.baseUrl
		}), createTranscriptionProvider({
			apiKey: config.apiKey,
			baseURL: config.baseUrl
		}));
		const transcription = provider.transcription.bind(provider);
		provider.transcription = (model, extraOptions) => ({
			...transcription(model),
			...extraOptions
		});
		return provider;
	},
	validationRequiredWhen: (config) => Boolean(config.apiKey?.trim()),
	validators: createOpenAICompatibleValidators({ checks: ["model_list"] })
});
//#endregion
//#region src/providers/cloud/deepseek/index.ts
const deepSeekConfigSchema = z.object({
	apiKey: z.string("API Key"),
	baseUrl: z.string("Base URL").optional().default("https://api.deepseek.com/"),
	thinkingMode: z.enum([
		"auto",
		"disable",
		"enable"
	]).default("auto")
});
function normalizeDeepSeekThinkingMode(value) {
	switch (value) {
		case "auto":
		case "disable":
		case "enable": return value;
		default: return "auto";
	}
}
function resolveDeepSeekThinking(modeRaw) {
	switch (normalizeDeepSeekThinkingMode(modeRaw)) {
		case "auto": return;
		case "disable": return { type: "disabled" };
		case "enable": return { type: "enabled" };
		default: return;
	}
}
const providerDeepSeek = defineProvider({
	id: "deepseek",
	order: 4,
	name: "DeepSeek",
	nameLocalize: ({ t }) => t("settings.pages.providers.provider.deepseek.title"),
	description: "deepseek.com",
	descriptionLocalize: ({ t }) => t("settings.pages.providers.provider.deepseek.description"),
	tasks: ["chat"],
	capabilities: { chat: { reasoning: { modes: ["enabled", "disabled"] } } },
	icon: "i-lobe-icons:deepseek",
	iconColor: "i-lobe-icons:deepseek-color",
	createProviderConfig: ({ t }) => deepSeekConfigSchema.extend({
		apiKey: deepSeekConfigSchema.shape.apiKey.meta({
			labelLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label"),
			descriptionLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description"),
			placeholderLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder"),
			type: "password"
		}),
		baseUrl: deepSeekConfigSchema.shape.baseUrl.meta({
			labelLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label"),
			descriptionLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description"),
			placeholderLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder")
		}),
		thinkingMode: deepSeekConfigSchema.shape.thinkingMode.meta({
			labelLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.thinking-mode.label"),
			descriptionLocalized: t("settings.pages.providers.provider.deepseek.fields.field.thinking-mode.description"),
			section: "advanced",
			type: "select",
			options: [
				{
					label: t("settings.pages.providers.catalog.edit.config.common.fields.field.thinking-mode.options.auto"),
					value: "auto"
				},
				{
					label: t("settings.pages.providers.catalog.edit.config.common.fields.field.thinking-mode.options.disable"),
					value: "disable"
				},
				{
					label: t("settings.pages.providers.catalog.edit.config.common.fields.field.thinking-mode.options.enable"),
					value: "enable"
				}
			]
		})
	}),
	createProvider(config) {
		const baseProvider = createDeepSeek(config.apiKey, config.baseUrl);
		return {
			...baseProvider,
			chat(model, options) {
				const chatOptions = baseProvider.chat(model);
				if (options?.reasoning) return {
					...chatOptions,
					thinking: { type: options.reasoning }
				};
				const thinking = resolveDeepSeekThinking(config.thinkingMode);
				if (thinking === void 0) return chatOptions;
				return {
					...chatOptions,
					thinking
				};
			}
		};
	},
	validationRequiredWhen(config) {
		return !!config.apiKey?.trim();
	},
	validators: { ...createOpenAICompatibleValidators({ checks: [
		"connectivity",
		"model_list",
		"chat_completions"
	] }) }
});
//#endregion
//#region src/providers/cloud/elevenlabs/list-models.ts
const models = [
	{
		model_id: "eleven_multilingual_v2",
		name: "Eleven Multilingual v2",
		can_be_finetuned: true,
		can_do_text_to_speech: true,
		can_do_voice_conversion: false,
		can_use_style: true,
		can_use_speaker_boost: true,
		serves_pro_voices: false,
		token_cost_factor: 1,
		description: "Our most life-like, emotionally rich mode in 29 languages. Best for voice overs, audiobooks, post-production, or any other content creation needs.",
		requires_alpha_access: false,
		max_characters_request_free_user: 1e4,
		max_characters_request_subscribed_user: 1e4,
		maximum_text_length_per_request: 1e4,
		languages: [
			{
				language_id: "en",
				name: "English"
			},
			{
				language_id: "ja",
				name: "Japanese"
			},
			{
				language_id: "zh",
				name: "Chinese"
			},
			{
				language_id: "de",
				name: "German"
			},
			{
				language_id: "hi",
				name: "Hindi"
			},
			{
				language_id: "fr",
				name: "French"
			},
			{
				language_id: "ko",
				name: "Korean"
			},
			{
				language_id: "pt",
				name: "Portuguese"
			},
			{
				language_id: "it",
				name: "Italian"
			},
			{
				language_id: "es",
				name: "Spanish"
			},
			{
				language_id: "id",
				name: "Indonesian"
			},
			{
				language_id: "nl",
				name: "Dutch"
			},
			{
				language_id: "tr",
				name: "Turkish"
			},
			{
				language_id: "fil",
				name: "Filipino"
			},
			{
				language_id: "pl",
				name: "Polish"
			},
			{
				language_id: "sv",
				name: "Swedish"
			},
			{
				language_id: "bg",
				name: "Bulgarian"
			},
			{
				language_id: "ro",
				name: "Romanian"
			},
			{
				language_id: "ar",
				name: "Arabic"
			},
			{
				language_id: "cs",
				name: "Czech"
			},
			{
				language_id: "el",
				name: "Greek"
			},
			{
				language_id: "fi",
				name: "Finnish"
			},
			{
				language_id: "hr",
				name: "Croatian"
			},
			{
				language_id: "ms",
				name: "Malay"
			},
			{
				language_id: "sk",
				name: "Slovak"
			},
			{
				language_id: "da",
				name: "Danish"
			},
			{
				language_id: "ta",
				name: "Tamil"
			},
			{
				language_id: "uk",
				name: "Ukrainian"
			},
			{
				language_id: "ru",
				name: "Russian"
			}
		],
		model_rates: { character_cost_multiplier: 1 },
		concurrency_group: "standard"
	},
	{
		model_id: "eleven_flash_v2_5",
		name: "Eleven Flash v2.5",
		can_be_finetuned: true,
		can_do_text_to_speech: true,
		can_do_voice_conversion: false,
		can_use_style: false,
		can_use_speaker_boost: false,
		serves_pro_voices: false,
		token_cost_factor: 1,
		description: "Our ultra low latency model in 32 languages. Ideal for conversational use cases.",
		requires_alpha_access: false,
		max_characters_request_free_user: 4e4,
		max_characters_request_subscribed_user: 4e4,
		maximum_text_length_per_request: 4e4,
		languages: [
			{
				language_id: "en",
				name: "English"
			},
			{
				language_id: "ja",
				name: "Japanese"
			},
			{
				language_id: "zh",
				name: "Chinese"
			},
			{
				language_id: "de",
				name: "German"
			},
			{
				language_id: "hi",
				name: "Hindi"
			},
			{
				language_id: "fr",
				name: "French"
			},
			{
				language_id: "ko",
				name: "Korean"
			},
			{
				language_id: "pt",
				name: "Portuguese"
			},
			{
				language_id: "it",
				name: "Italian"
			},
			{
				language_id: "es",
				name: "Spanish"
			},
			{
				language_id: "ru",
				name: "Russian"
			},
			{
				language_id: "id",
				name: "Indonesian"
			},
			{
				language_id: "nl",
				name: "Dutch"
			},
			{
				language_id: "tr",
				name: "Turkish"
			},
			{
				language_id: "fil",
				name: "Filipino"
			},
			{
				language_id: "pl",
				name: "Polish"
			},
			{
				language_id: "sv",
				name: "Swedish"
			},
			{
				language_id: "bg",
				name: "Bulgarian"
			},
			{
				language_id: "ro",
				name: "Romanian"
			},
			{
				language_id: "ar",
				name: "Arabic"
			},
			{
				language_id: "cs",
				name: "Czech"
			},
			{
				language_id: "el",
				name: "Greek"
			},
			{
				language_id: "fi",
				name: "Finnish"
			},
			{
				language_id: "hr",
				name: "Croatian"
			},
			{
				language_id: "ms",
				name: "Malay"
			},
			{
				language_id: "sk",
				name: "Slovak"
			},
			{
				language_id: "da",
				name: "Danish"
			},
			{
				language_id: "ta",
				name: "Tamil"
			},
			{
				language_id: "uk",
				name: "Ukrainian"
			},
			{
				language_id: "hu",
				name: "Hungarian"
			},
			{
				language_id: "no",
				name: "Norwegian"
			},
			{
				language_id: "vi",
				name: "Vietnamese"
			}
		],
		model_rates: { character_cost_multiplier: .5 },
		concurrency_group: "turbo"
	},
	{
		model_id: "eleven_turbo_v2_5",
		name: "Eleven Turbo v2.5",
		can_be_finetuned: true,
		can_do_text_to_speech: true,
		can_do_voice_conversion: false,
		can_use_style: false,
		can_use_speaker_boost: false,
		serves_pro_voices: false,
		token_cost_factor: 1,
		description: "Our high quality, low latency model in 32 languages. Best for developer use cases where speed matters and you need non-English languages.",
		requires_alpha_access: false,
		max_characters_request_free_user: 4e4,
		max_characters_request_subscribed_user: 4e4,
		maximum_text_length_per_request: 4e4,
		languages: [
			{
				language_id: "en",
				name: "English"
			},
			{
				language_id: "ja",
				name: "Japanese"
			},
			{
				language_id: "zh",
				name: "Chinese"
			},
			{
				language_id: "de",
				name: "German"
			},
			{
				language_id: "hi",
				name: "Hindi"
			},
			{
				language_id: "fr",
				name: "French"
			},
			{
				language_id: "ko",
				name: "Korean"
			},
			{
				language_id: "pt",
				name: "Portuguese"
			},
			{
				language_id: "it",
				name: "Italian"
			},
			{
				language_id: "es",
				name: "Spanish"
			},
			{
				language_id: "ru",
				name: "Russian"
			},
			{
				language_id: "id",
				name: "Indonesian"
			},
			{
				language_id: "nl",
				name: "Dutch"
			},
			{
				language_id: "tr",
				name: "Turkish"
			},
			{
				language_id: "fil",
				name: "Filipino"
			},
			{
				language_id: "pl",
				name: "Polish"
			},
			{
				language_id: "sv",
				name: "Swedish"
			},
			{
				language_id: "bg",
				name: "Bulgarian"
			},
			{
				language_id: "ro",
				name: "Romanian"
			},
			{
				language_id: "ar",
				name: "Arabic"
			},
			{
				language_id: "cs",
				name: "Czech"
			},
			{
				language_id: "el",
				name: "Greek"
			},
			{
				language_id: "fi",
				name: "Finnish"
			},
			{
				language_id: "hr",
				name: "Croatian"
			},
			{
				language_id: "ms",
				name: "Malay"
			},
			{
				language_id: "sk",
				name: "Slovak"
			},
			{
				language_id: "da",
				name: "Danish"
			},
			{
				language_id: "ta",
				name: "Tamil"
			},
			{
				language_id: "uk",
				name: "Ukrainian"
			},
			{
				language_id: "vi",
				name: "Vietnamese"
			},
			{
				language_id: "no",
				name: "Norwegian"
			},
			{
				language_id: "hu",
				name: "Hungarian"
			}
		],
		model_rates: { character_cost_multiplier: .5 },
		concurrency_group: "turbo"
	},
	{
		model_id: "eleven_turbo_v2",
		name: "Eleven Turbo v2",
		can_be_finetuned: true,
		can_do_text_to_speech: true,
		can_do_voice_conversion: false,
		can_use_style: false,
		can_use_speaker_boost: false,
		serves_pro_voices: false,
		token_cost_factor: 1,
		description: "Our English-only, low latency model. Best for developer use cases where speed matters and you only need English. Performance is on par with Turbo v2.5.",
		requires_alpha_access: false,
		max_characters_request_free_user: 3e4,
		max_characters_request_subscribed_user: 3e4,
		maximum_text_length_per_request: 3e4,
		languages: [{
			language_id: "en",
			name: "English"
		}],
		model_rates: { character_cost_multiplier: .5 },
		concurrency_group: "turbo"
	},
	{
		model_id: "eleven_flash_v2",
		name: "Eleven Flash v2",
		can_be_finetuned: true,
		can_do_text_to_speech: true,
		can_do_voice_conversion: false,
		can_use_style: false,
		can_use_speaker_boost: false,
		serves_pro_voices: false,
		token_cost_factor: 1,
		description: "Our ultra low latency model in english. Ideal for conversational use cases.",
		requires_alpha_access: false,
		max_characters_request_free_user: 3e4,
		max_characters_request_subscribed_user: 3e4,
		maximum_text_length_per_request: 3e4,
		languages: [{
			language_id: "en",
			name: "English"
		}],
		model_rates: { character_cost_multiplier: .5 },
		concurrency_group: "turbo"
	},
	{
		model_id: "eleven_english_sts_v2",
		name: "Eleven English v2",
		can_be_finetuned: false,
		can_do_text_to_speech: false,
		can_do_voice_conversion: true,
		can_use_style: true,
		can_use_speaker_boost: true,
		serves_pro_voices: false,
		token_cost_factor: 1,
		description: "Our state-of-the-art speech to speech model suitable for scenarios where you need maximum control over the content and prosody of your generations.",
		requires_alpha_access: false,
		max_characters_request_free_user: 5e3,
		max_characters_request_subscribed_user: 5e3,
		maximum_text_length_per_request: 5e3,
		languages: [{
			language_id: "en",
			name: "English"
		}],
		model_rates: { character_cost_multiplier: 1 },
		concurrency_group: "standard"
	},
	{
		model_id: "eleven_multilingual_v1",
		name: "Eleven Multilingual v1",
		can_be_finetuned: false,
		can_do_text_to_speech: true,
		can_do_voice_conversion: false,
		can_use_style: false,
		can_use_speaker_boost: false,
		serves_pro_voices: false,
		token_cost_factor: 1,
		description: "Our first Multilingual model, capability of generating speech in 10 languages. Now outclassed by Multilingual v2 (for content creation) and Turbo v2.5 (for low latency use cases).",
		requires_alpha_access: false,
		max_characters_request_free_user: 1e4,
		max_characters_request_subscribed_user: 1e4,
		maximum_text_length_per_request: 1e4,
		languages: [
			{
				language_id: "en",
				name: "English"
			},
			{
				language_id: "de",
				name: "German"
			},
			{
				language_id: "pl",
				name: "Polish"
			},
			{
				language_id: "es",
				name: "Spanish"
			},
			{
				language_id: "it",
				name: "Italian"
			},
			{
				language_id: "fr",
				name: "French"
			},
			{
				language_id: "pt",
				name: "Portuguese"
			},
			{
				language_id: "hi",
				name: "Hindi"
			},
			{
				language_id: "ar",
				name: "Arabic"
			}
		],
		model_rates: { character_cost_multiplier: 1 },
		concurrency_group: "standard"
	},
	{
		model_id: "eleven_multilingual_sts_v2",
		name: "Eleven Multilingual v2",
		can_be_finetuned: true,
		can_do_text_to_speech: false,
		can_do_voice_conversion: true,
		can_use_style: true,
		can_use_speaker_boost: true,
		serves_pro_voices: false,
		token_cost_factor: 1,
		description: "Our cutting-edge, multilingual speech-to-speech model is designed for situations that demand unparalleled control over both the content and the prosody of the generated speech across various languages.",
		requires_alpha_access: false,
		max_characters_request_free_user: 1e4,
		max_characters_request_subscribed_user: 1e4,
		maximum_text_length_per_request: 1e4,
		languages: [
			{
				language_id: "en",
				name: "English"
			},
			{
				language_id: "ja",
				name: "Japanese"
			},
			{
				language_id: "zh",
				name: "Chinese"
			},
			{
				language_id: "de",
				name: "German"
			},
			{
				language_id: "hi",
				name: "Hindi"
			},
			{
				language_id: "fr",
				name: "French"
			},
			{
				language_id: "ko",
				name: "Korean"
			},
			{
				language_id: "pt",
				name: "Portuguese"
			},
			{
				language_id: "it",
				name: "Italian"
			},
			{
				language_id: "es",
				name: "Spanish"
			},
			{
				language_id: "ru",
				name: "Russian"
			},
			{
				language_id: "id",
				name: "Indonesian"
			},
			{
				language_id: "nl",
				name: "Dutch"
			},
			{
				language_id: "tr",
				name: "Turkish"
			},
			{
				language_id: "fil",
				name: "Filipino"
			},
			{
				language_id: "pl",
				name: "Polish"
			},
			{
				language_id: "sv",
				name: "Swedish"
			},
			{
				language_id: "bg",
				name: "Bulgarian"
			},
			{
				language_id: "ro",
				name: "Romanian"
			},
			{
				language_id: "ar",
				name: "Arabic"
			},
			{
				language_id: "cs",
				name: "Czech"
			},
			{
				language_id: "el",
				name: "Greek"
			},
			{
				language_id: "fi",
				name: "Finnish"
			},
			{
				language_id: "hr",
				name: "Croatian"
			},
			{
				language_id: "ms",
				name: "Malay"
			},
			{
				language_id: "sk",
				name: "Slovak"
			},
			{
				language_id: "da",
				name: "Danish"
			},
			{
				language_id: "ta",
				name: "Tamil"
			},
			{
				language_id: "uk",
				name: "Ukrainian"
			}
		],
		model_rates: { character_cost_multiplier: 1 },
		concurrency_group: "standard"
	},
	{
		model_id: "eleven_monolingual_v1",
		name: "Eleven English v1",
		can_be_finetuned: false,
		can_do_text_to_speech: true,
		can_do_voice_conversion: false,
		can_use_style: false,
		can_use_speaker_boost: false,
		serves_pro_voices: false,
		token_cost_factor: 1,
		description: "Our first ever text to speech model. Now outclassed by Multilingual v2 (for content creation) and Turbo v2.5 (for low latency use cases).",
		requires_alpha_access: false,
		max_characters_request_free_user: 1e4,
		max_characters_request_subscribed_user: 1e4,
		maximum_text_length_per_request: 1e4,
		languages: [{
			language_id: "en",
			name: "English"
		}],
		model_rates: { character_cost_multiplier: 1 },
		concurrency_group: "standard"
	}
];
//#endregion
//#region src/providers/cloud/elevenlabs/index.ts
const elevenLabsConfigSchema = z.object({
	apiKey: z.string(),
	baseUrl: z.string().default("https://unspeech.hyp3r.link/v1/"),
	voiceSettings: z.object({
		similarityBoost: z.number().default(.75),
		stability: z.number().default(.5)
	}).default({
		similarityBoost: .75,
		stability: .5
	})
});
function toListVoicesOptions$1(provider) {
	const { fetch: _fetch, ...voiceOptions } = provider.voice();
	return voiceOptions;
}
function createElevenLabsValidators() {
	return { validateConfig: [({ t }) => ({
		id: "elevenlabs:check-config",
		name: t("settings.pages.providers.catalog.edit.validators.openai-compatible.check-config.title"),
		validator: async (config) => {
			const errors = [];
			const apiKey = config.apiKey?.trim() ?? "";
			const baseUrl = config.baseUrl?.trim() ?? "";
			if (!apiKey) errors.push({ error: /* @__PURE__ */ new Error("API key is required.") });
			if (!baseUrl) errors.push({ error: /* @__PURE__ */ new Error("Base URL is required.") });
			else try {
				if (!new URL(baseUrl).host) errors.push({ error: /* @__PURE__ */ new Error("Base URL is not absolute. Try to include a scheme (http:// or https://).") });
				else if (!baseUrl.endsWith("/")) errors.push({ error: /* @__PURE__ */ new Error("Base URL must end with a trailing slash (/).") });
			} catch {
				errors.push({ error: /* @__PURE__ */ new Error("Base URL is not absolute. Try to include a scheme (http:// or https://).") });
			}
			return {
				errors,
				reason: errors.map((item) => item.error.message).join(", "),
				reasonKey: "",
				valid: errors.length === 0
			};
		}
	})] };
}
const providerElevenLabs = defineProvider({
	id: "elevenlabs",
	name: "ElevenLabs",
	nameLocalize: ({ t }) => t("settings.pages.providers.provider.elevenlabs.title"),
	description: "elevenlabs.io",
	descriptionLocalize: ({ t }) => t("settings.pages.providers.provider.elevenlabs.description"),
	tasks: ["text-to-speech"],
	icon: "i-simple-icons:elevenlabs",
	createProviderConfig: ({ t }) => elevenLabsConfigSchema.extend({
		apiKey: elevenLabsConfigSchema.shape.apiKey.meta({
			labelLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label"),
			descriptionLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description"),
			placeholderLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder"),
			type: "password"
		}),
		baseUrl: elevenLabsConfigSchema.shape.baseUrl.meta({
			labelLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label"),
			descriptionLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description"),
			placeholderLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder")
		})
	}),
	createProvider(config) {
		return createUnElevenLabs(config.apiKey.trim(), config.baseUrl?.trim() ?? "https://unspeech.hyp3r.link/v1/");
	},
	validationRequiredWhen: (config) => Boolean(config.apiKey?.trim() && config.baseUrl?.trim()),
	validators: createElevenLabsValidators(),
	extraMethods: {
		listModels: async () => models.map((model) => ({
			id: model.model_id,
			name: model.name,
			provider: "elevenlabs",
			description: model.description,
			contextLength: 0,
			deprecated: false
		})),
		voiceCatalogConfig: ({ apiKey, baseUrl }) => ({
			apiKey,
			baseUrl
		}),
		listVoices: async (config) => {
			const provider = createUnElevenLabs(config.apiKey.trim(), config.baseUrl?.trim() ?? "https://unspeech.hyp3r.link/v1/");
			const voices = await listVoices(toListVoicesOptions$1(provider));
			if (!Array.isArray(voices)) return [];
			const ariaIndex = voices.findIndex((voice) => voice.name.includes("Aria"));
			const billIndex = voices.findIndex((voice) => voice.name.includes("Bill"));
			const startIndex = ariaIndex !== -1 ? ariaIndex : 0;
			const endIndex = billIndex !== -1 ? billIndex : voices.length - 1;
			const lowerIndex = Math.min(startIndex, endIndex);
			const higherIndex = Math.max(startIndex, endIndex);
			return [
				...voices.slice(0, lowerIndex),
				...voices.slice(higherIndex + 1),
				...voices.slice(lowerIndex, higherIndex + 1)
			].map((voice) => ({
				id: voice.id,
				name: voice.name,
				provider: "elevenlabs",
				previewURL: voice.preview_audio_url,
				languages: voice.languages
			}));
		}
	}
});
//#endregion
//#region src/providers/cloud/featherless-ai/index.ts
const featherlessConfigSchema = z.object({
	apiKey: z.string("API Key"),
	baseUrl: z.string("Base URL").optional().default("https://api.featherless.ai/v1/")
});
const providerFeatherlessAI = defineProvider({
	id: "featherless-ai",
	name: "Featherless.ai",
	nameLocalize: ({ t }) => t("settings.pages.providers.provider.featherless.title"),
	description: "featherless.ai",
	descriptionLocalize: ({ t }) => t("settings.pages.providers.provider.featherless.description"),
	tasks: ["chat"],
	capabilities: { chat: { reasoning: { modes: ["enabled", "disabled"] } } },
	icon: "i-lobe-icons:featherless-color",
	createProviderConfig: ({ t }) => featherlessConfigSchema.extend({
		apiKey: featherlessConfigSchema.shape.apiKey.meta({
			labelLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label"),
			descriptionLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description"),
			placeholderLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder"),
			type: "password"
		}),
		baseUrl: featherlessConfigSchema.shape.baseUrl.meta({
			labelLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label"),
			descriptionLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description"),
			placeholderLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder")
		})
	}),
	createProvider(config) {
		const provider = createOpenAI(config.apiKey, config.baseUrl);
		return {
			...provider,
			chat(model, options) {
				const request = provider.chat(model);
				if (!options?.reasoning) return request;
				return {
					...request,
					chatTemplateKwargs: { enable_thinking: options.reasoning === "enabled" }
				};
			}
		};
	},
	validationRequiredWhen(config) {
		return !!config.apiKey?.trim();
	},
	validators: { ...createOpenAICompatibleValidators({ checks: [
		"connectivity",
		"model_list",
		"chat_completions"
	] }) }
});
//#endregion
//#region src/providers/cloud/fireworks-ai/index.ts
const fireworksConfigSchema = z.object({
	apiKey: z.string("API Key"),
	baseUrl: z.string("Base URL").optional().default("https://api.fireworks.ai/inference/v1/")
});
const providerFireworksAI = defineProvider({
	id: "fireworks-ai",
	name: "Fireworks.ai",
	nameLocalize: ({ t }) => t("settings.pages.providers.provider.fireworks.title"),
	description: "fireworks.ai",
	descriptionLocalize: ({ t }) => t("settings.pages.providers.provider.fireworks.description"),
	tasks: ["chat"],
	capabilities: { chat: { reasoning: { modes: ["enabled", "disabled"] } } },
	icon: "i-lobe-icons:fireworks",
	iconColor: "i-lobe-icons:fireworks-color",
	createProviderConfig: ({ t }) => fireworksConfigSchema.extend({
		apiKey: fireworksConfigSchema.shape.apiKey.meta({
			labelLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label"),
			descriptionLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description"),
			placeholderLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder"),
			type: "password"
		}),
		baseUrl: fireworksConfigSchema.shape.baseUrl.meta({
			labelLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label"),
			descriptionLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description"),
			placeholderLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder")
		})
	}),
	createProvider(config) {
		const provider = createFireworks(config.apiKey, config.baseUrl);
		return {
			...provider,
			chat(model, options) {
				const request = provider.chat(model);
				if (!options?.reasoning) return request;
				return {
					...request,
					reasoningEffort: options.reasoning === "enabled" ? "medium" : "none"
				};
			}
		};
	},
	validationRequiredWhen(config) {
		return !!config.apiKey?.trim();
	},
	validators: { ...createOpenAICompatibleValidators({ checks: [
		"connectivity",
		"model_list",
		"chat_completions"
	] }) }
});
//#endregion
//#region src/providers/cloud/google-gemini-audio-speech/index.ts
const DEFAULT_BASE_URL$1 = "https://generativelanguage.googleapis.com/v1beta/";
const DEFAULT_MODEL$1 = "gemini-2.5-flash-preview-tts";
const googleGeminiSpeechConfigSchema = z.object({
	apiKey: z.string(),
	baseUrl: z.string().default(DEFAULT_BASE_URL$1)
});
const googleGeminiTtsModels = [
	"gemini-2.5-flash-preview-tts",
	"gemini-2.5-pro-preview-tts",
	"gemini-3.1-flash-tts-preview"
];
const googleGeminiTtsVoices = [
	["Zephyr", "Bright"],
	["Puck", "Upbeat"],
	["Charon", "Informative"],
	["Kore", "Firm"],
	["Fenrir", "Excitable"],
	["Leda", "Youthful"],
	["Orus", "Firm"],
	["Aoede", "Breezy"],
	["Callirrhoe", "Easy-going"],
	["Autonoe", "Bright"],
	["Enceladus", "Breathy"],
	["Iapetus", "Clear"],
	["Umbriel", "Easy-going"],
	["Algieba", "Smooth"],
	["Despina", "Smooth"],
	["Erinome", "Clear"],
	["Algenib", "Gravelly"],
	["Rasalgethi", "Informative"],
	["Laomedeia", "Upbeat"],
	["Achernar", "Soft"],
	["Alnilam", "Firm"],
	["Schedar", "Even"],
	["Gacrux", "Mature"],
	["Pulcherrima", "Forward"],
	["Achird", "Friendly"],
	["Zubenelgenubi", "Casual"],
	["Vindemiatrix", "Gentle"],
	["Sadachbia", "Lively"],
	["Sadaltager", "Knowledgeable"],
	["Sulafat", "Warm"]
];
function normalizeBaseUrl$5(baseUrl) {
	const value = baseUrl?.trim() || DEFAULT_BASE_URL$1;
	return value.endsWith("/") ? value : `${value}/`;
}
function decodeBase64(base64) {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
	return bytes;
}
function createAudioFetch$1(apiKey, baseUrl) {
	const client = new GoogleGenAI({
		apiKey,
		httpOptions: {
			apiVersion: "",
			baseUrl
		}
	});
	return async (_input, init) => {
		if (!init?.body || typeof init.body !== "string") throw new Error("Invalid request body");
		const body = JSON.parse(init.body);
		if (!body.input) throw new Error("Missing input text for Gemini TTS");
		if (!body.model) throw new Error("Missing model for Gemini TTS");
		const audio = (await client.models.generateContent({
			model: body.model,
			contents: [{ parts: [{ text: body.input }] }],
			config: {
				responseModalities: ["AUDIO"],
				speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: body.voice || "Kore" } } },
				...body.temperature !== void 0 ? { temperature: body.temperature } : {}
			}
		})).candidates?.[0]?.content?.parts?.find((part) => part.inlineData?.data)?.inlineData?.data;
		if (!audio) throw new Error("Gemini TTS response missing audio data");
		return new Response(toWavFromPCM16(decodeBase64(audio), 24e3), {
			status: 200,
			headers: { "Content-Type": "audio/wav" }
		});
	};
}
const providerGoogleGeminiAudioSpeech = defineProvider({
	id: "google-gemini-audio-speech",
	name: "Google Gemini",
	nameLocalize: ({ t }) => t("settings.pages.providers.provider.google-gemini-audio-speech.title"),
	description: "aistudio.google.com",
	descriptionLocalize: ({ t }) => t("settings.pages.providers.provider.google-gemini-audio-speech.description"),
	tasks: ["text-to-speech", "tts"],
	icon: "i-lobe-icons:gemini",
	iconColor: "i-lobe-icons:gemini-color",
	createProviderConfig: () => googleGeminiSpeechConfigSchema,
	createProvider(config) {
		const apiKey = config.apiKey.trim();
		const baseUrl = normalizeBaseUrl$5(config.baseUrl);
		return { speech: (model, options) => ({
			baseURL: baseUrl,
			fetch: createAudioFetch$1(apiKey, baseUrl),
			...options,
			model: model || (typeof options?.model === "string" ? options.model : DEFAULT_MODEL$1)
		}) };
	},
	validationRequiredWhen: (config) => Boolean(config.apiKey?.trim()),
	validators: { validateConfig: [({ t }) => ({
		id: "google-gemini-audio-speech:check-config",
		name: t("settings.pages.providers.catalog.edit.validators.openai-compatible.check-config.title"),
		validator: async (config) => {
			const valid = Boolean(config.apiKey?.trim());
			return {
				errors: valid ? [] : [{ error: /* @__PURE__ */ new Error("API Key is required.") }],
				reason: valid ? "" : "API Key is required.",
				reasonKey: "",
				valid
			};
		}
	})] },
	extraMethods: {
		listModels: async () => googleGeminiTtsModels.map((id) => ({
			id,
			name: id.split("-").map((word) => `${word[0].toUpperCase()}${word.slice(1)}`).join(" "),
			provider: "google-gemini-audio-speech",
			description: "Gemini API text-to-speech model",
			capabilities: ["text-to-speech"]
		})),
		voiceCatalogConfig: () => ({}),
		listVoices: async () => googleGeminiTtsVoices.map(([id, style]) => ({
			id,
			name: id,
			provider: "google-gemini-audio-speech",
			description: style,
			languages: [{
				code: "auto",
				title: "Auto"
			}],
			compatibleModels: [...googleGeminiTtsModels]
		}))
	}
});
//#endregion
//#region src/providers/cloud/google-generative-ai/index.ts
const googleGenerativeConfigSchema = z.object({
	apiKey: z.string("API Key"),
	baseUrl: z.string("Base URL").optional().default("https://generativelanguage.googleapis.com/v1beta/openai/")
});
const providerGoogleGenerativeAI = defineProvider({
	id: "google-generative-ai",
	order: 8,
	name: "Google Gemini",
	nameLocalize: ({ t }) => t("settings.pages.providers.provider.google-generative-ai.title"),
	description: "ai.google.dev",
	descriptionLocalize: ({ t }) => t("settings.pages.providers.provider.google-generative-ai.description"),
	tasks: ["chat"],
	capabilities: { chat: { reasoning: { modes: ["enabled", "disabled"] } } },
	icon: "i-lobe-icons:gemini",
	iconColor: "i-lobe-icons:gemini-color",
	createProviderConfig: ({ t }) => googleGenerativeConfigSchema.extend({
		apiKey: googleGenerativeConfigSchema.shape.apiKey.meta({
			labelLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label"),
			descriptionLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description"),
			placeholderLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder"),
			type: "password"
		}),
		baseUrl: googleGenerativeConfigSchema.shape.baseUrl.meta({
			labelLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label"),
			descriptionLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description"),
			placeholderLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder")
		})
	}),
	createProvider(config) {
		const provider = createGoogleGenerativeAI(config.apiKey, config.baseUrl);
		return {
			...provider,
			chat(model, options) {
				const request = provider.chat(model);
				if (!options?.reasoning) return request;
				return {
					...request,
					reasoningEffort: options.reasoning === "enabled" ? "medium" : "none"
				};
			}
		};
	},
	validationRequiredWhen(config) {
		return !!config.apiKey?.trim();
	},
	validators: { ...createOpenAICompatibleValidators({ checks: [
		"connectivity",
		"model_list",
		"chat_completions"
	] }) }
});
//#endregion
//#region src/providers/cloud/groq/index.ts
const groqConfigSchema = z.object({
	apiKey: z.string("API Key"),
	baseUrl: z.string("Base URL").optional().default("https://api.groq.com/openai/v1/")
});
const providerGroq = defineProvider({
	id: "groq",
	name: "Groq",
	nameLocalize: ({ t }) => t("settings.pages.providers.provider.groq.title"),
	description: "groq.com",
	descriptionLocalize: ({ t }) => t("settings.pages.providers.provider.groq.description"),
	tasks: ["chat"],
	capabilities: { chat: { reasoning: { modes: ["enabled", "disabled"] } } },
	icon: "i-lobe-icons:groq",
	createProviderConfig: ({ t }) => groqConfigSchema.extend({
		apiKey: groqConfigSchema.shape.apiKey.meta({
			labelLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label"),
			descriptionLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description"),
			placeholderLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder"),
			type: "password"
		}),
		baseUrl: groqConfigSchema.shape.baseUrl.meta({
			labelLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label"),
			descriptionLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description"),
			placeholderLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder")
		})
	}),
	createProvider(config) {
		const provider = createOpenAI(config.apiKey, config.baseUrl);
		return {
			...provider,
			chat(model, options) {
				const request = provider.chat(model);
				if (!options?.reasoning) return request;
				return {
					...request,
					reasoningEffort: options.reasoning === "enabled" ? "medium" : "none"
				};
			}
		};
	},
	validationRequiredWhen(config) {
		return !!config.apiKey?.trim();
	},
	validators: { ...createOpenAICompatibleValidators({ checks: ["model_list", "chat_completions"] }) }
});
//#endregion
//#region src/providers/cloud/mimo/index.ts
const mimoConfigSchema = z.object({
	apiKey: z.string("API Key"),
	baseUrl: z.string("Base URL").optional().default("https://api.xiaomimimo.com/v1/")
});
const providerMimo = defineProvider({
	id: "mimo",
	order: 4,
	name: "Xiaomi MiMo",
	nameLocalize: ({ t }) => t("settings.pages.providers.provider.mimo.title"),
	description: "api.xiaomimimo.com",
	descriptionLocalize: ({ t }) => t("settings.pages.providers.provider.mimo.description"),
	tasks: ["chat"],
	capabilities: { chat: { reasoning: { modes: ["enabled", "disabled"] } } },
	icon: "i-simple-icons:xiaomi",
	createProviderConfig: ({ t }) => mimoConfigSchema.extend({
		apiKey: mimoConfigSchema.shape.apiKey.meta({
			labelLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label"),
			descriptionLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description"),
			placeholderLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder"),
			type: "password"
		}),
		baseUrl: mimoConfigSchema.shape.baseUrl.meta({
			labelLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label"),
			descriptionLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description"),
			placeholderLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder")
		})
	}),
	createProvider(config) {
		const provider = createXiaomi(config.apiKey, config.baseUrl);
		return {
			...provider,
			chat(model, options) {
				const request = provider.chat(model);
				if (!options?.reasoning) return request;
				return {
					...request,
					thinking: { type: options.reasoning }
				};
			}
		};
	},
	validationRequiredWhen(config) {
		return !!config.apiKey?.trim();
	},
	validators: { ...createOpenAICompatibleValidators({ checks: [
		"connectivity",
		"model_list",
		"chat_completions"
	] }) }
});
//#endregion
//#region src/providers/cloud/mimo-audio/index.ts
const mimoSpeechConfigSchema = z.object({
	apiKey: z.string(),
	baseUrl: z.string().default("https://api.xiaomimimo.com/v1/"),
	model: z.string().default("mimo-v2.5-tts"),
	voice: z.string().default("mimo_default"),
	format: z.string().default("wav"),
	stylePrompt: z.string().optional(),
	voiceSample: z.string().optional()
});
const mimoTranscriptionConfigSchema = z.object({
	apiKey: z.string(),
	baseUrl: z.string().default("https://api.xiaomimimo.com/v1/"),
	model: z.string().default("mimo-v2-omni")
});
function normalizeBaseUrl$4(baseUrl) {
	return `${(baseUrl || "https://api.xiaomimimo.com/v1/").replace(/\/+$/, "")}/`;
}
function createMimoValidators(id) {
	return { validateConfig: [({ t }) => ({
		id: `${id}:check-config`,
		name: t("settings.pages.providers.catalog.edit.validators.openai-compatible.check-config.title"),
		validator: async (config) => {
			const errors = [];
			if (!config.apiKey?.trim()) errors.push({ error: /* @__PURE__ */ new Error("API key is required.") });
			if (!config.baseUrl?.trim()) errors.push({ error: /* @__PURE__ */ new Error("Base URL is required.") });
			return {
				errors,
				reason: errors.map((item) => item.error.message).join(", "),
				reasonKey: "",
				valid: errors.length === 0
			};
		}
	})] };
}
function createMimoSpeechProvider(config) {
	const apiKey = config.apiKey?.trim() ?? "";
	const baseUrl = normalizeBaseUrl$4(config.baseUrl);
	const defaultModel = config.model || "mimo-v2.5-tts";
	const defaultVoice = config.voice || "mimo_default";
	const defaultFormat = config.format || "wav";
	return { speech: () => ({
		baseURL: baseUrl,
		model: defaultModel,
		fetch: async (_input, init) => {
			if (!init?.body || typeof init.body !== "string") throw new Error("Invalid request body");
			const body = JSON.parse(init.body);
			const model = body.model || defaultModel;
			const format = body.response_format || defaultFormat;
			const stylePrompt = body.style_prompt?.trim() || config.stylePrompt?.trim() || "";
			const voiceSample = body.voice_sample?.trim() || config.voiceSample?.trim() || "";
			const userPrompt = model === "mimo-v2.5-tts-voiceclone" ? stylePrompt : stylePrompt || "Use a natural, clear speaking style.";
			const audio = { format };
			if (model === "mimo-v2.5-tts-voiceclone") {
				if (!voiceSample) throw new Error("MiMo voice clone requires a base64 audio sample in data URI format.");
				audio.voice = voiceSample;
			} else if (model === "mimo-v2.5-tts") audio.voice = body.voice || defaultVoice;
			if (model === "mimo-v2.5-tts-voicedesign" && !stylePrompt) throw new Error("MiMo voice design requires a style prompt in the user message.");
			const response = await fetch(new URL("chat/completions", baseUrl), {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"api-key": apiKey
				},
				body: JSON.stringify({
					model,
					messages: [{
						role: "user",
						content: userPrompt
					}, {
						role: "assistant",
						content: body.input ?? ""
					}],
					audio
				})
			});
			if (!response.ok || !response.body) throw new Error(`MiMo TTS request failed: ${response.status} ${response.statusText}`);
			const audioBase64 = (await response.json()).choices?.[0]?.message?.audio?.data;
			if (!audioBase64) throw new Error("MiMo TTS response missing audio data");
			const binary = atob(audioBase64);
			const bytes = new Uint8Array(binary.length);
			for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
			let contentType = `audio/${format}`;
			if (format === "wav") contentType = "audio/wav";
			else if (format === "mp3") contentType = "audio/mpeg";
			return new Response(bytes.buffer, {
				status: 200,
				headers: { "Content-Type": contentType }
			});
		}
	}) };
}
function audioFormatFromDataUri(dataUri) {
	const format = (dataUri.split(";")[0]?.split(":")[1] || "audio/wav").split("/")[1] || "wav";
	if (format === "webm" || format === "mp4") return format;
	if (format === "mpeg" || format === "mp3") return "mp3";
	return "wav";
}
async function readBlobAsDataUri(file) {
	const bytes = new Uint8Array(await file.arrayBuffer());
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return `data:${file.type || "audio/wav"};base64,${btoa(binary)}`;
}
function createMimoTranscriptionProvider(config) {
	const apiKey = config.apiKey?.trim() ?? "";
	const baseUrl = normalizeBaseUrl$4(config.baseUrl);
	const defaultModel = config.model || "mimo-v2-omni";
	return { transcription: (model) => ({
		baseURL: baseUrl,
		model: model || defaultModel,
		headers: {},
		fetch: async (_input, init) => {
			if (!(init?.body instanceof FormData)) throw new Error("No audio file provided for transcription.");
			const file = init.body.get("file");
			if (!(file instanceof Blob)) throw new Error("No audio file provided for transcription.");
			const modelName = String(init.body.get("model") || defaultModel);
			const dataUri = await readBlobAsDataUri(file);
			const base64Data = dataUri.split(",")[1];
			const response = await fetch(new URL("chat/completions", baseUrl), {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"api-key": apiKey
				},
				body: JSON.stringify({
					model: modelName,
					messages: [{
						role: "user",
						content: [{
							type: "text",
							text: "Transcribe the audio content."
						}, {
							type: "input_audio",
							input_audio: {
								data: base64Data,
								format: audioFormatFromDataUri(dataUri)
							}
						}]
					}]
				})
			});
			if (!response.ok) {
				const errorBody = await response.text().catch(() => "");
				throw new Error(`MiMo transcription failed: ${response.status} ${response.statusText}${errorBody ? ` — ${errorBody}` : ""}`);
			}
			const data = await response.json();
			return new Response(JSON.stringify({ text: data.choices?.[0]?.message?.content || "" }), {
				status: 200,
				headers: { "Content-Type": "application/json" }
			});
		}
	}) };
}
const providerMimoAudioSpeech = defineProvider({
	id: "mimo-audio-speech",
	name: "Xiaomi MiMo",
	nameLocalize: ({ t }) => t("settings.pages.providers.provider.mimo.title"),
	description: "api.xiaomimimo.com",
	descriptionLocalize: ({ t }) => t("settings.pages.providers.provider.mimo.description"),
	tasks: ["text-to-speech"],
	icon: "i-simple-icons:xiaomi",
	createProviderConfig: () => mimoSpeechConfigSchema,
	createProvider: createMimoSpeechProvider,
	validationRequiredWhen: (config) => Boolean(config.apiKey?.trim() && config.baseUrl?.trim()),
	validators: createMimoValidators("mimo-audio-speech"),
	extraMethods: {
		listModels: async () => [
			{
				id: "mimo-v2.5-tts",
				name: "MiMo v2.5 TTS",
				provider: "mimo-audio-speech",
				description: "Preset voice synthesis with the built-in MiMo voice list",
				deprecated: false
			},
			{
				id: "mimo-v2.5-tts-voicedesign",
				name: "MiMo v2.5 TTS Voice Design",
				provider: "mimo-audio-speech",
				description: "Design a new voice from a natural language description",
				deprecated: false
			},
			{
				id: "mimo-v2.5-tts-voiceclone",
				name: "MiMo v2.5 TTS Voice Clone",
				provider: "mimo-audio-speech",
				description: "Clone a voice from a base64-encoded audio sample",
				deprecated: false
			}
		],
		voiceCatalogConfig: () => ({}),
		listVoices: async () => [
			{
				id: "mimo_default",
				name: "MiMo-默认",
				provider: "mimo-audio-speech",
				gender: "female",
				languages: [{
					code: "en",
					title: "English"
				}, {
					code: "zh",
					title: "Chinese"
				}]
			},
			{
				id: "冰糖",
				name: "冰糖",
				provider: "mimo-audio-speech",
				gender: "female",
				languages: [{
					code: "zh",
					title: "Chinese"
				}]
			},
			{
				id: "茉莉",
				name: "茉莉",
				provider: "mimo-audio-speech",
				gender: "female",
				languages: [{
					code: "zh",
					title: "Chinese"
				}]
			},
			{
				id: "苏打",
				name: "苏打",
				provider: "mimo-audio-speech",
				gender: "male",
				languages: [{
					code: "zh",
					title: "Chinese"
				}]
			},
			{
				id: "白桦",
				name: "白桦",
				provider: "mimo-audio-speech",
				gender: "male",
				languages: [{
					code: "zh",
					title: "Chinese"
				}]
			},
			{
				id: "Mia",
				name: "Mia",
				provider: "mimo-audio-speech",
				gender: "female",
				languages: [{
					code: "en",
					title: "English"
				}]
			},
			{
				id: "Chloe",
				name: "Chloe",
				provider: "mimo-audio-speech",
				gender: "female",
				languages: [{
					code: "en",
					title: "English"
				}]
			},
			{
				id: "Milo",
				name: "Milo",
				provider: "mimo-audio-speech",
				gender: "male",
				languages: [{
					code: "en",
					title: "English"
				}]
			},
			{
				id: "Dean",
				name: "Dean",
				provider: "mimo-audio-speech",
				gender: "male",
				languages: [{
					code: "en",
					title: "English"
				}]
			}
		]
	}
});
const providerMimoAudioTranscription = defineProvider({
	id: "mimo-audio-transcription",
	name: "Xiaomi MiMo",
	nameLocalize: ({ t }) => t("settings.pages.providers.provider.mimo.title"),
	description: "api.xiaomimimo.com",
	descriptionLocalize: ({ t }) => t("settings.pages.providers.provider.mimo.description"),
	tasks: [
		"speech-to-text",
		"automatic-speech-recognition",
		"asr",
		"stt"
	],
	icon: "i-simple-icons:xiaomi",
	capabilities: { transcription: {
		protocol: "http",
		generateOutput: true,
		streamOutput: false,
		streamInput: false
	} },
	createProviderConfig: () => mimoTranscriptionConfigSchema,
	createProvider: createMimoTranscriptionProvider,
	validationRequiredWhen: (config) => Boolean(config.apiKey?.trim() && config.baseUrl?.trim()),
	validators: createMimoValidators("mimo-audio-transcription"),
	extraMethods: { listModels: async () => [{
		id: "mimo-v2-omni",
		name: "MiMo V2 Omni",
		provider: "mimo-audio-transcription",
		description: "Omni-modal model with native audio understanding and speech-to-text",
		contextLength: 256e3,
		deprecated: false
	}, {
		id: "mimo-v2.5",
		name: "MiMo V2.5",
		provider: "mimo-audio-transcription",
		description: "Latest omni-modal model with audio understanding, 1M context",
		contextLength: 1e6,
		deprecated: false
	}] }
});
//#endregion
//#region src/providers/cloud/minimax/index.ts
const minimaxCnConfigSchema = z.object({
	apiKey: z.string("API Key"),
	baseUrl: z.string("Base URL").optional().default("https://api.minimaxi.com/v1/")
});
const minimaxGlobalConfigSchema = z.object({
	apiKey: z.string("API Key"),
	baseUrl: z.string("Base URL").optional().default("https://api.minimax.io/v1/")
});
const providerMinimax = defineProvider({
	id: "minimax",
	name: "MiniMax",
	nameLocalize: ({ t }) => t("settings.pages.providers.provider.minimax.title"),
	description: "minimaxi.com",
	descriptionLocalize: ({ t }) => t("settings.pages.providers.provider.minimax.description"),
	tasks: ["chat"],
	icon: "i-lobe-icons:minimax",
	iconColor: "i-lobe-icons:minimax-color",
	createProviderConfig: ({ t }) => minimaxCnConfigSchema.extend({
		apiKey: minimaxCnConfigSchema.shape.apiKey.meta({
			labelLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label"),
			descriptionLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description"),
			placeholderLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder"),
			type: "password"
		}),
		baseUrl: minimaxCnConfigSchema.shape.baseUrl.meta({
			labelLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label"),
			descriptionLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description"),
			placeholderLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder")
		})
	}),
	createProvider(config) {
		return createMinimaxCn(config.apiKey, config.baseUrl);
	},
	validationRequiredWhen(config) {
		return !!config.apiKey?.trim();
	},
	validators: { ...createOpenAICompatibleValidators({ checks: [
		"connectivity",
		"model_list",
		"chat_completions"
	] }) }
});
const providerMinimaxGlobal = defineProvider({
	id: "minimax-global",
	name: "MiniMax Global",
	nameLocalize: ({ t }) => t("settings.pages.providers.provider.minimax-global.title"),
	description: "minimax.io",
	descriptionLocalize: ({ t }) => t("settings.pages.providers.provider.minimax-global.description"),
	tasks: ["chat"],
	icon: "i-lobe-icons:minimax",
	iconColor: "i-lobe-icons:minimax-color",
	createProviderConfig: ({ t }) => minimaxGlobalConfigSchema.extend({
		apiKey: minimaxGlobalConfigSchema.shape.apiKey.meta({
			labelLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label"),
			descriptionLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description"),
			placeholderLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder"),
			type: "password"
		}),
		baseUrl: minimaxGlobalConfigSchema.shape.baseUrl.meta({
			labelLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label"),
			descriptionLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description"),
			placeholderLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder")
		})
	}),
	createProvider(config) {
		return createMinimax(config.apiKey, config.baseUrl);
	},
	validationRequiredWhen(config) {
		return !!config.apiKey?.trim();
	},
	validators: { ...createOpenAICompatibleValidators({ checks: [
		"connectivity",
		"model_list",
		"chat_completions"
	] }) }
});
//#endregion
//#region src/providers/cloud/minimax-speech/index.ts
const minimaxSpeechConfigSchema = z.object({
	apiKey: z.string(),
	baseUrl: z.string().default("https://api.minimax.io")
});
/**
* The synthesis model used when the caller names none. The settings page and
* the Speech module both name a model, so this covers a bare provider call.
*/
const DEFAULT_SPEECH_MODEL = "speech-2.8-hd";
/** Locale of a voice that the catalog cannot resolve from its ID. */
const UNKNOWN_VOICE_LANGUAGE = {
	code: "und",
	title: "Unknown"
};
/**
* Maps the voice ID prefix to a locale. MiniMax prefixes system voice IDs with
* the language, for example `Spanish_Serene_Woman` or `Chinese (Mandarin)_Anchor`.
*/
const VOICE_LANGUAGE_BY_PREFIX = {
	"english": {
		code: "en",
		title: "English"
	},
	"spanish": {
		code: "es",
		title: "Spanish"
	},
	"chinese (mandarin)": {
		code: "zh",
		title: "Chinese"
	},
	"cantonese": {
		code: "yue",
		title: "Cantonese"
	},
	"chinese": {
		code: "zh",
		title: "Chinese"
	},
	"japanese": {
		code: "ja",
		title: "Japanese"
	},
	"korean": {
		code: "ko",
		title: "Korean"
	},
	"french": {
		code: "fr",
		title: "French"
	},
	"german": {
		code: "de",
		title: "German"
	},
	"italian": {
		code: "it",
		title: "Italian"
	},
	"portuguese": {
		code: "pt",
		title: "Portuguese"
	},
	"russian": {
		code: "ru",
		title: "Russian"
	},
	"turkish": {
		code: "tr",
		title: "Turkish"
	},
	"indonesian": {
		code: "id",
		title: "Indonesian"
	},
	"vietnamese": {
		code: "vi",
		title: "Vietnamese"
	},
	"thai": {
		code: "th",
		title: "Thai"
	}
};
/**
* Every ID here is listed in the MiniMax System Voice ID List. An ID that the
* account does not own makes the synthesis call fail, so never invent one.
* Source: https://platform.minimax.io/docs/api-reference/system-voice-id
*/
const builtinMinimaxVoices = [
	{
		id: "English_Graceful_Lady",
		name: "Graceful Lady",
		provider: "minimax-speech",
		gender: "female",
		languages: [{
			code: "en",
			title: "English"
		}]
	},
	{
		id: "English_radiant_girl",
		name: "Radiant Girl",
		provider: "minimax-speech",
		gender: "female",
		languages: [{
			code: "en",
			title: "English"
		}]
	},
	{
		id: "English_expressive_narrator",
		name: "Expressive Narrator",
		provider: "minimax-speech",
		gender: "neutral",
		languages: [{
			code: "en",
			title: "English"
		}]
	},
	{
		id: "English_Upbeat_Woman",
		name: "Upbeat Woman",
		provider: "minimax-speech",
		gender: "female",
		languages: [{
			code: "en",
			title: "English"
		}]
	},
	{
		id: "English_Trustworth_Man",
		name: "Trustworthy Man",
		provider: "minimax-speech",
		gender: "male",
		languages: [{
			code: "en",
			title: "English"
		}]
	},
	{
		id: "Spanish_SereneWoman",
		name: "Serene Woman",
		provider: "minimax-speech",
		gender: "female",
		languages: [{
			code: "es",
			title: "Spanish"
		}]
	},
	{
		id: "Spanish_Narrator",
		name: "Narrator",
		provider: "minimax-speech",
		gender: "male",
		languages: [{
			code: "es",
			title: "Spanish"
		}]
	},
	{
		id: "Spanish_WiseScholar",
		name: "Wise Scholar",
		provider: "minimax-speech",
		gender: "male",
		languages: [{
			code: "es",
			title: "Spanish"
		}]
	},
	{
		id: "Spanish_ConfidentWoman",
		name: "Confident Woman",
		provider: "minimax-speech",
		gender: "female",
		languages: [{
			code: "es",
			title: "Spanish"
		}]
	},
	{
		id: "Chinese (Mandarin)_Reliable_Executive",
		name: "Reliable Executive",
		provider: "minimax-speech",
		gender: "male",
		languages: [{
			code: "zh",
			title: "Chinese"
		}]
	},
	{
		id: "Chinese (Mandarin)_News_Anchor",
		name: "News Anchor",
		provider: "minimax-speech",
		gender: "female",
		languages: [{
			code: "zh",
			title: "Chinese"
		}]
	},
	{
		id: "Cantonese_ProfessionalHost (F)",
		name: "Professional Female Host",
		provider: "minimax-speech",
		gender: "female",
		languages: [{
			code: "yue",
			title: "Cantonese"
		}]
	}
];
/** Reads the language that the ID prefix names. Cloned and generated voices have no prefix. */
function resolveVoiceLanguage(voiceId) {
	const separatorIndex = voiceId.indexOf("_");
	if (separatorIndex <= 0) return UNKNOWN_VOICE_LANGUAGE;
	return VOICE_LANGUAGE_BY_PREFIX[voiceId.slice(0, separatorIndex).trim().toLowerCase()] ?? UNKNOWN_VOICE_LANGUAGE;
}
/** The only status code MiniMax uses for a successful call. */
const MINIMAX_STATUS_OK = 0;
/**
* The API message for an outcome other than success, or an empty string when
* the call succeeded. An absent status means the endpoint reported no outcome,
* which is not a refusal.
*/
function minimaxRefusal(payload, fallbackMessage) {
	const statusCode = payload.base_resp?.status_code;
	if (statusCode === void 0 || statusCode === MINIMAX_STATUS_OK) return "";
	return payload.base_resp?.status_msg || fallbackMessage;
}
/** The API message from a failed HTTP response, when its body carries one. */
async function readMinimaxRefusal(response, fallbackMessage) {
	let payload;
	try {
		payload = await response.json();
	} catch {
		return fallbackMessage;
	}
	return minimaxRefusal(payload, fallbackMessage) || fallbackMessage;
}
/**
* Reads the account voice catalog from `POST /v1/get_voice`. The account holds
* every system voice, plus cloned and generated voices.
*/
async function requestMinimaxVoices(config) {
	const apiKey = config.apiKey?.trim();
	if (!apiKey) return {
		kind: "rejected",
		reason: "API key is required."
	};
	const baseUrl = (config.baseUrl || "https://api.minimax.io").replace(/\/$/, "");
	let response;
	try {
		response = await fetch(`${baseUrl}/v1/get_voice`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"Authorization": `Bearer ${apiKey}`
			},
			body: JSON.stringify({ voice_type: "all" })
		});
	} catch {
		return { kind: "unreachable" };
	}
	if (!response.ok) return {
		kind: "rejected",
		reason: await readMinimaxRefusal(response, `MiniMax voice catalog request failed: ${response.status} ${response.statusText}`)
	};
	let payload;
	try {
		payload = await response.json();
	} catch {
		return { kind: "unreachable" };
	}
	const refusal = minimaxRefusal(payload, "MiniMax rejected the voice catalog request.");
	if (refusal) return {
		kind: "rejected",
		reason: refusal
	};
	return {
		kind: "ok",
		voices: [
			...payload.system_voice ?? [],
			...payload.voice_cloning ?? [],
			...payload.voice_generation ?? []
		].filter((entry) => !!entry.voice_id).map((entry) => ({
			id: entry.voice_id,
			name: entry.voice_name || entry.voice_id,
			provider: "minimax-speech",
			description: entry.description?.join(" "),
			languages: [resolveVoiceLanguage(entry.voice_id)]
		}))
	};
}
/**
* Reports why the account refused these credentials, or an empty string when it
* accepted them.
*
* A supplied key is not an authenticated one, and an unreachable API is not a
* refusal. Only the payload tells the two apart, so this is the check that
* separates "the user typed something" from "the account works".
*/
async function probeMinimaxCredentials(config) {
	const outcome = await requestMinimaxVoices(config);
	return outcome.kind === "rejected" ? outcome.reason : "";
}
const providerMinimaxSpeech = defineProvider({
	id: "minimax-speech",
	name: "MiniMax Speech",
	nameLocalize: ({ t }) => t("settings.pages.providers.provider.minimax-speech.title"),
	description: "minimax.io",
	descriptionLocalize: ({ t }) => t("settings.pages.providers.provider.minimax-speech.description"),
	tasks: ["text-to-speech"],
	icon: "i-lobe-icons:minimax",
	iconColor: "i-lobe-icons:minimax-color",
	createProviderConfig: () => minimaxSpeechConfigSchema,
	createProvider(config) {
		const apiKey = config.apiKey.trim();
		const baseUrl = (config.baseUrl || "https://api.minimax.io").replace(/\/$/, "");
		return { speech: (model) => ({
			baseURL: `${baseUrl}/v1/`,
			model: model || DEFAULT_SPEECH_MODEL,
			fetch: async (_input, init) => {
				if (!init?.body || typeof init.body !== "string") throw new Error("Invalid request body");
				const body = JSON.parse(init.body);
				const response = await fetch(`${baseUrl}/v1/t2a_v2`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"Authorization": `Bearer ${apiKey}`
					},
					body: JSON.stringify({
						model: body.model || DEFAULT_SPEECH_MODEL,
						text: body.input ?? "",
						stream: true,
						voice_setting: {
							voice_id: body.voice || "English_Graceful_Lady",
							speed: 1,
							vol: 1,
							pitch: 0
						},
						audio_setting: {
							sample_rate: 32e3,
							bitrate: 128e3,
							format: "mp3",
							channel: 1
						}
					})
				});
				if (!response.ok || !response.body) throw new Error(await readMinimaxRefusal(response, `MiniMax TTS request failed: ${response.status} ${response.statusText}`));
				if ((response.headers.get("content-type") ?? "").includes("application/json")) throw new Error(await readMinimaxRefusal(response, "MiniMax rejected the synthesis request."));
				const audioChunks = [];
				const events = response.body.pipeThrough(new TextDecoderStream()).pipeThrough(new EventSourceParserStream());
				for await (const { data } of events) {
					if (!data || data === "[DONE]") continue;
					let event;
					try {
						event = JSON.parse(data);
					} catch {
						continue;
					}
					const refusal = minimaxRefusal(event, "MiniMax rejected the synthesis request.");
					if (refusal) throw new Error(refusal);
					if (event.data?.audio && event.data.status !== 2) {
						const bytes = new Uint8Array(event.data.audio.length / 2);
						for (let index = 0; index < event.data.audio.length; index += 2) bytes[index / 2] = Number.parseInt(event.data.audio.slice(index, index + 2), 16);
						audioChunks.push(bytes);
					}
				}
				const combined = new Uint8Array(audioChunks.reduce((sum, chunk) => sum + chunk.length, 0));
				let offset = 0;
				for (const chunk of audioChunks) {
					combined.set(chunk, offset);
					offset += chunk.length;
				}
				if (combined.byteLength === 0) throw new Error("MiniMax returned no audio for this request.");
				return new Response(combined.buffer, {
					status: 200,
					headers: { "Content-Type": "audio/mpeg" }
				});
			}
		}) };
	},
	validationRequiredWhen: (config) => Boolean(config.apiKey?.trim()),
	validators: { validateConfig: [({ t }) => ({
		id: "minimax-speech:check-config",
		name: t("settings.pages.providers.catalog.edit.validators.openai-compatible.check-config.title"),
		validator: async (config) => {
			const errors = [];
			if (!config.apiKey?.trim()) errors.push({ error: /* @__PURE__ */ new Error("API key is required.") });
			else {
				const refusal = await probeMinimaxCredentials(config);
				if (refusal) errors.push({ error: new Error(refusal) });
			}
			return {
				errors,
				reason: errors.map((item) => item.error.message).join(", "),
				reasonKey: "",
				valid: errors.length === 0
			};
		}
	})] },
	extraMethods: {
		listModels: async () => [{
			id: "speech-2.8-hd",
			name: "Speech 2.8 HD",
			provider: "minimax-speech",
			description: "High-definition TTS model with natural prosody",
			deprecated: false
		}, {
			id: "speech-2.8-turbo",
			name: "Speech 2.8 Turbo",
			provider: "minimax-speech",
			description: "Fast TTS model for low-latency scenarios",
			deprecated: false
		}],
		voiceCatalogConfig: () => ({}),
		listVoices: async (config) => {
			const outcome = await requestMinimaxVoices(config);
			if (outcome.kind === "rejected") throw new Error(outcome.reason);
			if (outcome.kind === "unreachable") return builtinMinimaxVoices;
			return outcome.voices.length > 0 ? outcome.voices : builtinMinimaxVoices;
		}
	}
});
//#endregion
//#region src/providers/cloud/mistral-ai/index.ts
const mistralConfigSchema = z.object({
	apiKey: z.string("API Key"),
	baseUrl: z.string("Base URL").optional().default("https://api.mistral.ai/v1/")
});
const providerMistralAI = defineProvider({
	id: "mistral-ai",
	name: "Mistral",
	nameLocalize: ({ t }) => t("settings.pages.providers.provider.mistral.title"),
	description: "mistral.ai",
	descriptionLocalize: ({ t }) => t("settings.pages.providers.provider.mistral.description"),
	tasks: ["chat"],
	icon: "i-lobe-icons:mistral",
	iconColor: "i-lobe-icons:mistral-color",
	createProviderConfig: ({ t }) => mistralConfigSchema.extend({
		apiKey: mistralConfigSchema.shape.apiKey.meta({
			labelLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label"),
			descriptionLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description"),
			placeholderLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder"),
			type: "password"
		}),
		baseUrl: mistralConfigSchema.shape.baseUrl.meta({
			labelLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label"),
			descriptionLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description"),
			placeholderLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder")
		})
	}),
	createProvider(config) {
		return createMistral(config.apiKey, config.baseUrl);
	},
	validationRequiredWhen(config) {
		return !!config.apiKey?.trim();
	},
	validators: { ...createOpenAICompatibleValidators({ checks: [
		"connectivity",
		"model_list",
		"chat_completions"
	] }) }
});
//#endregion
//#region src/providers/cloud/modelscope/index.ts
const modelscopeConfigSchema = z.object({
	apiKey: z.string("API Key"),
	baseUrl: z.string("Base URL").optional().default("https://api-inference.modelscope.cn/v1/")
});
const providerModelScope = defineProvider({
	id: "modelscope",
	name: "ModelScope",
	nameLocalize: ({ t }) => t("settings.pages.providers.provider.modelscope.title"),
	description: "modelscope",
	descriptionLocalize: ({ t }) => t("settings.pages.providers.provider.modelscope.description"),
	tasks: ["chat"],
	icon: "i-lobe-icons:modelscope",
	iconColor: "i-lobe-icons:modelscope-color",
	createProviderConfig: ({ t }) => modelscopeConfigSchema.extend({
		apiKey: modelscopeConfigSchema.shape.apiKey.meta({
			labelLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label"),
			descriptionLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description"),
			placeholderLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder"),
			type: "password"
		}),
		baseUrl: modelscopeConfigSchema.shape.baseUrl.meta({
			labelLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label"),
			descriptionLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description"),
			placeholderLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder")
		})
	}),
	createProvider(config) {
		return createOpenAI(config.apiKey, config.baseUrl);
	},
	validationRequiredWhen(config) {
		return !!config.apiKey?.trim();
	},
	validators: { ...createOpenAICompatibleValidators({ checks: [
		"connectivity",
		"model_list",
		"chat_completions"
	] }) }
});
//#endregion
//#region src/providers/cloud/moonshot-ai/index.ts
const moonshotConfigSchema = z.object({
	apiKey: z.string("API Key"),
	baseUrl: z.string("Base URL").optional().default("https://api.moonshot.ai/v1/")
});
const providerMoonshotAI = defineProvider({
	id: "moonshot-ai",
	name: "Moonshot AI",
	nameLocalize: ({ t }) => t("settings.pages.providers.provider.moonshot.title"),
	description: "moonshot.ai",
	descriptionLocalize: ({ t }) => t("settings.pages.providers.provider.moonshot.description"),
	tasks: ["chat"],
	capabilities: { chat: { reasoning: { modes: ["enabled", "disabled"] } } },
	icon: "i-lobe-icons:moonshot",
	createProviderConfig: ({ t }) => moonshotConfigSchema.extend({
		apiKey: moonshotConfigSchema.shape.apiKey.meta({
			labelLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label"),
			descriptionLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description"),
			placeholderLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder"),
			type: "password"
		}),
		baseUrl: moonshotConfigSchema.shape.baseUrl.meta({
			labelLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label"),
			descriptionLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description"),
			placeholderLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder")
		})
	}),
	createProvider(config) {
		const provider = createMoonshotai(config.apiKey, config.baseUrl);
		return {
			...provider,
			chat(model, options) {
				const request = provider.chat(model);
				if (!options?.reasoning) return request;
				return {
					...request,
					thinking: { type: options.reasoning }
				};
			}
		};
	},
	validationRequiredWhen(config) {
		return !!config.apiKey?.trim();
	},
	validators: { ...createOpenAICompatibleValidators({ checks: [
		"connectivity",
		"model_list",
		"chat_completions"
	] }) }
});
//#endregion
//#region src/providers/cloud/n1n/index.ts
const n1nConfigSchema = z.object({
	apiKey: z.string("API Key").optional(),
	baseUrl: z.string("Base URL").optional().default("https://api.n1n.ai/v1")
});
const providerN1N = defineProvider({
	id: "n1n",
	order: 9,
	name: "n1n",
	nameLocalize: ({ t }) => t("settings.pages.providers.provider.n1n.title"),
	description: "n1n.ai - High-performance AI API provider.",
	descriptionLocalize: ({ t }) => t("settings.pages.providers.provider.n1n.description"),
	tasks: ["chat"],
	icon: "i-lobe-icons:openai",
	createProviderConfig: ({ t }) => n1nConfigSchema.extend({
		apiKey: n1nConfigSchema.shape.apiKey.meta({
			labelLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label"),
			descriptionLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description"),
			placeholderLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder"),
			type: "password"
		}),
		baseUrl: n1nConfigSchema.shape.baseUrl.meta({
			labelLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label"),
			descriptionLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description"),
			placeholderLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder")
		})
	}),
	createProvider(config) {
		return createOpenAI(config.apiKey || "", config.baseUrl);
	},
	validationRequiredWhen(config) {
		return !!config.apiKey?.trim();
	},
	validators: { ...createOpenAICompatibleValidators({ checks: [
		"connectivity",
		"model_list",
		"chat_completions"
	] }) }
});
//#endregion
//#region src/providers/cloud/novita-ai/index.ts
const novitaConfigSchema = z.object({
	apiKey: z.string("API Key"),
	baseUrl: z.string("Base URL").optional().default("https://api.novita.ai/openai/")
});
const providerNovitaAI = defineProvider({
	id: "novita-ai",
	name: "Novita",
	nameLocalize: ({ t }) => t("settings.pages.providers.provider.novita.title"),
	description: "novita.ai",
	descriptionLocalize: ({ t }) => t("settings.pages.providers.provider.novita.description"),
	tasks: ["chat"],
	capabilities: { chat: { reasoning: { modes: ["enabled", "disabled"] } } },
	icon: "i-lobe-icons:novita",
	iconColor: "i-lobe-icons:novita-color",
	createProviderConfig: ({ t }) => novitaConfigSchema.extend({
		apiKey: novitaConfigSchema.shape.apiKey.meta({
			labelLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label"),
			descriptionLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description"),
			placeholderLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder"),
			type: "password"
		}),
		baseUrl: novitaConfigSchema.shape.baseUrl.meta({
			labelLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label"),
			descriptionLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description"),
			placeholderLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder")
		})
	}),
	createProvider(config) {
		const provider = createNovita(config.apiKey, config.baseUrl);
		return {
			...provider,
			chat(model, options) {
				const request = provider.chat(model);
				if (!options?.reasoning) return request;
				return {
					...request,
					enableThinking: options.reasoning === "enabled"
				};
			}
		};
	},
	validationRequiredWhen(config) {
		return !!config.apiKey?.trim();
	},
	validators: { ...createOpenAICompatibleValidators({ checks: [
		"connectivity",
		"model_list",
		"chat_completions"
	] }) }
});
//#endregion
//#region src/generation.ts
/** Metadata for every wire protocol that AIRI can use for text generation. */
const generationProtocolDefinitions = {
	"chat-completions": { label: "Chat Completions" },
	"responses": { label: "Responses API" }
};
/** Builds selector options in the order declared by a provider capability. */
function generationProtocolOptions(capabilities) {
	return capabilities.supportedProtocols.map((protocol) => ({
		label: generationProtocolDefinitions[protocol].label,
		value: protocol
	}));
}
/** The protocol list is shared by runtime defaults and the provider editor. */
const openAIProtocols = {
	supportedProtocols: ["responses", "chat-completions"],
	defaultProtocol: "responses",
	nativeTools: { responses: ["web-search"] }
};
const compatibleProtocols = {
	supportedProtocols: ["chat-completions", "responses"],
	defaultProtocol: "chat-completions"
};
/**
* Whether a Responses endpoint accepts `input_audio` parts in user messages.
*
* OpenRouter documents audio input for `/api/v1/responses`, in `wav` and `mp3`. The OpenAI Responses API rejects
* audio, so other endpoints get the transcript of a voice message instead.
* https://openrouter.ai/docs/guides/overview/multimodal/audio
*/
function supportsResponsesAudioInputEndpoint(baseURL) {
	try {
		const endpoint = new URL(baseURL);
		return endpoint.origin === "https://openrouter.ai" && /^\/api\/v1\/?$/.test(endpoint.pathname);
	} catch {
		return false;
	}
}
/** Provider drafts can contain incomplete URLs. Only the known endpoint advertises hosted search. */
function supportsOpenAIWebSearchEndpoint(baseURL) {
	try {
		const endpoint = new URL(baseURL);
		return endpoint.origin === "https://api.openai.com" && /^\/v1\/?$/.test(endpoint.pathname);
	} catch {
		return false;
	}
}
//#endregion
//#region src/model-catalog.ts
const discoveredModelSchema = object({
	id: string(),
	inputModalities: optional(array(string())),
	architecture: optional(object({ input_modalities: optional(array(string())) })),
	reasoning: optional(object({ mandatory: optional(boolean()) })),
	name: optional(string()),
	display_name: optional(string()),
	description: optional(string()),
	context_length: optional(number()),
	contextLength: optional(number()),
	deprecated: optional(boolean())
});
/**
* Lists endpoint models, then adds exact-ID metadata from the route's model-bank catalog.
* Custom endpoints receive no metadata from another route. Credentials only go to the configured endpoint.
* Catalog enrichment does not select protocols or hosted tools. No second catalog request is made.
*/
async function listModelCatalog(config, route) {
	const models = (await listModels(config)).map((value) => {
		const model = parse(discoveredModelSchema, value);
		return {
			id: model.id,
			inputModalities: model.inputModalities ?? model.architecture?.input_modalities,
			name: model.name ?? model.display_name ?? model.id,
			provider: route.providerId,
			description: model.description,
			contextLength: model.contextLength ?? model.context_length,
			deprecated: model.deprecated,
			reasoning: model.reasoning
		};
	});
	const endpoint = new URL(config.baseURL);
	const official = new URL(route.baseURL);
	if (endpoint.origin !== official.origin || endpoint.pathname.replace(/\/$/, "") !== official.pathname.replace(/\/$/, "")) return { models };
	const metadata = new Map(route.models.map((model) => [model.id, model]));
	return { models: models.map((model) => {
		const details = metadata.get(model.id);
		if (!details) return model;
		return {
			...model,
			name: details.displayName ?? model.name,
			description: details.description ?? model.description,
			contextLength: details.contextWindowTokens ?? model.contextLength,
			metadata: {
				abilities: details.abilities,
				maxOutput: details.maxOutput,
				pricing: details.pricing,
				settings: details.settings
			}
		};
	}) };
}
//#endregion
//#region src/providers/cloud/openai/index.ts
const configSchema$2 = z.object({
	api: z.enum(openAIProtocols.supportedProtocols).default(openAIProtocols.defaultProtocol),
	webSearch: z.boolean().default(false),
	apiKey: z.string("API Key"),
	baseUrl: z.string("Base URL").optional().default("https://api.openai.com/v1")
});
const providerOpenAI = defineProvider({
	id: "openai",
	order: 5,
	name: "OpenAI",
	nameLocalize: ({ t }) => t("settings.pages.providers.provider.openai.title"),
	description: "OpenAI",
	descriptionLocalize: ({ t }) => t("settings.pages.providers.provider.openai.description"),
	tasks: ["chat"],
	capabilities: { chat: {
		generation: openAIProtocols,
		reasoning: { modes: ["enabled", "disabled"] }
	} },
	icon: "i-lobe-icons:openai",
	createProviderConfig: ({ t, config }) => configSchema$2.extend({
		api: configSchema$2.shape.api.meta({
			type: "select",
			options: generationProtocolOptions(openAIProtocols),
			labelLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-protocol.label"),
			descriptionLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-protocol.description")
		}),
		webSearch: configSchema$2.shape.webSearch.meta({
			type: "boolean",
			labelLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.web-search.label"),
			descriptionLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.web-search.description"),
			disabled: config?.api === "chat-completions" || !supportsOpenAIWebSearchEndpoint(config?.baseUrl ?? "https://api.openai.com/v1")
		}),
		apiKey: configSchema$2.shape.apiKey.meta({
			labelLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label"),
			descriptionLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description"),
			placeholderLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder"),
			type: "password"
		}),
		baseUrl: configSchema$2.shape.baseUrl.meta({
			labelLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label"),
			descriptionLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description"),
			placeholderLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder")
		})
	}),
	createProvider(config) {
		const provider = createOpenAI(config.apiKey, config.baseUrl);
		return {
			model: provider.model,
			generation(model, options) {
				const request = provider.chat(model);
				const definition = openaiChatModels.find((entry) => entry.id === model);
				const parameter = MODEL_REASONING_EXTEND_PARAMS.find((key) => definition?.settings?.extendParams?.includes(key));
				const effort = options?.reasoning === "enabled" ? "medium" : "none";
				const supportedEfforts = parameter ? MODEL_REASONING_PARAM_LEVELS[parameter] : void 0;
				const supportsEffort = options?.reasoning && supportedEfforts?.includes(effort);
				switch (config.api ?? openAIProtocols.defaultProtocol) {
					case "responses": {
						const responseConfig = { ...request };
						if (supportsEffort) responseConfig.reasoning = {
							effort,
							...options?.reasoning === "enabled" ? { summary: "auto" } : {}
						};
						return {
							protocol: "responses",
							webSearch: config.webSearch === true && supportsOpenAIWebSearchEndpoint(request.baseURL),
							config: responseConfig
						};
					}
					case "chat-completions": return {
						protocol: "chat-completions",
						config: {
							...request,
							...supportsEffort ? { reasoningEffort: effort } : {}
						}
					};
				}
			}
		};
	},
	extraMethods: { listModelCatalog: (config) => listModelCatalog({
		apiKey: config.apiKey,
		baseURL: config.baseUrl ?? "https://api.openai.com/v1"
	}, {
		models: openaiChatModels,
		providerId: "openai",
		baseURL: "https://api.openai.com/v1"
	}) },
	validationRequiredWhen(config) {
		return !!config.apiKey?.trim();
	},
	validators: { ...createOpenAICompatibleValidators({
		checks: [
			"connectivity",
			"model_list",
			"chat_completions"
		],
		chatCompletionTokenParameter: "max_completion_tokens"
	}) }
});
//#endregion
//#region src/providers/cloud/openai-audio/index.ts
const openAIAudioConfigSchema = z.object({
	apiKey: z.string(),
	baseUrl: z.string().default("https://api.openai.com/v1/")
});
const openAICompatibleAudioConfigSchema = z.object({
	apiKey: z.string(),
	baseUrl: z.string().default("")
});
function createAudioConfigSchema(schema, t) {
	return schema.extend({
		apiKey: schema.shape.apiKey.meta({
			labelLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label"),
			descriptionLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description"),
			placeholderLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder"),
			type: "password"
		}),
		baseUrl: schema.shape.baseUrl.meta({
			labelLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label"),
			descriptionLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description"),
			placeholderLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder")
		})
	});
}
function normalizeBaseUrl$3(baseUrl) {
	const value = baseUrl?.trim() ?? "";
	return value && !value.endsWith("/") ? `${value}/` : value;
}
function createAudioProvider(config) {
	return createOpenAI(config.apiKey.trim(), normalizeBaseUrl$3(config.baseUrl));
}
function createTranscriptionProvider$1(config) {
	const provider = createAudioProvider(config);
	const transcription = provider.transcription.bind(provider);
	provider.transcription = (model, extraOptions) => ({
		...transcription(model),
		...extraOptions
	});
	return provider;
}
function createAudioValidators() {
	return { validateConfig: [({ t }) => ({
		id: "openai-audio:check-config",
		name: t("settings.pages.providers.catalog.edit.validators.openai-compatible.check-config.title"),
		validator: async (config) => {
			const errors = [];
			const apiKey = config.apiKey?.trim() ?? "";
			const baseUrl = config.baseUrl?.trim() ?? "";
			if (!apiKey) errors.push({ error: /* @__PURE__ */ new Error("API Key is required") });
			if (!baseUrl) errors.push({ error: /* @__PURE__ */ new Error("Base URL is required.") });
			if (baseUrl) try {
				if (!new URL(baseUrl).host) errors.push({ error: /* @__PURE__ */ new Error("Base URL is not absolute. Try to include a scheme (http:// or https://).") });
				else if (!baseUrl.endsWith("/")) errors.push({ error: /* @__PURE__ */ new Error("Base URL must end with a trailing slash (/).") });
			} catch {
				errors.push({ error: /* @__PURE__ */ new Error("Base URL is not absolute. Try to include a scheme (http:// or https://).") });
			}
			return {
				errors,
				reason: errors.map((item) => item.error.message).join(", "),
				reasonKey: "",
				valid: errors.length === 0
			};
		}
	})] };
}
const openAISpeechModels = [
	{
		id: "tts-1",
		name: "TTS-1",
		provider: "openai-audio-speech",
		description: "Optimized for real-time text-to-speech tasks",
		contextLength: 0,
		deprecated: false
	},
	{
		id: "tts-1-hd",
		name: "TTS-1-HD",
		provider: "openai-audio-speech",
		description: "Higher fidelity audio output",
		contextLength: 0,
		deprecated: false
	},
	{
		id: "gpt-4o-mini-tts",
		name: "GPT-4o Mini TTS",
		provider: "openai-audio-speech",
		description: "GPT-4o Mini optimized for text-to-speech",
		contextLength: 0,
		deprecated: false
	},
	{
		id: "gpt-4o-mini-tts-2025-12-15",
		name: "GPT-4o Mini TTS (2025-12-15)",
		provider: "openai-audio-speech",
		description: "GPT-4o Mini TTS snapshot from 2025-12-15",
		contextLength: 0,
		deprecated: false
	}
];
const openAISpeechVoices = [
	{
		id: "alloy",
		models: [
			"tts-1",
			"tts-1-hd",
			"gpt-4o-mini-tts",
			"gpt-4o-mini-tts-2025-12-15"
		]
	},
	{
		id: "ash",
		models: [
			"tts-1",
			"tts-1-hd",
			"gpt-4o-mini-tts",
			"gpt-4o-mini-tts-2025-12-15"
		]
	},
	{
		id: "ballad",
		models: ["gpt-4o-mini-tts", "gpt-4o-mini-tts-2025-12-15"]
	},
	{
		id: "coral",
		models: [
			"tts-1",
			"tts-1-hd",
			"gpt-4o-mini-tts",
			"gpt-4o-mini-tts-2025-12-15"
		]
	},
	{
		id: "echo",
		models: [
			"tts-1",
			"tts-1-hd",
			"gpt-4o-mini-tts",
			"gpt-4o-mini-tts-2025-12-15"
		]
	},
	{
		id: "fable",
		models: [
			"tts-1",
			"tts-1-hd",
			"gpt-4o-mini-tts",
			"gpt-4o-mini-tts-2025-12-15"
		]
	},
	{
		id: "onyx",
		models: [
			"tts-1",
			"tts-1-hd",
			"gpt-4o-mini-tts",
			"gpt-4o-mini-tts-2025-12-15"
		]
	},
	{
		id: "nova",
		models: [
			"tts-1",
			"tts-1-hd",
			"gpt-4o-mini-tts",
			"gpt-4o-mini-tts-2025-12-15"
		]
	},
	{
		id: "sage",
		models: [
			"tts-1",
			"tts-1-hd",
			"gpt-4o-mini-tts",
			"gpt-4o-mini-tts-2025-12-15"
		]
	},
	{
		id: "shimmer",
		models: [
			"tts-1",
			"tts-1-hd",
			"gpt-4o-mini-tts",
			"gpt-4o-mini-tts-2025-12-15"
		]
	},
	{
		id: "verse",
		models: ["gpt-4o-mini-tts", "gpt-4o-mini-tts-2025-12-15"]
	},
	{
		id: "marin",
		models: ["gpt-4o-mini-tts", "gpt-4o-mini-tts-2025-12-15"]
	},
	{
		id: "cedar",
		models: ["gpt-4o-mini-tts", "gpt-4o-mini-tts-2025-12-15"]
	}
].map((voice) => ({
	id: voice.id,
	name: `${voice.id[0].toUpperCase()}${voice.id.slice(1)}`,
	provider: "openai-audio-speech",
	languages: [],
	compatibleModels: voice.models
}));
const openAITranscriptionModels = [
	[
		"gpt-4o-transcribe",
		"GPT-4o Transcribe",
		"High-quality transcription model"
	],
	[
		"gpt-4o-mini-transcribe",
		"GPT-4o Mini Transcribe",
		"Faster, cost-effective transcription model"
	],
	[
		"gpt-4o-mini-transcribe-2025-12-15",
		"GPT-4o Mini Transcribe (2025-12-15)",
		"GPT-4o Mini Transcribe snapshot from 2025-12-15"
	],
	[
		"whisper-1",
		"Whisper-1",
		"Powered by our open source Whisper V2 model"
	],
	[
		"gpt-4o-transcribe-diarize",
		"GPT-4o Transcribe Diarize",
		"Transcription with speaker diarization"
	]
].map(([id, name, description]) => ({
	id,
	name,
	provider: "openai-audio-transcription",
	description,
	contextLength: 0,
	deprecated: false
}));
const providerOpenAIAudioSpeech = defineProvider({
	id: "openai-audio-speech",
	name: "OpenAI",
	nameLocalize: ({ t }) => t("settings.pages.providers.provider.openai.title"),
	description: "openai.com",
	descriptionLocalize: ({ t }) => t("settings.pages.providers.provider.openai.description"),
	tasks: ["text-to-speech"],
	icon: "i-lobe-icons:openai",
	createProviderConfig: ({ t }) => createAudioConfigSchema(openAIAudioConfigSchema, t),
	createProvider: createAudioProvider,
	validationRequiredWhen: (config) => Boolean(config.apiKey?.trim() && config.baseUrl?.trim()),
	validators: createAudioValidators(),
	extraMethods: {
		listModels: async () => openAISpeechModels,
		voiceCatalogConfig: () => ({}),
		listVoices: async () => openAISpeechVoices
	}
});
const providerOpenAICompatibleAudioSpeech = defineProvider({
	id: "openai-compatible-audio-speech",
	name: "OpenAI Compatible",
	nameLocalize: ({ t }) => t("settings.pages.providers.provider.openai-compatible.title"),
	description: "Connect to any API that follows the OpenAI specification.",
	descriptionLocalize: ({ t }) => t("settings.pages.providers.provider.openai-compatible.description"),
	tasks: ["text-to-speech"],
	icon: "i-lobe-icons:openai",
	createProviderConfig: ({ t }) => createAudioConfigSchema(openAICompatibleAudioConfigSchema, t),
	createProvider: createAudioProvider,
	validationRequiredWhen: (config) => Boolean(config.apiKey?.trim() && config.baseUrl?.trim()),
	validators: createAudioValidators(),
	extraMethods: {
		voiceCatalogConfig: () => ({}),
		listVoices: async () => [],
		listModels: async (config) => {
			const apiKey = config.apiKey?.trim() ?? "";
			const baseUrl = normalizeBaseUrl$3(config.baseUrl);
			if (!apiKey || !baseUrl) return [];
			return (await listModels({
				apiKey,
				baseURL: baseUrl
			})).filter((model) => model.id.toLowerCase().includes("tts")).map((model) => ({
				id: model.id,
				name: model.id,
				provider: "openai-compatible-audio-speech",
				description: "",
				contextLength: 0,
				deprecated: false
			}));
		}
	}
});
const providerOpenAIAudioTranscription = defineProvider({
	id: "openai-audio-transcription",
	name: "OpenAI",
	nameLocalize: ({ t }) => t("settings.pages.providers.provider.openai.title"),
	description: "openai.com",
	descriptionLocalize: ({ t }) => t("settings.pages.providers.provider.openai.description"),
	tasks: [
		"speech-to-text",
		"automatic-speech-recognition",
		"asr",
		"stt"
	],
	icon: "i-lobe-icons:openai",
	capabilities: { transcription: {
		protocol: "http",
		generateOutput: true,
		streamOutput: false,
		streamInput: false
	} },
	createProviderConfig: ({ t }) => createAudioConfigSchema(openAIAudioConfigSchema, t),
	createProvider: createTranscriptionProvider$1,
	validationRequiredWhen: (config) => Boolean(config.apiKey?.trim() && config.baseUrl?.trim()),
	validators: createAudioValidators(),
	extraMethods: { listModels: async () => openAITranscriptionModels }
});
const providerOpenAICompatibleAudioTranscription = defineProvider({
	id: "openai-compatible-audio-transcription",
	name: "OpenAI Compatible",
	nameLocalize: ({ t }) => t("settings.pages.providers.provider.openai-compatible.title"),
	description: "Connect to any API that follows the OpenAI specification.",
	descriptionLocalize: ({ t }) => t("settings.pages.providers.provider.openai-compatible.description"),
	tasks: [
		"speech-to-text",
		"automatic-speech-recognition",
		"asr",
		"stt"
	],
	icon: "i-lobe-icons:openai",
	capabilities: { transcription: {
		protocol: "http",
		generateOutput: true,
		streamOutput: false,
		streamInput: false
	} },
	createProviderConfig: ({ t }) => createAudioConfigSchema(openAICompatibleAudioConfigSchema, t),
	createProvider: createTranscriptionProvider$1,
	validationRequiredWhen: (config) => Boolean(config.apiKey?.trim() && config.baseUrl?.trim()),
	validators: createAudioValidators(),
	extraMethods: { listModels: async () => [] }
});
//#endregion
//#region src/providers/cloud/openai-compatible/index.ts
const configSchema$1 = z.object({
	api: z.enum(compatibleProtocols.supportedProtocols).default(compatibleProtocols.defaultProtocol),
	apiKey: z.string("API Key").optional(),
	baseUrl: z.string("Base URL").optional().default("https://api.openai.com/v1")
});
const providerOpenAICompatible = defineProvider({
	id: "openai-compatible",
	order: 4,
	name: "OpenAI Compatible",
	nameLocalize: ({ t }) => t("settings.pages.providers.provider.openai-compatible.title"),
	description: "OpenAI-compatible chat APIs with API key authentication.",
	descriptionLocalize: ({ t }) => t("settings.pages.providers.provider.openai-compatible.description"),
	tasks: ["chat"],
	capabilities: { chat: { generation: compatibleProtocols } },
	icon: "i-lobe-icons:openai",
	createProviderConfig: ({ t }) => configSchema$1.extend({
		api: configSchema$1.shape.api.meta({
			type: "select",
			options: generationProtocolOptions(compatibleProtocols),
			labelLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-protocol.label"),
			descriptionLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-protocol.description")
		}),
		apiKey: configSchema$1.shape.apiKey.meta({
			labelLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label"),
			descriptionLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description"),
			placeholderLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder"),
			type: "password"
		}),
		baseUrl: configSchema$1.shape.baseUrl.meta({
			labelLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label"),
			descriptionLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description"),
			placeholderLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder")
		})
	}),
	createProvider(config) {
		const provider = createOpenAI(config.apiKey ?? "", config.baseUrl);
		return {
			model: provider.model,
			generation(model) {
				const request = provider.chat(model);
				switch (config.api ?? compatibleProtocols.defaultProtocol) {
					case "responses": return {
						protocol: "responses",
						config: request,
						webSearch: false
					};
					case "chat-completions": return {
						protocol: "chat-completions",
						config: request
					};
				}
			}
		};
	},
	validationRequiredWhen(config) {
		return !!config.apiKey?.trim();
	},
	validators: { ...createOpenAICompatibleValidators({ checks: [
		"connectivity",
		"model_list",
		"chat_completions"
	] }) }
});
//#endregion
//#region src/providers/cloud/openpaths/index.ts
const openPathsConfigSchema = z.object({
	apiKey: z.string("API Key"),
	baseUrl: z.string("Base URL").optional().default("https://openpaths.io/v1")
});
const providerOpenPaths = defineProvider({
	id: "openpaths",
	name: "OpenPaths",
	nameLocalize: ({ t }) => t("settings.pages.providers.provider.openpaths.title"),
	description: "openpaths.io",
	descriptionLocalize: ({ t }) => t("settings.pages.providers.provider.openpaths.description"),
	tasks: ["chat"],
	icon: "i-lobe-icons:openai",
	createProviderConfig: ({ t }) => openPathsConfigSchema.extend({
		apiKey: openPathsConfigSchema.shape.apiKey.meta({
			labelLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label"),
			descriptionLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description"),
			placeholderLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder"),
			type: "password"
		}),
		baseUrl: openPathsConfigSchema.shape.baseUrl.meta({
			labelLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label"),
			descriptionLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description"),
			placeholderLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder")
		})
	}),
	createProvider(config) {
		return createOpenAI(config.apiKey, config.baseUrl);
	},
	validationRequiredWhen(config) {
		return !!config.apiKey?.trim();
	},
	validators: { ...createOpenAICompatibleValidators({ checks: [
		"connectivity",
		"model_list",
		"chat_completions"
	] }) }
});
//#endregion
//#region src/providers/cloud/openrouter-ai/index.ts
const OPENROUTER_ATTRIBUTION_HEADERS = {
	"HTTP-Referer": "https://airi.moeru.ai/",
	"X-OpenRouter-Title": "Project AIRI"
};
const openRouterConfigSchema = z.object({
	apiKey: z.string("API Key"),
	baseUrl: z.string("Base URL").optional().default("https://openrouter.ai/api/v1/")
});
const providerOpenRouterAI = defineProvider({
	id: "openrouter-ai",
	order: 0,
	name: "OpenRouter",
	nameLocalize: ({ t }) => t("settings.pages.providers.provider.openrouter.title"),
	description: "openrouter.ai",
	descriptionLocalize: ({ t }) => t("settings.pages.providers.provider.openrouter.description"),
	tasks: ["chat"],
	capabilities: { chat: { reasoning: { modes: ["enabled", "disabled"] } } },
	icon: "i-lobe-icons:openrouter",
	createProviderConfig: ({ t }) => openRouterConfigSchema.extend({
		apiKey: openRouterConfigSchema.shape.apiKey.meta({
			labelLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label"),
			descriptionLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description"),
			placeholderLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder"),
			type: "password"
		}),
		baseUrl: openRouterConfigSchema.shape.baseUrl.meta({
			labelLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label"),
			descriptionLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description"),
			placeholderLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder")
		})
	}),
	createProvider(config) {
		const base = createOpenRouter(config.apiKey, config.baseUrl);
		return {
			...base,
			chat(model, options) {
				const request = {
					...base.chat(model),
					fetch: (input, init) => {
						const headers = new Headers(init?.headers);
						for (const [k, v] of Object.entries(OPENROUTER_ATTRIBUTION_HEADERS)) headers.set(k, v);
						return globalThis.fetch(input, {
							...init,
							headers
						});
					}
				};
				if (!options?.reasoning) return request;
				return {
					...request,
					reasoning: { effort: options.reasoning === "enabled" ? "medium" : "none" }
				};
			}
		};
	},
	extraMethods: { listModelCatalog: (config) => listModelCatalog({
		apiKey: config.apiKey,
		baseURL: config.baseUrl ?? "https://openrouter.ai/api/v1/",
		headers: OPENROUTER_ATTRIBUTION_HEADERS
	}, {
		models: openRouterModels.filter((model) => model.type === "chat"),
		providerId: "openrouter-ai",
		baseURL: "https://openrouter.ai/api/v1/"
	}) },
	validationRequiredWhen(config) {
		return !!config.apiKey?.trim();
	},
	validators: { ...createOpenAICompatibleValidators({
		checks: [
			"connectivity",
			"model_list",
			"chat_completions"
		],
		additionalHeaders: OPENROUTER_ATTRIBUTION_HEADERS
	}) }
});
//#endregion
//#region src/providers/cloud/openrouter-audio-speech/index.ts
const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1/";
const DEFAULT_MODEL = "openai/gpt-audio-mini";
const openRouterAudioConfigSchema = z.object({
	apiKey: z.string(),
	baseUrl: z.string().default(DEFAULT_BASE_URL)
});
const openAIVoices = [
	"alloy",
	"ash",
	"ballad",
	"coral",
	"echo",
	"fable",
	"onyx",
	"nova",
	"sage",
	"shimmer",
	"verse",
	"marin",
	"cedar"
];
function normalizeBaseUrl$2(baseUrl) {
	const value = baseUrl?.trim() || DEFAULT_BASE_URL;
	return value.endsWith("/") ? value : `${value}/`;
}
function ttsPrompt(input) {
	return `Read this text aloud exactly as written, without any commentary or extra words:\n\n${input}`;
}
async function collectAudioChunks(body) {
	const chunks = [];
	const events = body.pipeThrough(new TextDecoderStream()).pipeThrough(new EventSourceParserStream());
	for await (const { data } of events) {
		if (!data) continue;
		if (data === "[DONE]") break;
		try {
			const audio = JSON.parse(data).choices?.[0]?.delta?.audio?.data;
			if (audio) chunks.push(audio);
		} catch (error) {
			console.warn("Skipping malformed SSE chunk from OpenRouter audio stream:", data, error);
		}
	}
	return chunks;
}
function decodeBase64Pcm(chunks) {
	const binary = atob(chunks.join(""));
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
	return bytes;
}
function createAudioFetch(apiKey, baseUrl, model) {
	return async (_input, init) => {
		if (!init?.body || typeof init.body !== "string") throw new Error("Invalid request body");
		const body = JSON.parse(init.body);
		const response = await globalThis.fetch(new URL("chat/completions", baseUrl), {
			method: "POST",
			headers: {
				"Authorization": `Bearer ${apiKey}`,
				"Content-Type": "application/json",
				...OPENROUTER_ATTRIBUTION_HEADERS
			},
			body: JSON.stringify({
				model,
				messages: [{
					role: "user",
					content: ttsPrompt(body.input ?? "")
				}],
				modalities: ["text", "audio"],
				audio: {
					voice: body.voice,
					format: "pcm16"
				},
				stream: true
			})
		});
		if (!response.ok) throw new Error(`OpenRouter audio request failed: ${response.status} ${await response.text()}`);
		if (!response.body) throw new Error("OpenRouter audio response has no body");
		const wav = toWavFromPCM16(decodeBase64Pcm(await collectAudioChunks(response.body)), 24e3);
		return new Response(new Blob([wav], { type: "audio/wav" }), {
			status: 200,
			headers: { "Content-Type": "audio/wav" }
		});
	};
}
const providerOpenRouterAudioSpeech = defineProvider({
	id: "openrouter-audio-speech",
	name: "OpenRouter",
	nameLocalize: ({ t }) => t("settings.pages.providers.provider.openrouter-audio-speech.title"),
	description: "openrouter.ai",
	descriptionLocalize: ({ t }) => t("settings.pages.providers.provider.openrouter-audio-speech.description"),
	tasks: ["text-to-speech"],
	icon: "i-lobe-icons:openrouter",
	createProviderConfig: () => openRouterAudioConfigSchema,
	createProvider(config) {
		const apiKey = config.apiKey.trim();
		const baseUrl = normalizeBaseUrl$2(config.baseUrl);
		return { speech: (model) => {
			const resolvedModel = model || DEFAULT_MODEL;
			return {
				baseURL: baseUrl,
				model: resolvedModel,
				fetch: createAudioFetch(apiKey, baseUrl, resolvedModel)
			};
		} };
	},
	validationRequiredWhen: (config) => Boolean(config.apiKey?.trim()),
	validators: { validateConfig: [({ t }) => ({
		id: "openrouter-audio-speech:check-config",
		name: t("settings.pages.providers.catalog.edit.validators.openai-compatible.check-config.title"),
		validator: async (config) => {
			const valid = Boolean(config.apiKey?.trim());
			return {
				errors: valid ? [] : [{ error: /* @__PURE__ */ new Error("API Key is required.") }],
				reason: valid ? "" : "API Key is required.",
				reasonKey: "",
				valid
			};
		}
	})] },
	extraMethods: {
		listModels: async (config) => {
			try {
				const response = await fetch(new URL("models?output_modality=audio", normalizeBaseUrl$2(config.baseUrl)), { headers: OPENROUTER_ATTRIBUTION_HEADERS });
				if (!response.ok) return [];
				return ((await response.json()).data ?? []).map((model) => ({
					id: model.id,
					name: model.name || model.id,
					provider: "openrouter-audio-speech",
					description: model.description || "",
					contextLength: model.context_length || 0,
					deprecated: false
				}));
			} catch (error) {
				console.error("Failed to fetch OpenRouter audio models:", error);
				return [];
			}
		},
		voiceCatalogConfig: () => ({}),
		listVoices: async () => openAIVoices.map((id) => ({
			id,
			name: `${id[0].toUpperCase()}${id.slice(1)}`,
			provider: "openrouter-audio-speech",
			languages: []
		}))
	}
});
//#endregion
//#region src/providers/cloud/perplexity-ai/index.ts
const perplexityConfigSchema = z.object({
	apiKey: z.string("API Key"),
	baseUrl: z.string("Base URL").optional().default("https://api.perplexity.ai/")
});
const providerPerplexityAI = defineProvider({
	id: "perplexity-ai",
	name: "Perplexity",
	nameLocalize: ({ t }) => t("settings.pages.providers.provider.perplexity.title"),
	description: "perplexity.ai",
	descriptionLocalize: ({ t }) => t("settings.pages.providers.provider.perplexity.description"),
	tasks: ["chat"],
	icon: "i-lobe-icons:perplexity",
	iconColor: "i-lobe-icons:perplexity-color",
	createProviderConfig: ({ t }) => perplexityConfigSchema.extend({
		apiKey: perplexityConfigSchema.shape.apiKey.meta({
			labelLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label"),
			descriptionLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description"),
			placeholderLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder"),
			type: "password"
		}),
		baseUrl: perplexityConfigSchema.shape.baseUrl.meta({
			labelLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label"),
			descriptionLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description"),
			placeholderLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder")
		})
	}),
	createProvider(config) {
		return createPerplexity(config.apiKey, config.baseUrl);
	},
	validationRequiredWhen(config) {
		return !!config.apiKey?.trim();
	},
	extraMethods: { async listModels() {
		return [
			{
				id: "sonar",
				name: "Sonar",
				provider: "perplexity-ai",
				description: "Lightweight, cost-effective search model with grounding.",
				contextLength: 127072
			},
			{
				id: "sonar-pro",
				name: "Sonar Pro",
				provider: "perplexity-ai",
				description: "Advanced search offering with grounding, supporting complex queries and follow-ups.",
				contextLength: 2e5
			},
			{
				id: "sonar-reasoning-pro",
				name: "Sonar Reasoning Pro",
				provider: "perplexity-ai",
				description: "Precise reasoning offering with Chain of Thought (CoT).",
				contextLength: 127072
			},
			{
				id: "sonar-deep-research",
				name: "Sonar Deep Research",
				provider: "perplexity-ai",
				description: "Expert-level research model conducting exhaustive searches and generating comprehensive reports.",
				contextLength: 2e5
			}
		];
	} },
	validators: { ...createOpenAICompatibleValidators({ checks: ["connectivity", "chat_completions"] }) }
});
const runcrateConfigSchema = z.object({
	apiKey: z.string("API Key"),
	baseUrl: z.string("Base URL").optional().default("https://api.runcrate.ai/v1/")
});
/**
* Runcrate's `/models` also lists image, video, speech and embedding models.
* Keep the text-out models with a context window, so model pickers and the
* chat validation probe only see chat models. Declared image input is also
* written to `metadata.abilities.vision`, which the chat vision check reads.
*/
function toRuncrateChatModels(models) {
	return models.filter((model) => model.output_modalities?.length === 1 && model.output_modalities[0] === "text" && (model.context_length ?? 0) > 0).map((model) => ({
		id: model.id,
		name: model.name || model.id,
		provider: "runcrate",
		inputModalities: model.input_modalities,
		contextLength: model.context_length,
		...model.input_modalities?.includes("image") && { metadata: { abilities: { vision: true } } }
	}));
}
const providerRuncrate = defineProvider({
	id: "runcrate",
	name: "Runcrate",
	nameLocalize: () => "Runcrate",
	description: "runcrate.ai",
	descriptionLocalize: () => "runcrate.ai",
	tasks: ["chat"],
	icon: "i-lobe-icons:openai",
	createProviderConfig: ({ t }) => runcrateConfigSchema.extend({
		apiKey: runcrateConfigSchema.shape.apiKey.meta({
			labelLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label"),
			descriptionLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description"),
			placeholderLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder"),
			type: "password"
		}),
		baseUrl: runcrateConfigSchema.shape.baseUrl.meta({
			labelLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label"),
			descriptionLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description"),
			placeholderLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder")
		})
	}),
	createProvider(config) {
		return createOpenAI(config.apiKey, config.baseUrl);
	},
	extraMethods: { async listModels(config) {
		const baseUrl = (config.baseUrl || "https://api.runcrate.ai/v1/").replace(/\/?$/, "/");
		const response = await fetch(`${baseUrl}models`, { headers: { Authorization: `Bearer ${config.apiKey}` } });
		if (!response.ok) throw new Error(`Failed to list Runcrate models: ${response.status} ${response.statusText}`);
		return toRuncrateChatModels((await response.json()).data ?? []);
	} },
	validationRequiredWhen(config) {
		return !!config.apiKey?.trim();
	},
	validators: { ...createOpenAICompatibleValidators({ checks: [
		"connectivity",
		"model_list",
		"chat_completions"
	] }) }
});
//#endregion
//#region src/providers/cloud/together-ai/index.ts
const togetherConfigSchema = z.object({
	apiKey: z.string("API Key"),
	baseUrl: z.string("Base URL").optional().default("https://api.together.xyz/v1/")
});
const providerTogetherAI = defineProvider({
	id: "together-ai",
	name: "Together.ai",
	nameLocalize: ({ t }) => t("settings.pages.providers.provider.together.title"),
	description: "together.ai",
	descriptionLocalize: ({ t }) => t("settings.pages.providers.provider.together.description"),
	tasks: ["chat"],
	capabilities: { chat: { reasoning: { modes: ["enabled", "disabled"] } } },
	icon: "i-lobe-icons:together",
	iconColor: "i-lobe-icons:together-color",
	createProviderConfig: ({ t }) => togetherConfigSchema.extend({
		apiKey: togetherConfigSchema.shape.apiKey.meta({
			labelLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label"),
			descriptionLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description"),
			placeholderLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder"),
			type: "password"
		}),
		baseUrl: togetherConfigSchema.shape.baseUrl.meta({
			labelLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label"),
			descriptionLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description"),
			placeholderLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder")
		})
	}),
	createProvider(config) {
		const provider = createTogetherAI(config.apiKey, config.baseUrl);
		return {
			...provider,
			chat(model, options) {
				const request = provider.chat(model);
				if (!options?.reasoning) return request;
				return {
					...request,
					reasoning: { enabled: options.reasoning === "enabled" }
				};
			}
		};
	},
	validationRequiredWhen(config) {
		return !!config.apiKey?.trim();
	},
	validators: { ...createOpenAICompatibleValidators({ checks: [
		"connectivity",
		"model_list",
		"chat_completions"
	] }) }
});
//#endregion
//#region src/providers/cloud/unspeech/index.ts
const unspeechConfigSchema = z.object({
	apiKey: z.string(),
	baseUrl: z.string().default("https://unspeech.hyp3r.link/v1/")
});
const microsoftSpeechConfigSchema = unspeechConfigSchema.extend({ region: z.string().optional() });
const volcengineSpeechConfigSchema = unspeechConfigSchema.extend({ app: z.object({ appId: z.string() }) });
function createUnspeechConfigSchema(schema, t) {
	return schema.extend({
		apiKey: schema.shape.apiKey.meta({
			labelLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label"),
			descriptionLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description"),
			placeholderLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder"),
			type: "password"
		}),
		baseUrl: schema.shape.baseUrl.meta({
			labelLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label"),
			descriptionLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description"),
			placeholderLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder")
		})
	});
}
function toListVoicesOptions(provider, options) {
	const { fetch: _fetch, ...voiceOptions } = provider.voice(options);
	return voiceOptions;
}
function validateUnspeechConfig(config, requireAppId = false) {
	const errors = [];
	const apiKey = config.apiKey?.trim() ?? "";
	const baseUrl = config.baseUrl?.trim() ?? "";
	if (!apiKey) errors.push({ error: /* @__PURE__ */ new Error("API key is required.") });
	if (!baseUrl) errors.push({ error: /* @__PURE__ */ new Error("Base URL is required.") });
	if (baseUrl) try {
		if (!new URL(baseUrl).host) errors.push({ error: /* @__PURE__ */ new Error("Base URL is not absolute. Try to include a scheme (http:// or https://).") });
		else if (!baseUrl.endsWith("/")) errors.push({ error: /* @__PURE__ */ new Error("Base URL must end with a trailing slash (/).") });
	} catch {
		errors.push({ error: /* @__PURE__ */ new Error("Base URL is not absolute. Try to include a scheme (http:// or https://).") });
	}
	if (requireAppId) {
		if (!("app" in config && config.app && typeof config.app === "object" && "appId" in config.app ? String(config.app.appId).trim() : "")) errors.push({ error: /* @__PURE__ */ new Error("App ID is required.") });
	}
	return {
		errors,
		reason: errors.map((item) => item.error.message).join(", "),
		reasonKey: "",
		valid: errors.length === 0
	};
}
function createUnspeechValidators(id, requireAppId = false) {
	return { validateConfig: [({ t }) => ({
		id: `${id}:check-config`,
		name: t("settings.pages.providers.catalog.edit.validators.openai-compatible.check-config.title"),
		validator: async (config) => validateUnspeechConfig(config, requireAppId)
	})] };
}
const providerDeepgramTts = defineProvider({
	id: "deepgram-tts",
	name: "Deepgram",
	nameLocalize: ({ t }) => t("settings.pages.providers.provider.deepgram-tts.title"),
	description: "deepgram.com",
	descriptionLocalize: ({ t }) => t("settings.pages.providers.provider.deepgram-tts.description"),
	tasks: ["text-to-speech"],
	icon: "i-simple-icons:deepgram",
	createProviderConfig: ({ t }) => createUnspeechConfigSchema(unspeechConfigSchema, t),
	createProvider: (config) => createUnDeepgram(config.apiKey.trim(), config.baseUrl?.trim() ?? ""),
	validationRequiredWhen: (config) => Boolean(config.apiKey?.trim() && config.baseUrl?.trim()),
	validators: createUnspeechValidators("deepgram-tts"),
	extraMethods: {
		listModels: async () => [
			{
				id: "aura-2",
				name: "Aura 2",
				provider: "deepgram-tts",
				description: "Latest generation Aura model",
				deprecated: false
			},
			{
				id: "aura-1",
				name: "Aura 1",
				provider: "deepgram-tts",
				description: "First generation Aura model",
				deprecated: false
			},
			{
				id: "aura",
				name: "Aura (Legacy)",
				provider: "deepgram-tts",
				description: "Original Aura model",
				deprecated: true
			}
		],
		voiceCatalogConfig: ({ apiKey, baseUrl }) => ({
			apiKey,
			baseUrl
		}),
		listVoices: async (config) => {
			const provider = createUnDeepgram(config.apiKey.trim(), config.baseUrl?.trim() ?? "");
			return (await listVoices(toListVoicesOptions(provider))).map((voice) => ({
				id: voice.id,
				name: voice.name,
				provider: "deepgram-tts",
				description: voice.description,
				languages: voice.languages,
				gender: voice.labels?.gender
			}));
		}
	}
});
const providerMicrosoftSpeech = defineProvider({
	id: "microsoft-speech",
	name: "Microsoft / Azure Speech",
	nameLocalize: ({ t }) => t("settings.pages.providers.provider.microsoft-speech.title"),
	description: "speech.microsoft.com",
	descriptionLocalize: ({ t }) => t("settings.pages.providers.provider.microsoft-speech.description"),
	tasks: ["text-to-speech"],
	iconColor: "i-lobe-icons:microsoft",
	createProviderConfig: ({ t }) => createUnspeechConfigSchema(microsoftSpeechConfigSchema, t),
	createProvider: (config) => createUnMicrosoft(config.apiKey.trim(), config.baseUrl?.trim() ?? ""),
	validationRequiredWhen: (config) => Boolean(config.apiKey?.trim() && config.baseUrl?.trim()),
	validators: createUnspeechValidators("microsoft-speech"),
	extraMethods: {
		listModels: async () => [{
			id: "v1",
			name: "v1",
			provider: "microsoft-speech",
			description: "",
			deprecated: false
		}],
		voiceCatalogConfig: ({ apiKey, baseUrl, region }) => ({
			apiKey,
			baseUrl,
			region
		}),
		listVoices: async (config) => {
			const provider = createUnMicrosoft(config.apiKey.trim(), config.baseUrl?.trim() ?? "");
			return (await listVoices(toListVoicesOptions(provider, { region: config.region ?? "" }))).map((voice) => ({
				id: voice.id,
				name: voice.name,
				provider: "microsoft-speech",
				previewURL: voice.preview_audio_url,
				languages: voice.languages,
				gender: voice.labels?.gender
			}));
		}
	}
});
const providerAlibabaCloudModelStudio = defineProvider({
	id: "alibaba-cloud-model-studio",
	name: "Alibaba Cloud Model Studio",
	nameLocalize: ({ t }) => t("settings.pages.providers.provider.alibaba-cloud-model-studio.title"),
	description: "bailian.console.aliyun.com",
	descriptionLocalize: ({ t }) => t("settings.pages.providers.provider.alibaba-cloud-model-studio.description"),
	tasks: ["text-to-speech"],
	iconColor: "i-lobe-icons:alibabacloud",
	createProviderConfig: ({ t }) => createUnspeechConfigSchema(unspeechConfigSchema, t),
	createProvider: (config) => createUnAlibabaCloud(config.apiKey.trim(), config.baseUrl?.trim() ?? ""),
	validationRequiredWhen: (config) => Boolean(config.apiKey?.trim() && config.baseUrl?.trim()),
	validators: createUnspeechValidators("alibaba-cloud-model-studio"),
	extraMethods: {
		listModels: async () => [{
			id: "cosyvoice-v1",
			name: "CosyVoice",
			provider: "alibaba-cloud-model-studio",
			description: "",
			deprecated: false
		}, {
			id: "cosyvoice-v2",
			name: "CosyVoice (New)",
			provider: "alibaba-cloud-model-studio",
			description: "",
			deprecated: false
		}],
		voiceCatalogConfig: ({ apiKey, baseUrl }) => ({
			apiKey,
			baseUrl
		}),
		listVoices: async (config) => {
			const provider = createUnAlibabaCloud(config.apiKey.trim(), config.baseUrl?.trim() ?? "");
			return (await listVoices(toListVoicesOptions(provider))).map((voice) => ({
				id: voice.id,
				name: voice.name,
				provider: "alibaba-cloud-model-studio",
				compatibleModels: voice.compatible_models,
				previewURL: voice.preview_audio_url,
				languages: voice.languages,
				gender: voice.labels?.gender
			}));
		}
	}
});
const providerVolcengineSpeech = defineProvider({
	id: "volcengine",
	name: "Volcengine",
	nameLocalize: ({ t }) => t("settings.pages.providers.provider.volcengine.title"),
	description: "volcengine.com",
	descriptionLocalize: ({ t }) => t("settings.pages.providers.provider.volcengine.description"),
	tasks: ["text-to-speech"],
	iconColor: "i-lobe-icons:volcengine",
	createProviderConfig: ({ t }) => createUnspeechConfigSchema(volcengineSpeechConfigSchema, t),
	createProvider: (config) => createUnVolcengine(config.apiKey.trim(), config.baseUrl?.trim() ?? ""),
	validationRequiredWhen: (config) => Boolean(config.apiKey?.trim() && config.baseUrl?.trim() && config.app?.appId.trim()),
	validators: createUnspeechValidators("volcengine", true),
	extraMethods: {
		listModels: async () => [{
			id: "v1",
			name: "v1",
			provider: "volcano-engine",
			description: "",
			deprecated: false
		}],
		voiceCatalogConfig: ({ apiKey, baseUrl }) => ({
			apiKey,
			baseUrl
		}),
		listVoices: async (config) => {
			const provider = createUnVolcengine(config.apiKey.trim(), config.baseUrl?.trim() ?? "");
			return (await listVoices(toListVoicesOptions(provider))).map((voice) => ({
				id: voice.id,
				name: voice.name,
				provider: "volcano-engine",
				previewURL: voice.preview_audio_url,
				languages: voice.languages,
				gender: voice.labels?.gender
			}));
		}
	}
});
//#endregion
//#region src/providers/cloud/volcengine-coding-plan/index.ts
const providerVolcengineCodingPlan = createArkChatProviderDefinition({
	id: "volcengine-coding-plan",
	order: 7,
	name: "Volcengine Coding Plan",
	nameKey: "settings.pages.providers.provider.volcengine-coding-plan.title",
	description: "Volcengine Coding Plan",
	descriptionKey: "settings.pages.providers.provider.volcengine-coding-plan.description",
	modelPrefix: "volcengine-coding-plan/",
	defaultBaseUrl: "https://ark.cn-beijing.volces.com/api/coding/v3",
	icon: "i-lobe-icons:volcengine",
	iconColor: "i-lobe-icons:volcengine",
	models: [
		{
			id: "ark-code-latest",
			descriptionKey: "settings.pages.providers.provider.volcengine-coding-plan.models.ark-code-latest.description"
		},
		{
			id: "doubao-seed-2.1-turbo",
			contextLength: 256e3
		},
		{
			id: "doubao-seed-2.0-lite",
			contextLength: 256e3
		},
		{
			id: "minimax-m3",
			contextLength: 1024e3
		},
		{
			id: "kimi-k2.7-code",
			contextLength: 256e3
		},
		{
			id: "glm-5.3",
			contextLength: 1024e3
		},
		{
			id: "deepseek-v4-flash",
			contextLength: 1024e3
		},
		{
			id: "deepseek-v4-pro",
			contextLength: 1024e3
		},
		{
			id: "doubao-seed-2.0-code",
			contextLength: 256e3,
			deprecated: true,
			descriptionKey: "settings.pages.providers.provider.volcengine-coding-plan.models.legacy.description"
		},
		{
			id: "doubao-seed-2.0-pro",
			contextLength: 256e3,
			deprecated: true,
			descriptionKey: "settings.pages.providers.provider.volcengine-coding-plan.models.legacy.description"
		}
	]
});
//#endregion
//#region src/providers/cloud/xai/index.ts
const xaiConfigSchema = z.object({
	apiKey: z.string("API Key"),
	baseUrl: z.string("Base URL").optional().default("https://api.x.ai/v1/")
});
const providerXAI = defineProvider({
	id: "xai",
	name: "xAI",
	nameLocalize: ({ t }) => t("settings.pages.providers.provider.xai.title"),
	description: "x.ai",
	descriptionLocalize: ({ t }) => t("settings.pages.providers.provider.xai.description"),
	tasks: ["chat"],
	icon: "i-lobe-icons:xai",
	createProviderConfig: ({ t }) => xaiConfigSchema.extend({
		apiKey: xaiConfigSchema.shape.apiKey.meta({
			labelLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label"),
			descriptionLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description"),
			placeholderLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder"),
			type: "password"
		}),
		baseUrl: xaiConfigSchema.shape.baseUrl.meta({
			labelLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label"),
			descriptionLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description"),
			placeholderLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder")
		})
	}),
	createProvider(config) {
		return createXai(config.apiKey, config.baseUrl);
	},
	validationRequiredWhen(config) {
		return !!config.apiKey?.trim();
	},
	validators: { ...createOpenAICompatibleValidators({ checks: [
		"connectivity",
		"model_list",
		"chat_completions"
	] }) }
});
//#endregion
//#region src/providers/cloud/zai/index.ts
const zaiConfigSchema = z.object({
	apiKey: z.string("API Key"),
	baseUrl: z.string("Base URL").optional().default("https://api.z.ai/api/paas/v4")
});
const providerZai = defineProvider({
	id: "zai",
	name: "Z.ai",
	nameLocalize: ({ t }) => t("settings.pages.providers.provider.zai.title"),
	description: "z.ai",
	descriptionLocalize: ({ t }) => t("settings.pages.providers.provider.zai.description"),
	tasks: ["chat"],
	capabilities: { chat: { reasoning: { modes: ["enabled", "disabled"] } } },
	icon: "i-lobe-icons:zai",
	createProviderConfig: ({ t }) => zaiConfigSchema.extend({
		apiKey: zaiConfigSchema.shape.apiKey.meta({
			labelLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label"),
			descriptionLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description"),
			placeholderLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder"),
			type: "password"
		}),
		baseUrl: zaiConfigSchema.shape.baseUrl.meta({
			labelLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label"),
			descriptionLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description"),
			placeholderLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder")
		})
	}),
	createProvider(config) {
		const provider = createZai(config.apiKey, config.baseUrl);
		return {
			...provider,
			chat(model, options) {
				const request = provider.chat(model);
				if (!options?.reasoning) return request;
				return {
					...request,
					thinking: { type: options.reasoning }
				};
			}
		};
	},
	validationRequiredWhen(config) {
		return !!config.apiKey?.trim();
	},
	validators: { ...createOpenAICompatibleValidators({ checks: [
		"connectivity",
		"model_list",
		"chat_completions"
	] }) }
});
//#endregion
//#region src/providers/local/browser-web-speech-api/provider.ts
/** The catalog exposes settings here. Recognition requires the native media entry point below. */
function createWebSpeechAPIProvider() {
	if (!(typeof window !== "undefined" && ("webkitSpeechRecognition" in window || "SpeechRecognition" in window))) throw new Error("Web Speech API is not available in this browser");
	return { transcription: (model) => ({
		baseURL: "about:blank",
		model: model || "web-speech-api",
		fetch: async () => {
			throw new Error("Web Speech API requires a native MediaStream. Use streamWebSpeechAPITranscription.");
		}
	}) };
}
/** Owns recognition cycles for one supplied track. Stop drains final results. Abort rejects the request. */
var WebSpeechSession = class {
	options;
	textStream;
	fullStream;
	text;
	completion = Promise.withResolvers();
	textOutput;
	fullOutput;
	recognition;
	track;
	completedText = "";
	cycleText = "";
	finalCount = 0;
	stopping = false;
	closed = false;
	restart;
	constructor(media, options) {
		this.options = options;
		this.text = this.completion.promise;
		this.textStream = new ReadableStream({
			start: (output) => {
				this.textOutput = output;
			},
			cancel: () => this.abort()
		});
		this.fullStream = new ReadableStream({
			start: (output) => {
				this.fullOutput = output;
			},
			cancel: () => this.abort()
		});
		this.track = media.getAudioTracks()[0];
		try {
			const browser = globalThis;
			const Recognition = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
			if (!Recognition) throw new Error("Web Speech API is not available in this browser");
			if (!this.track || this.track.readyState !== "live") throw new Error("Web Speech API requires a live audio track");
			this.recognition = new Recognition();
			this.recognition.lang = options.language ?? "en-US";
			this.recognition.continuous = options.continuous ?? true;
			this.recognition.interimResults = options.interimResults ?? true;
			this.recognition.maxAlternatives = options.maxAlternatives ?? 1;
			this.recognition.onresult = (event) => this.result(event);
			this.recognition.onerror = (event) => {
				if (event.error !== "no-speech") this.fail(/* @__PURE__ */ new Error(`Speech recognition error: ${event.error}`));
			};
			this.recognition.onend = () => this.ended();
			this.recognition.onspeechstart = () => this.notify(options.onSpeechStart);
			this.recognition.onspeechend = () => this.notify(options.onSpeechCaptureEnd);
			options.abortSignal?.addEventListener("abort", this.abort, { once: true });
			options.abortSignal?.throwIfAborted();
			this.start();
		} catch (error) {
			this.fail(error);
		}
	}
	/** Triggering workflow: provider stop or capture completion → native stop → final result and end events. */
	stop() {
		if (this.closed || this.stopping) return;
		this.stopping = true;
		if (this.restart) {
			clearTimeout(this.restart);
			this.ended();
			return;
		}
		try {
			this.recognition?.stop();
		} catch (error) {
			this.fail(error);
		}
	}
	start() {
		if (this.closed || this.stopping) return;
		try {
			this.recognition.start(this.track);
		} catch (error) {
			this.fail(error);
		}
	}
	/** Triggering workflow: native result event → complete revision and committed sentence callbacks → Hearing. */
	result(event) {
		if (this.closed) return;
		const final = [];
		const interim = [];
		for (let index = 0; index < event.results.length; index++) {
			const result = event.results[index];
			const text = result[0]?.transcript ?? "";
			if (result.isFinal) final.push(text);
			else interim.push(text);
		}
		const delta = final.slice(this.finalCount).join(" ");
		this.finalCount = final.length;
		this.cycleText = final.join(" ");
		const text = [
			this.completedText,
			this.cycleText,
			...interim
		].filter(Boolean).join(" ");
		this.fullOutput.enqueue({
			type: "transcript.text.snapshot",
			text,
			isFinal: !interim.length,
			locale: this.recognition.lang,
			startMilliseconds: 0,
			durationMilliseconds: 0
		});
		if (delta) {
			this.textOutput.enqueue(delta);
			this.notify(this.options.onSentenceEnd, delta);
		}
		this.notify(this.options.onTranscriptionUpdate, text);
	}
	/** Triggering workflow: native end event → restart an open request or complete a stopped request. */
	ended() {
		if (this.closed) return;
		this.completedText = [this.completedText, this.cycleText].filter(Boolean).join(" ");
		this.cycleText = "";
		this.finalCount = 0;
		this.notify(this.options.onRecognitionCycleEnd);
		if (!this.stopping && this.options.continuous !== false) {
			this.restart = setTimeout(() => {
				this.restart = void 0;
				this.start();
			}, 100);
			return;
		}
		this.closed = true;
		this.options.abortSignal?.removeEventListener("abort", this.abort);
		this.fullOutput.enqueue({
			type: "transcript.text.done",
			delta: ""
		});
		this.fullOutput.close();
		this.textOutput.close();
		this.completion.resolve(this.completedText);
		this.notify(this.options.onSpeechEnd, this.completedText);
	}
	abort = () => this.fail(this.options.abortSignal?.reason ?? new DOMException("Recognition cancelled", "AbortError"));
	fail(cause) {
		if (this.closed) return;
		this.closed = true;
		clearTimeout(this.restart);
		this.options.abortSignal?.removeEventListener("abort", this.abort);
		const error = cause instanceof Error ? cause : new Error("Speech recognition failed", { cause });
		this.fullOutput.error(error);
		this.textOutput.error(error);
		this.completion.reject(error);
		try {
			this.recognition?.abort();
		} catch {}
	}
	notify(callback, ...args) {
		try {
			callback?.(...args);
		} catch (error) {
			console.error("Speech recognition observer failed", error);
		}
	}
};
/** Uses the caller's track. Stop preserves final text, while request abort cancels recognition and its output streams. */
function streamWebSpeechAPITranscription(media, options = {}) {
	const session = new WebSpeechSession(media, options);
	return {
		fullStream: session.fullStream,
		text: session.text,
		textStream: session.textStream,
		recognition: session
	};
}
//#endregion
//#region src/providers/local/browser-web-speech-api/index.ts
const webSpeechApiConfigSchema = z.object({
	language: z.string().default("en-US"),
	continuous: z.boolean().default(true),
	interimResults: z.boolean().default(true),
	maxAlternatives: z.number().int().positive().default(1)
});
function isWebSpeechApiAvailable() {
	if (typeof window === "undefined") return false;
	return "webkitSpeechRecognition" in window || "SpeechRecognition" in window;
}
const providerBrowserWebSpeechApi = defineProvider({
	id: "browser-web-speech-api",
	name: "Web Speech API (Browser)",
	nameLocalize: ({ t }) => t("settings.pages.providers.provider.browser-web-speech-api.title"),
	description: "Browser-native speech recognition. No API keys.",
	descriptionLocalize: ({ t }) => t("settings.pages.providers.provider.browser-web-speech-api.description"),
	tasks: [
		"speech-to-text",
		"automatic-speech-recognition",
		"asr",
		"stt",
		"streaming-transcription"
	],
	icon: "i-solar:microphone-bold-duotone",
	requiresCredentials: false,
	capabilities: { transcription: {
		protocol: "http",
		generateOutput: false,
		streamOutput: true,
		streamInput: true
	} },
	isAvailableBy: isWebSpeechApiAvailable,
	createProviderConfig: () => webSpeechApiConfigSchema,
	createProvider: createWebSpeechAPIProvider,
	validationRequiredWhen: () => true,
	extraMethods: { listModels: async () => [{
		id: "web-speech-api",
		name: "Web Speech API",
		provider: "browser-web-speech-api",
		description: "Browser-native speech recognition (no API keys required)",
		contextLength: 0,
		deprecated: false
	}] },
	validators: { validateConfig: [({ t }) => ({
		id: "browser-web-speech-api:check-availability",
		name: t("settings.pages.providers.catalog.edit.validators.openai-compatible.check-config.title"),
		validator: async () => {
			const valid = isWebSpeechApiAvailable();
			return {
				errors: valid ? [] : [{ error: /* @__PURE__ */ new Error("Web Speech API is not available. It requires a browser context with SpeechRecognition support (Chrome, Edge, Safari).") }],
				reason: valid ? "" : "Web Speech API is not available in this environment.",
				reasonKey: "",
				valid
			};
		}
	})] }
});
//#endregion
//#region src/providers/local/index-tts-vllm/index.ts
const indexTtsConfigSchema = z.object({
	baseUrl: z.string().default("http://localhost:11996/tts/"),
	model: z.string().default("IndexTTS-1.5")
});
function voicesUrl(config) {
	return `${config.baseUrl ?? "http://localhost:11996/tts/"}audio/voices`;
}
const providerIndexTtsVllm = defineProvider({
	id: "index-tts-vllm",
	name: "Index-TTS by Bilibili",
	nameLocalize: ({ t }) => t("settings.pages.providers.provider.index-tts-vllm.title"),
	description: "index-tts.github.io",
	descriptionLocalize: ({ t }) => t("settings.pages.providers.provider.index-tts-vllm.description"),
	tasks: ["text-to-speech"],
	iconColor: "i-lobe-icons:bilibiliindex",
	createProviderConfig: () => indexTtsConfigSchema,
	createProvider(config) {
		return { speech: () => ({
			baseURL: config.baseUrl ?? "http://localhost:11996/tts/",
			model: config.model || "IndexTTS-1.5"
		}) };
	},
	validationRequiredWhen: (config) => Boolean(config.baseUrl?.trim()),
	validators: { validateConfig: [({ t }) => ({
		id: "index-tts-vllm:check-config",
		name: t("settings.pages.providers.catalog.edit.validators.openai-compatible.check-config.title"),
		validator: async (config) => {
			if (!(config.baseUrl?.trim() ?? "")) {
				const reason = "Base URL is required. Default to http://localhost:11996/tts/ for Index-TTS.";
				return {
					errors: [{ error: /* @__PURE__ */ new Error(reason) }],
					reason,
					reasonKey: "",
					valid: false
				};
			}
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), 5e3);
			try {
				const response = await fetch(voicesUrl(config), { signal: controller.signal });
				if (!response.ok) {
					const reason = `IndexTTS unreachable: HTTP ${response.status} ${response.statusText}`;
					return {
						errors: [{ error: new Error(reason) }],
						reason,
						reasonKey: "",
						valid: false
					};
				}
			} catch (error) {
				const reason = `IndexTTS connection failed: ${errorMessageFrom(error) ?? "Unknown error"}`;
				return {
					errors: [{ error }],
					reason,
					reasonKey: "",
					valid: false
				};
			} finally {
				clearTimeout(timeout);
			}
			return {
				errors: [],
				reason: "",
				reasonKey: "",
				valid: true
			};
		}
	})] },
	extraMethods: {
		listModels: async () => [{
			id: "IndexTTS-1.5",
			name: "IndexTTS-1.5",
			provider: "index-tts-vllm",
			description: "Default model for Index-TTS vLLM deployment",
			contextLength: 0,
			deprecated: false
		}],
		voiceCatalogConfig: ({ baseUrl }) => ({ baseUrl }),
		listVoices: async (config) => {
			const response = await fetch(voicesUrl(config));
			if (!response.ok) throw new Error(`Failed to fetch voices: ${response.statusText}`);
			const voices = await response.json();
			return Object.keys(voices).map((voice) => ({
				id: voice,
				name: voice,
				provider: "index-tts-vllm",
				languages: [{
					code: "cn",
					title: "Chinese"
				}, {
					code: "en",
					title: "English"
				}]
			}));
		}
	}
});
//#endregion
//#region src/providers/local/lm-studio/index.ts
const lmStudioConfigSchema = z.object({
	apiKey: z.string("API Key").optional(),
	baseUrl: z.string("Base URL").optional().default("http://localhost:1234/v1/")
});
const providerLmStudio = defineProvider({
	id: "lm-studio",
	order: 3,
	name: "LM Studio",
	nameLocalize: ({ t }) => t("settings.pages.providers.provider.lm-studio.title"),
	description: "LM Studio",
	descriptionLocalize: ({ t }) => t("settings.pages.providers.provider.lm-studio.description"),
	tasks: ["chat"],
	icon: "i-lobe-icons:lmstudio",
	iconColor: "i-lobe-icons:lmstudio",
	createProviderConfig: ({ t }) => lmStudioConfigSchema.extend({
		apiKey: lmStudioConfigSchema.shape.apiKey.meta({
			labelLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label"),
			descriptionLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description"),
			placeholderLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder"),
			type: "password"
		}),
		baseUrl: lmStudioConfigSchema.shape.baseUrl.meta({
			labelLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label"),
			descriptionLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description"),
			placeholderLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder")
		})
	}),
	createProvider(config) {
		return merge(createChatProvider({
			apiKey: config.apiKey,
			baseURL: config.baseUrl
		}), createEmbedProvider({
			apiKey: config.apiKey,
			baseURL: config.baseUrl
		}), createModelProvider({
			apiKey: config.apiKey,
			baseURL: config.baseUrl
		}));
	},
	validationRequiredWhen(config) {
		return !!config.baseUrl?.trim();
	},
	validators: { ...createOpenAICompatibleValidators({
		checks: [
			"connectivity",
			"model_list",
			"chat_completions"
		],
		skipApiKeyCheck: true,
		schedule: {
			mode: "interval",
			intervalMs: 15e3
		},
		connectivityFailureReason: ({ errorMessage }) => `Failed to reach LM Studio server, error: ${errorMessage} occurred.\n\nMake sure LM Studio is running and the local server is started. You can start the local server in LM Studio by going to the 'Local Server' tab and clicking 'Start Server'.\n\nIf the LM Studio instance is already running, this is likely a CORS (Cross-Origin Resource Sharing) issue. You need to enable CORS in LM Studio: go to 'Local Server' tab and check 'Enable CORS' option in the Server Settings.`,
		modelListFailureReason: ({ errorMessage }) => `Failed to reach LM Studio server, error: ${errorMessage} occurred.\n\nMake sure LM Studio is running and the local server is started. You can start the local server in LM Studio by going to the 'Local Server' tab and clicking 'Start Server'.`
	}) }
});
//#endregion
//#region src/providers/local/ollama/index.ts
const ollamaConfigSchema = z.object({
	baseUrl: z.string().default("http://localhost:11434/v1/"),
	thinkingMode: z.enum([
		"auto",
		"disable",
		"enable",
		"low",
		"medium",
		"high"
	]).default("auto"),
	headers: z.record(z.string(), z.string()).optional()
});
function normalizeOllamaThinkingMode(value) {
	switch (value) {
		case "auto":
		case "disable":
		case "enable":
		case "high":
		case "low":
		case "medium": return value;
		default: return "auto";
	}
}
/**
* Maps the persisted Ollama setting to its OpenAI-compatible effort value.
*
* @example
* resolveOllamaReasoningEffort('disable')
* // => 'none'
*/
function resolveOllamaReasoningEffort(modeRaw) {
	const mode = normalizeOllamaThinkingMode(modeRaw);
	switch (mode) {
		case "auto": return;
		case "disable": return "none";
		case "enable": return "medium";
		case "low":
		case "medium":
		case "high": return mode;
		default: return;
	}
}
const providerOllama = defineProvider({
	id: "ollama",
	order: 2,
	name: "Ollama",
	nameLocalize: ({ t }) => t("settings.pages.providers.provider.ollama.title"),
	description: "Local Ollama server for fast model iteration.",
	descriptionLocalize: ({ t }) => t("settings.pages.providers.provider.ollama.description"),
	tasks: ["chat"],
	capabilities: { chat: { reasoning: { modes: ["enabled", "disabled"] } } },
	icon: "i-lobe-icons:ollama",
	createProviderConfig: ({ t }) => ollamaConfigSchema.extend({
		baseUrl: ollamaConfigSchema.shape.baseUrl.meta({
			labelLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label"),
			descriptionLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description"),
			placeholderLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder")
		}),
		thinkingMode: ollamaConfigSchema.shape.thinkingMode.meta({
			labelLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.thinking-mode.label"),
			descriptionLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.thinking-mode.description"),
			section: "advanced",
			type: "select",
			options: [
				{
					label: t("settings.pages.providers.catalog.edit.config.common.fields.field.thinking-mode.options.auto"),
					value: "auto"
				},
				{
					label: t("settings.pages.providers.catalog.edit.config.common.fields.field.thinking-mode.options.disable"),
					value: "disable"
				},
				{
					label: t("settings.pages.providers.catalog.edit.config.common.fields.field.thinking-mode.options.enable"),
					value: "enable"
				},
				{
					label: t("settings.pages.providers.catalog.edit.config.common.fields.field.thinking-mode.options.low"),
					value: "low"
				},
				{
					label: t("settings.pages.providers.catalog.edit.config.common.fields.field.thinking-mode.options.medium"),
					value: "medium"
				},
				{
					label: t("settings.pages.providers.catalog.edit.config.common.fields.field.thinking-mode.options.high"),
					value: "high"
				}
			]
		}),
		headers: ollamaConfigSchema.shape.headers.meta({
			labelLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.headers.label"),
			descriptionLocalized: t("settings.pages.providers.catalog.edit.config.common.fields.field.headers.description"),
			section: "advanced",
			type: "key-values"
		})
	}),
	createProvider(config) {
		const baseProvider = createOllama("", config.baseUrl);
		return {
			...baseProvider,
			chat(model, options) {
				const chatOptions = baseProvider.chat(model);
				if (options?.reasoning) return {
					...chatOptions,
					reasoningEffort: options.reasoning === "enabled" ? "medium" : "none"
				};
				const reasoningEffort = resolveOllamaReasoningEffort(config.thinkingMode);
				if (reasoningEffort === void 0) return chatOptions;
				return {
					...chatOptions,
					reasoningEffort
				};
			}
		};
	},
	validationRequiredWhen: () => true,
	validators: {
		validateConfig: [({ t }) => ({
			id: "ollama:check-config",
			name: t("settings.pages.providers.catalog.edit.validators.openai-compatible.check-config.title"),
			validator: async (config) => {
				const errors = [];
				const baseUrl = typeof config.baseUrl === "string" ? config.baseUrl.trim() : "";
				if (!baseUrl) errors.push({ error: /* @__PURE__ */ new Error("Base URL is required.") });
				if (baseUrl) try {
					if (!new URL(baseUrl).host) errors.push({ error: /* @__PURE__ */ new Error("Base URL is not absolute. Check your input.") });
				} catch {
					errors.push({ error: /* @__PURE__ */ new Error("Base URL is invalid. It must be an absolute URL.") });
				}
				return {
					errors,
					reason: errors.length > 0 ? errors.map((item) => item.error.message).join(", ") : "",
					reasonKey: "",
					valid: errors.length === 0
				};
			}
		})],
		validateProvider: createOpenAICompatibleValidators({
			checks: [
				"connectivity",
				"model_list",
				"chat_completions"
			],
			schedule: {
				mode: "interval",
				intervalMs: 15e3
			},
			connectivityFailureReason: ({ errorMessage }) => `Failed to reach Ollama server, error: ${errorMessage} occurred.\n\nIf you are using Ollama locally, this is likely the CORS (Cross-Origin Resource Sharing) security issue, where you will need to set OLLAMA_ORIGINS=* or OLLAMA_ORIGINS=https://airi.moeru.ai,http://localhost environment variable before launching Ollama server to make this work.`
		}).validateProvider
	},
	business: ({ t }) => ({ troubleshooting: { validators: { openaiCompatibleCheckConnectivity: {
		label: t("settings.pages.providers.catalog.edit.providers.provider.ollama.troubleshooting.validators.openai-compatible-check-connectivity.label"),
		content: t("settings.pages.providers.catalog.edit.providers.provider.ollama.troubleshooting.validators.openai-compatible-check-connectivity.content")
	} } } })
});
//#endregion
//#region src/providers/local/player2-speech/index.ts
const player2ConfigSchema = z.object({ baseUrl: z.string().default("http://localhost:4315/v1/") });
const player2VoiceLanguages = {
	american_english: {
		code: "en",
		title: "English"
	},
	british_english: {
		code: "en",
		title: "English"
	},
	japanese: {
		code: "ja",
		title: "Japanese"
	},
	mandarin_chinese: {
		code: "zh",
		title: "Chinese"
	},
	spanish: {
		code: "es",
		title: "Spanish"
	},
	french: {
		code: "fr",
		title: "French"
	},
	hindi: {
		code: "hi",
		title: "Hindi"
	},
	italian: {
		code: "it",
		title: "Italian"
	},
	brazilian_portuguese: {
		code: "pt",
		title: "Portuguese"
	}
};
function normalizeBaseUrl$1(baseUrl) {
	const value = baseUrl?.trim() ?? "http://localhost:4315/v1/";
	return value.endsWith("/") ? value : `${value}/`;
}
const providerPlayer2Speech = defineProvider({
	id: "player2-speech",
	name: "Player2 Speech",
	nameLocalize: ({ t }) => t("settings.pages.providers.provider.player2.title"),
	description: "player2.game",
	descriptionLocalize: ({ t }) => t("settings.pages.providers.provider.player2.description"),
	tasks: ["text-to-speech"],
	icon: "i-lobe-icons:player2",
	createProviderConfig: () => player2ConfigSchema,
	createProvider: (config) => createPlayer2(normalizeBaseUrl$1(config.baseUrl), "airi"),
	validationRequiredWhen: (config) => Boolean(config.baseUrl?.trim()),
	validators: {
		validateConfig: [({ t }) => ({
			id: "player2-speech:check-config",
			name: t("settings.pages.providers.catalog.edit.validators.openai-compatible.check-config.title"),
			validator: async (config) => {
				const valid = Boolean(config.baseUrl?.trim());
				const reason = valid ? "" : "Base URL is required. Default to http://localhost:4315/v1/";
				return {
					errors: valid ? [] : [{ error: new Error(reason) }],
					reason,
					reasonKey: "",
					valid
				};
			}
		})],
		validateProvider: [({ t }) => ({
			id: "player2-speech:check-connectivity",
			name: t("settings.pages.providers.catalog.edit.validators.openai-compatible.check-connectivity.title"),
			validator: async (config) => {
				const controller = new AbortController();
				const timeout = setTimeout(() => controller.abort(), 5e3);
				try {
					const response = await fetch(new URL("health", normalizeBaseUrl$1(config.baseUrl)), {
						headers: { "player2-game-key": "airi" },
						signal: controller.signal
					});
					if (!response.ok) {
						const reason = `Player2 speech unreachable: HTTP ${response.status} ${response.statusText}`;
						return {
							errors: [{ error: new Error(reason) }],
							reason,
							reasonKey: "",
							valid: false
						};
					}
				} catch (error) {
					const reason = `Player2 speech connection failed: ${errorMessageFrom(error) ?? "Unknown error"}`;
					return {
						errors: [{ error }],
						reason,
						reasonKey: "",
						valid: false
					};
				} finally {
					clearTimeout(timeout);
				}
				return {
					errors: [],
					reason: "",
					reasonKey: "",
					valid: true
				};
			}
		})]
	},
	extraMethods: {
		listModels: async () => [{
			id: "player2-tts",
			name: "Player2 Speech",
			provider: "player2-speech",
			description: "Default model for Player2 speech endpoint",
			contextLength: 0,
			deprecated: false
		}],
		voiceCatalogConfig: ({ baseUrl }) => ({ baseUrl }),
		listVoices: async (config) => {
			return ((await (await fetch(new URL("tts/voices", normalizeBaseUrl$1(config.baseUrl)))).json()).voices ?? []).map((voice) => ({
				id: voice.id,
				name: voice.name,
				provider: "player2-speech",
				gender: voice.gender,
				languages: [player2VoiceLanguages[voice.language]]
			}));
		}
	}
});
//#endregion
//#region src/providers/local/speech-noop/index.ts
const speechNoopConfigSchema = z.object({});
const providerSpeechNoop = defineProvider({
	id: "speech-noop",
	name: "None",
	nameLocalize: ({ t }) => t("settings.pages.providers.provider.speech-noop.title"),
	description: "No speech output.",
	descriptionLocalize: ({ t }) => t("settings.pages.providers.provider.speech-noop.description"),
	tasks: ["text-to-speech", "tts"],
	icon: "i-solar:volume-cross-bold-duotone",
	requiresCredentials: false,
	createProviderConfig: () => speechNoopConfigSchema,
	createProvider() {
		return { speech: () => ({
			baseURL: "http://speech-noop.invalid/v1/",
			model: "noop"
		}) };
	},
	validationRequiredWhen: () => false,
	extraMethods: {
		listModels: async () => [],
		voiceCatalogConfig: () => ({}),
		listVoices: async () => []
	}
});
//#endregion
//#region src/providers/local/voicevox/engine.ts
const VOICEVOX_ENGINE_PATHS = {
	audio_query: "audio_query",
	speakers: "speakers",
	synthesis: "synthesis",
	version: "version"
};
/** `audio_query` sends no body: its text and style id travel in the query string. */
const POST_ENDPOINTS = /* @__PURE__ */ new Set(["audio_query", "synthesis"]);
/**
* Writes the four controls onto the plan, in place.
*
* An absent control keeps the value the engine returned. A control set to zero
* is written, so the check is the type and not the truthiness.
*/
function applyVoicevoxParameters(audioQuery, parameters) {
	if (typeof parameters.speed === "number") audioQuery.speedScale = parameters.speed;
	if (typeof parameters.pitch === "number") audioQuery.pitchScale = parameters.pitch;
	if (typeof parameters.intonation === "number") audioQuery.intonationScale = parameters.intonation;
	if (typeof parameters.volume === "number") audioQuery.volumeScale = parameters.volume;
	return audioQuery;
}
async function fetchEngineVersion(baseUrl, options) {
	return (await (await request({
		baseUrl,
		endpoint: "version"
	}, options)).text()).replace(/^"|"$/g, "");
}
async function fetchSpeakers(baseUrl, options) {
	const speakers = await decodeJson(await request({
		baseUrl,
		endpoint: "speakers"
	}, options), "speakers");
	return Array.isArray(speakers) ? speakers : [];
}
/**
* Turns text into audio with two requests: `/audio_query`, then `/synthesis`.
*
* `/audio_query` takes the text as a query parameter, not as a body. The speech
* pipeline passes one segment per call, so the URL stays short.
*
* @returns WAV bytes, at the sampling rate the engine is configured for.
*/
async function synthesizeSpeech(baseUrl, synthesis, options) {
	return await (await request({
		baseUrl,
		body: applyVoicevoxParameters(await decodeJson(await request({
			baseUrl,
			endpoint: "audio_query",
			query: {
				speaker: synthesis.styleId,
				text: synthesis.text
			}
		}, options), "audio_query"), synthesis.parameters ?? {}),
		endpoint: "synthesis",
		query: { speaker: synthesis.styleId }
	}, options)).arrayBuffer();
}
/**
* Appends a trailing slash so that a base URL with a path segment keeps it.
*
* @example
* normalizeBaseUrl('http://localhost:50021')
* // => 'http://localhost:50021/'
*
* @example
* normalizeBaseUrl('http://example.internal/engine')
* // => 'http://example.internal/engine/'
*/
function normalizeBaseUrl(baseUrl) {
	const trimmed = baseUrl.trim();
	return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}
function buildUrl(engineRequest) {
	const url = new URL(VOICEVOX_ENGINE_PATHS[engineRequest.endpoint], normalizeBaseUrl(engineRequest.baseUrl));
	for (const [key, value] of Object.entries(engineRequest.query ?? {})) url.searchParams.set(key, value);
	return url;
}
async function decodeJson(response, endpoint) {
	const body = await response.text();
	try {
		return JSON.parse(body);
	} catch {
		throw new Error(`Speech engine answered /${endpoint} with a body that is not JSON. Check that the Base URL points at a VOICEVOX-compatible engine.`);
	}
}
async function request(engineRequest, options) {
	let url;
	try {
		url = buildUrl(engineRequest);
	} catch {
		throw new Error("The Base URL is not an absolute http:// or https:// address.");
	}
	const response = await (options?.fetch ?? globalThis.fetch)(url, {
		method: POST_ENDPOINTS.has(engineRequest.endpoint) ? "POST" : "GET",
		redirect: "error",
		signal: options?.signal,
		...engineRequest.body === void 0 ? {} : {
			body: JSON.stringify(engineRequest.body),
			headers: { "Content-Type": "application/json" }
		}
	});
	if (!response.ok) {
		const detail = (await response.text()).trim();
		const suffix = detail ? `: ${detail.slice(0, 200)}` : "";
		throw new Error(`Speech engine answered ${response.status} ${response.statusText} for /${engineRequest.endpoint}${suffix}`);
	}
	return response;
}
//#endregion
//#region src/providers/local/voicevox/define.ts
/**
* How long the reachability check waits before it calls the engine unreachable.
*
* A local engine answers `/version` at once after it starts. A longer wait only
* delays the settings page.
*/
const REACHABILITY_TIMEOUT_MS = 5e3;
/**
* How often the reachability check runs again. Ollama and LM Studio declare the
* same interval.
*
* No code starts that loop. `startPeriodicRuntimeValidation` reads the schedule,
* only `refreshListedProviderValidation` calls it, and only
* `resetProviderSettings` calls that.
*
* The provider therefore reaches an engine that starts later only when the user
* reopens the settings page, or edits the Base URL.
*/
const REACHABILITY_INTERVAL_MS = 15e3;
/**
* The engine has no model concept. The speech module treats an empty model
* selection as unconfigured, so the catalogue publishes one entry with a stable
* id. The user gets no choice between alternatives that do not exist.
*/
const SYNTHETIC_MODEL_ID = "default";
/**
* `generateSpeech` builds a URL from this before it calls the injected `fetch`.
* The adapter ignores the URL, so the value only has to parse.
*/
const SENTINEL_BASE_URL = "http://voicevox-family.invalid/v1/";
const voicevoxVoiceSettingsSchema = z.object({
	intonation: z.number().default(1),
	pitch: z.number().default(0),
	speed: z.number().default(1),
	volume: z.number().default(1)
});
/**
* Builds one catalogue entry for an engine that implements the VOICEVOX HTTP API.
*
* `createProvider` returns an injected `fetch`, so synthesis never sends the
* OpenAI-shaped request that `generateSpeech` builds. {@link synthesizeSpeech}
* makes the two engine requests instead.
*/
function defineVoicevoxFamilyProvider(options) {
	const configSchema = createVoicevoxConfigSchema(options.defaultBaseUrl);
	return defineProvider({
		createProvider(config) {
			return { speech: () => ({
				baseURL: SENTINEL_BASE_URL,
				fetch: async (_input, init) => {
					const { input, voice } = readSpeechRequest(init);
					const wav = await synthesizeSpeech(config.baseUrl ?? options.defaultBaseUrl, {
						parameters: config.voiceSettings,
						styleId: voice,
						text: input
					}, { signal: init?.signal ?? void 0 });
					return new Response(wav, {
						headers: { "Content-Type": "audio/wav" },
						status: 200
					});
				},
				model: SYNTHETIC_MODEL_ID
			}) };
		},
		createProviderConfig: () => configSchema,
		description: options.description,
		descriptionLocalize: ({ t }) => t(`settings.pages.providers.provider.${options.id}.description`),
		extraMethods: {
			listModels: async () => [{
				contextLength: 0,
				deprecated: false,
				description: "",
				id: SYNTHETIC_MODEL_ID,
				name: options.name,
				provider: options.id
			}],
			voiceCatalogConfig: ({ baseUrl }) => ({ baseUrl }),
			listVoices: async (config) => {
				return (await fetchSpeakers(config.baseUrl?.trim() ?? "")).flatMap((speaker) => (speaker.styles ?? []).map((style) => toVoiceInfo(options.id, speaker.name, style)));
			}
		},
		icon: "i-lobe-icons:speaker",
		id: options.id,
		name: options.name,
		nameLocalize: ({ t }) => t(`settings.pages.providers.provider.${options.id}.title`),
		tasks: ["text-to-speech"],
		validationRequiredWhen: (config) => Boolean(config.baseUrl?.trim()),
		validators: {
			validateConfig: [({ t }) => ({
				id: `${options.id}:check-config`,
				name: t("settings.pages.providers.catalog.edit.validators.openai-compatible.check-config.title"),
				validator: async (config) => {
					const reason = absoluteUrlError(config.baseUrl?.trim() ?? "", options.defaultBaseUrl);
					if (reason) return {
						errors: [{ error: new Error(reason) }],
						reason,
						reasonKey: "",
						valid: false
					};
					return {
						errors: [],
						reason: "",
						reasonKey: "",
						valid: true
					};
				}
			})],
			validateProvider: [({ t }) => ({
				id: `${options.id}:check-reachability`,
				name: t("settings.pages.providers.catalog.edit.validators.openai-compatible.check-connectivity.title"),
				schedule: {
					intervalMs: REACHABILITY_INTERVAL_MS,
					mode: "interval"
				},
				validator: async (config) => {
					const controller = new AbortController();
					const timeout = setTimeout(() => controller.abort(), REACHABILITY_TIMEOUT_MS);
					try {
						await fetchEngineVersion(config.baseUrl?.trim() ?? "", { signal: controller.signal });
						return {
							errors: [],
							reason: "",
							reasonKey: "",
							valid: true
						};
					} catch (error) {
						const reason = `Cannot reach the speech engine: ${errorMessageFrom(error) ?? "Unknown error"}\n\nMake sure the engine is running and that the Base URL matches its port.`;
						return {
							errors: [{ error }],
							reason,
							reasonKey: "",
							valid: false
						};
					} finally {
						clearTimeout(timeout);
					}
				}
			})]
		}
	});
}
function absoluteUrlError(baseUrl, defaultBaseUrl) {
	if (!baseUrl) return `Base URL is required. Default to ${defaultBaseUrl} for this engine.`;
	try {
		const url = new URL(baseUrl);
		if (!url.host || url.protocol !== "http:" && url.protocol !== "https:") return "Base URL is not absolute. Try to include a scheme (http:// or https://).";
	} catch {
		return "Base URL is not absolute. Try to include a scheme (http:// or https://).";
	}
	return "";
}
function createVoicevoxConfigSchema(defaultBaseUrl) {
	return z.object({
		baseUrl: z.string().default(defaultBaseUrl),
		voiceSettings: voicevoxVoiceSettingsSchema.default({
			intonation: 1,
			pitch: 0,
			speed: 1,
			volume: 1
		})
	});
}
/**
* Reads the segment text and the style id out of the OpenAI-shaped body that
* `generateSpeech` builds.
*
* `requestBody` in `@xsai/shared` passes that object through `objCamelToSnake`.
* Only single-word keys survive unchanged, and `input` and `voice` are two of
* them. A key of more than one word arrives renamed. The synthesis parameters
* therefore come from the provider configuration, not from this body.
*/
function readSpeechRequest(init) {
	if (!init?.body || typeof init.body !== "string") throw new Error("Invalid speech request body");
	const body = JSON.parse(init.body);
	if (!body.voice) throw new Error("No voice selected. Pick a character in the speech settings.");
	return {
		input: body.input ?? "",
		voice: body.voice
	};
}
function toVoiceInfo(providerId, speakerName, style) {
	return {
		id: String(style.id),
		languages: [{
			code: "ja",
			title: "Japanese"
		}],
		name: `${speakerName} / ${style.name}`,
		provider: providerId
	};
}
//#endregion
//#region src/providers/local/voicevox/index.ts
const providerVoicevox = defineVoicevoxFamilyProvider({
	defaultBaseUrl: "http://localhost:50021/",
	description: "voicevox.hiroshiba.jp",
	id: "voicevox",
	name: "VOICEVOX"
});
const providerAivisSpeech = defineVoicevoxFamilyProvider({
	defaultBaseUrl: "http://localhost:10101/",
	description: "aivis-project.com",
	id: "aivis-speech",
	name: "AivisSpeech"
});
//#endregion
//#region src/providers/index.ts
function eraseProviderDefinitions(...definitions) {
	return definitions;
}
/**
* Definitions that can load without Vue, Pinia, persistence, or Electron.
*
* This list includes Browser-only definitions. Hosts must call
* `isAvailableBy` before they offer one to a user in the current runtime.
*/
const portableProviderDefinitions = eraseProviderDefinitions(provider302AI, providerAIHubMix, providerAmazonBedrock, providerAnthropic, providerAtlasCloud, providerAzureAIFoundry, providerAzureOpenAI, providerBytePlus, providerBytePlusCodingPlan, providerCerebrasAI, providerCloudflareWorkersAI, providerCometAPI, providerCometAPISpeech, providerCometAPITranscription, providerDeepSeek, providerElevenLabs, providerFeatherlessAI, providerFireworksAI, providerGoogleGeminiAudioSpeech, providerGoogleGenerativeAI, providerGroq, providerMinimax, providerMinimaxGlobal, providerMinimaxSpeech, providerMimo, providerMimoAudioSpeech, providerMimoAudioTranscription, providerMistralAI, providerModelScope, providerMoonshotAI, providerN1N, providerNovitaAI, providerOpenAI, providerOpenAIAudioSpeech, providerOpenAIAudioTranscription, providerOpenAICompatibleAudioSpeech, providerOpenAICompatibleAudioTranscription, providerOpenAICompatible, providerOpenPaths, providerOpenRouterAI, providerOpenRouterAudioSpeech, providerPerplexityAI, providerRuncrate, providerTogetherAI, providerAlibabaCloudModelStudio, providerDeepgramTts, providerMicrosoftSpeech, providerVolcengineSpeech, providerVolcengineCodingPlan, providerXAI, providerZai, providerBrowserWebSpeechApi, providerIndexTtsVllm, providerLmStudio, providerOllama, providerPlayer2Speech, providerSpeechNoop, providerAivisSpeech, providerVoicevox);
//#endregion
//#region src/providers/local/sherpaw-transcription/index.ts
const SHERPAW_TRANSCRIPTION_PROVIDER_ID = "sherpaw-transcription";
const configSchema = z.object({
	model: z.enum(Object.values(sherpawModels).map((model) => model.id)).default("paraformer-zh-en"),
	modelLanguageFilter: z.enum(["all", ...new Set(Object.values(sherpawModels).flatMap((model) => model.supportedLanguages))]).optional()
});
/** Runs the local request created by the Sherpaw provider. */
function executeSherpawStream(options) {
	if (typeof options.startSherpaw !== "function") throw new TypeError("Sherpaw transcription requires a local Provider request.");
	return options.startSherpaw(options);
}
/** Defines Sherpaw recognition with the model resources supplied by one host. */
function createSherpawTranscriptionDefinition(host) {
	return defineProvider({
		id: SHERPAW_TRANSCRIPTION_PROVIDER_ID,
		name: "Sherpaw",
		nameLocalize: ({ t }) => t("settings.pages.providers.provider.sherpaw-transcription.title"),
		description: "Local speech recognition with bundled or on-demand models. No API key is required.",
		descriptionLocalize: ({ t }) => t("settings.pages.providers.provider.sherpaw-transcription.description"),
		tasks: [
			"speech-to-text",
			"automatic-speech-recognition",
			"asr",
			"stt",
			"streaming-transcription"
		],
		requiresCredentials: false,
		isAvailableBy: () => host.models.length > 0 && typeof Worker !== "undefined" && typeof WebAssembly !== "undefined",
		capabilities: { transcription: {
			protocol: "native",
			generateOutput: false,
			streamInput: true,
			streamOutput: true
		} },
		createProviderConfig: ({ t }) => {
			const language = host.getInterfaceLanguage().split("-")[0].toLowerCase();
			const models = host.models.map(({ model }) => model);
			const preferredModel = selectSherpawModel(models, language, { isMobile: host.isMobile() }) ?? paraformerBilingualZhEn;
			const preferredLanguage = preferredModel.supportedLanguages.includes(language) ? language : "all";
			return configSchema.extend({
				model: configSchema.shape.model.default(configSchema.shape.model.parse(preferredModel.id)).meta({
					type: "select",
					labelLocalized: t("settings.pages.providers.provider.sherpaw-transcription.model.label"),
					descriptionLocalized: t("settings.pages.providers.provider.sherpaw-transcription.model.description"),
					options: host.models.map(({ model }) => ({
						value: model.id,
						label: formatSherpawModelName(model, globalThis.navigator?.language ?? "en")
					}))
				}),
				modelLanguageFilter: configSchema.shape.modelLanguageFilter.default(configSchema.shape.modelLanguageFilter.parse(preferredLanguage) ?? "all").meta({
					type: "select",
					labelLocalized: t("settings.pages.providers.provider.sherpaw-transcription.language.label"),
					descriptionLocalized: t("settings.pages.providers.provider.sherpaw-transcription.language.description"),
					options: [{
						value: "all",
						label: t("settings.pages.providers.provider.sherpaw-transcription.language.all")
					}, ...[...new Set(host.models.flatMap(({ model }) => model.supportedLanguages))].map((language) => ({
						value: language,
						label: formatSherpawLanguageName(language, globalThis.navigator?.language ?? "en")
					}))]
				})
			});
		},
		async createProvider(config) {
			const { createProvider } = await import("./runtime-D1dxu2Gc.mjs");
			return createProvider(configSchema.parse(config), host);
		},
		validationRequiredWhen: () => false,
		extraMethods: { listModels: async () => [{
			id: "sherpaw",
			name: "Sherpaw",
			provider: SHERPAW_TRANSCRIPTION_PROVIDER_ID,
			description: "Model selected in Hearing settings."
		}] }
	});
}
//#endregion
//#region src/index.ts
const providerRegistry = createProviderRegistry(portableProviderDefinitions);
/** Returns the portable definition with this stable provider id. */
function getDefinedProvider(id) {
	return providerRegistry.get(id);
}
/** Returns portable definitions in their deterministic display order. */
function listProviders() {
	return providerRegistry.list();
}
//#endregion
export { CHAT_COMPLETIONS_VALIDATOR_ID, DEFAULT_CONCURRENT_VISION_READS, ProviderValidationCheck, SHERPAW_TRANSCRIPTION_PROVIDER_ID, compatibleProtocols, createConfigValidationSteps, createOpenAICompatibleValidators, createProviderRegistry, createProviderValidationSteps, createSherpawTranscriptionDefinition, createWebSpeechAPIProvider, defaultSherpawModelEndpoint, defineProvider, executeSherpawStream, formatSherpawLanguageName, formatSherpawModelName, generationProtocolDefinitions, generationProtocolOptions, getDefinedProvider, getGenerationProvider, getProviderValidationIntervalMs, getValidatorsOfProvider, isGenerationProvider, isModelProvider, joinTranscriptSegments, listProviders, openAIProtocols, paraformerBilingualZhEn, portableProviderDefinitions, selectSherpawModel, sherpawModelArtifactUrl, sherpawModelPath, sherpawModels, sherpawModelsForLanguage, streamWebSpeechAPITranscription, supportsOpenAIWebSearchEndpoint, supportsResponsesAudioInputEndpoint, validateProvider, withReasoning, xAsrBilingualZhEnInt8, zipformerMultilingual };

//# sourceMappingURL=index.mjs.map