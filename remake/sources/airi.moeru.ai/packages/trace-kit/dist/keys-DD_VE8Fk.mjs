//#region src/core/keys.ts
/**
* Key of one epoch of a source: `source/epoch`. The cursor of `caughtUp` uses it. A source and an epoch do not
* contain `/`, so the key is unambiguous.
*/
function epochKeyOf(source, epoch) {
	return `${source}/${epoch}`;
}
/** Stable key of a record: `source/epoch/seq`. */
function recordKey(ref) {
	return `${ref.source}/${ref.epoch}/${ref.seq}`;
}
/**
* Stable key of a span: `source/epoch/spanId`. A span ID is unique only inside one epoch of one source.
*
* @example
* spanKeyOf('window:main', 'e1', 'llm-1')
* // => 'window:main/e1/llm-1'
*/
function spanKeyOf(source, epoch, spanId) {
	return `${source}/${epoch}/${spanId}`;
}
/**
* The clock of a media stream. Its values are frame positions, and its snapshots pair them with a monotonic clock.
*
* @example
* streamClockOf('capture:mic')
* // => 'audio:capture:mic'
*/
function streamClockOf(streamId) {
	return `audio:${streamId}`;
}
//#endregion
export { streamClockOf as i, recordKey as n, spanKeyOf as r, epochKeyOf as t };
