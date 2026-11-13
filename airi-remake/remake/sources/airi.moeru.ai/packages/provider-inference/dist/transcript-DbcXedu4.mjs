//#region src/providers/local/sherpaw-transcription/transcript.ts
const noWordSeparator = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;
const punctuation = /^[,.!?;:，。！？；：、]/u;
/**
* Joins recognizer endpoint segments without imposing English spacing on every script.
*
* @example
* joinTranscriptSegments(['Hello', 'world'])
* // => 'Hello world'
*
* @example
* joinTranscriptSegments(['你好', '世界'])
* // => '你好世界'
*/
function joinTranscriptSegments(segments) {
	let transcript = "";
	for (const segment of segments) {
		const text = segment.trim();
		if (!text) continue;
		if (!transcript) {
			transcript = text;
			continue;
		}
		const previousCharacter = transcript.at(-1) ?? "";
		const nextCharacter = text.at(0) ?? "";
		const needsSpace = !/\s/u.test(previousCharacter) && !punctuation.test(text) && !noWordSeparator.test(previousCharacter) && !noWordSeparator.test(nextCharacter);
		transcript += needsSpace ? ` ${text}` : text;
	}
	return transcript;
}
//#endregion
export { joinTranscriptSegments as t };

//# sourceMappingURL=transcript-DbcXedu4.mjs.map