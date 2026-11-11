import { AudioOutput } from "./audio-output.mjs";
import { audioNodeSource } from "./sources.mjs";
//#region src/browser/playback.ts
/**
* Plays owned nodes in a borrowed context. The context clock is the playback clock.
* Fade completion follows source ended events on that clock.
*
* Every clip plays into one mix node, which connects to `destination`. `output` reads that mix and `connect` attaches a
* node to it, so an observer hears what this playback plays, after the clip fades and before any volume after `destination`.
*/
var BrowserPlayback = class {
	context;
	output;
	mix;
	constructor(context, options) {
		this.context = context;
		this.mix = context.createGain();
		this.mix.connect(options?.destination ?? context.destination);
		this.output = audioNodeSource(this.mix, context);
	}
	connect(node) {
		this.mix.connect(node);
		return () => {
			try {
				this.mix.disconnect(node);
			} catch {}
		};
	}
	nowMs() {
		return this.context.currentTime * 1e3;
	}
	play(clip) {
		return new AudioOutput(this.context, clip.audio, this.mix, {
			startAtMs: clip.startAtMs,
			onStart: clip.onStart
		});
	}
};
//#endregion
export { BrowserPlayback };
