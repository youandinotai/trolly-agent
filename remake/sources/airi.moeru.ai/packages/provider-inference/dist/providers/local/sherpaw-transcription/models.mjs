//#region src/providers/local/sherpaw-transcription/models.ts
/** Quantized Chinese and English Paraformer distributed by Sherpaw. */
const paraformerBilingualZhEn = {
	id: "paraformer-zh-en",
	name: "Paraformer",
	revision: "46701cc733a82ed5cb94c7f3200a002d010243f6",
	repository: "moeru-ai/sherpaw-paraformer-zh-en",
	supportedLanguages: ["zh", "en"],
	recognizer: "paraformer",
	modelingUnit: "cjkchar",
	directory: "install/bin/wasm"
};
/** Quantized Chinese and English X-ASR distributed by Sherpaw. */
const xAsrBilingualZhEnInt8 = {
	id: "x-asr-zh-en-480ms-int8",
	name: "X-ASR 480 ms (INT8)",
	revision: "d9ab70a45493b97ae76e08574fcbc5ad0c5d0039",
	repository: "moeru-ai/sherpaw-x-asr-zh-en-480ms-int8",
	supportedLanguages: ["zh", "en"],
	recognizer: "transducer",
	modelingUnit: "",
	directory: "install/bin/wasm"
};
/** Eight-language Zipformer distributed by Sherpaw. */
const zipformerMultilingual = {
	id: "zipformer-multilingual",
	name: "Zipformer",
	revision: "fce043ac9738950d5cd223955b86656bfaa42311",
	repository: "moeru-ai/sherpa-onnx-streaming-zipformer-ar_en_id_ja_ru_th_vi_zh-2025-02-10",
	supportedLanguages: [
		"ar",
		"en",
		"id",
		"ja",
		"ru",
		"th",
		"vi",
		"zh"
	],
	recognizer: "transducer",
	modelingUnit: "cjkchar",
	directory: "install/bin/wasm"
};
const sherpawModels = {
	[paraformerBilingualZhEn.id]: paraformerBilingualZhEn,
	[zipformerMultilingual.id]: zipformerMultilingual,
	[xAsrBilingualZhEnInt8.id]: xAsrBilingualZhEnInt8
};
/** Filters available models by one language. The all option keeps the full catalogue. */
function sherpawModelsForLanguage(models, language) {
	if (language === "all") return [...models];
	return models.filter((model) => model.supportedLanguages.includes(language));
}
/**
* Selects a model from the host catalogue. Language changes retain the current
* model when possible. For Chinese and English, new configurations prefer
* X-ASR on desktop and Paraformer on mobile.
*/
function selectSherpawModel(models, language, options = {}) {
	const matchingModels = sherpawModelsForLanguage(models, language);
	if (options.currentModelId !== void 0) return matchingModels.find((model) => model.id === options.currentModelId) ?? matchingModels[0];
	const preferredId = options.isMobile || !["zh", "en"].includes(language) ? paraformerBilingualZhEn.id : xAsrBilingualZhEnInt8.id;
	return matchingModels.find((model) => model.id === preferredId) ?? matchingModels[0] ?? models[0];
}
/** Returns the revision-scoped cache path for a model download. */
function sherpawModelPath(model) {
	return `sherpaw/${model.id}/${model.revision}`;
}
/**
* Base URL that serves the pinned model artifacts.
*
* A host that reaches the Hub through a mirror sets this on the Vite plugin, or
* sets `HF_ENDPOINT`, the variable `huggingface_hub` already reads.
*/
const defaultSherpawModelEndpoint = "https://huggingface.co";
/**
* Returns a pinned model URL for one artifact.
*
* @example
* sherpawModelArtifactUrl(paraformerBilingualZhEn, 'preload.data')
* // => 'https://huggingface.co/moeru-ai/sherpaw-paraformer-zh-en/resolve/46701cc.../install/bin/wasm/preload.data'
*
* @example
* sherpawModelArtifactUrl(paraformerBilingualZhEn, 'preload.data', 'https://hf-mirror.com')
* // => 'https://hf-mirror.com/moeru-ai/sherpaw-paraformer-zh-en/resolve/46701cc.../install/bin/wasm/preload.data'
*/
function sherpawModelArtifactUrl(model, filename, endpoint = defaultSherpawModelEndpoint) {
	return `${endpoint.trim().replace(/\/+$/, "") || "https://huggingface.co"}/${model.repository}/resolve/${model.revision}/${model.directory}/${filename}`;
}
/**
* Formats a model name with localized names for its supported languages.
*
* @example
* formatSherpawModelName(paraformerBilingualZhEn, 'en')
* // => 'Paraformer — Chinese, English'
*/
function languageDisplayNames(locale) {
	try {
		return new Intl.DisplayNames([locale], { type: "language" });
	} catch {
		return new Intl.DisplayNames(["en"], { type: "language" });
	}
}
/** Returns one language name in the current interface locale. */
function formatSherpawLanguageName(language, locale) {
	try {
		return languageDisplayNames(locale).of(language) ?? language;
	} catch {
		return language;
	}
}
function formatSherpawModelName(model, locale) {
	const displayNames = languageDisplayNames(locale);
	const languages = model.supportedLanguages.map((language) => {
		try {
			return displayNames.of(language) ?? language;
		} catch {
			return language;
		}
	});
	return `${model.name} — ${languages.join(", ")}`;
}
//#endregion
export { defaultSherpawModelEndpoint, formatSherpawLanguageName, formatSherpawModelName, paraformerBilingualZhEn, selectSherpawModel, sherpawModelArtifactUrl, sherpawModelPath, sherpawModels, sherpawModelsForLanguage, xAsrBilingualZhEnInt8, zipformerMultilingual };

//# sourceMappingURL=models.mjs.map