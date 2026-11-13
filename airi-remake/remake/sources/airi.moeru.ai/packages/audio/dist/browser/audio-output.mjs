//#region src/browser/audio-output.ts
/**
* One clip on a Web Audio context.
*
* Blocks are scheduled back to back on the context clock. The rendered interval comes from scheduled
* node times, not from JavaScript timers.
*/
var AudioOutput = class {
	context;
	options;
	completion = Promise.withResolvers();
	gain;
	nodes = /* @__PURE__ */ new Map();
	reader;
	nextStart;
	throughMs = 0;
	/** Context seconds of the first scheduled sample and of the last rendered sample. */
	firstStart;
	renderedEnd;
	ended = false;
	stopped = false;
	stoppedAt;
	settled = false;
	started = false;
	done = this.completion.promise;
	constructor(context, audio, destination, options) {
		this.context = context;
		this.options = options;
		this.gain = context.createGain();
		this.gain.connect(destination);
		this.nextStart = Math.max(context.currentTime, (options?.startAtMs ?? 0) / 1e3);
		context.addEventListener("statechange", this.contextChanged);
		this.load(audio).catch((cause) => this.finish(cause instanceof Error ? cause : new Error("Audio playback failed", { cause })));
	}
	async load(audio) {
		if (this.context.state !== "running") throw new Error("Playback requires a running audio context");
		if (audio instanceof Blob) {
			const decoded = await this.context.decodeAudioData(await audio.arrayBuffer());
			if (!this.stopped) this.schedule(decoded);
		} else {
			this.reader = audio.getReader();
			try {
				while (!this.stopped) {
					const result = await this.reader.read();
					if (result.done || this.stopped) break;
					const block = result.value;
					const buffer = this.context.createBuffer(block.channels.length, block.channels[0].length, block.sampleRate);
					block.channels.forEach((channel, index) => buffer.copyToChannel(new Float32Array(channel), index));
					this.schedule(buffer);
				}
			} finally {
				this.reader.releaseLock();
				this.reader = void 0;
			}
		}
		this.ended = true;
		if (!this.nodes.size) this.finish();
	}
	schedule(buffer) {
		if (this.stopped || this.settled) return;
		const source = this.context.createBufferSource();
		source.buffer = buffer;
		source.connect(this.gain);
		const start = Math.max(this.context.currentTime, this.nextStart);
		this.nextStart = start + buffer.duration;
		this.nodes.set(source, {
			start,
			duration: buffer.duration
		});
		this.firstStart ??= start;
		/** Triggering workflow: scheduled source ends → rendered interval → output drain or silence receipt. */
		source.onended = () => {
			const entry = this.nodes.get(source);
			if (!entry) return;
			const rendered = Math.max(0, Math.min(entry.duration, (this.stoppedAt ?? this.context.currentTime) - entry.start));
			this.throughMs += rendered * 1e3;
			if (rendered > 0) this.renderedEnd = Math.max(this.renderedEnd ?? 0, entry.start + rendered);
			this.nodes.delete(source);
			source.disconnect();
			if (!this.nodes.size && (this.ended || this.stopped)) this.finish();
		};
		source.start(start);
		if (!this.started) {
			this.started = true;
			this.options?.onStart?.();
		}
	}
	stop(options) {
		if (this.stopped || this.settled) return this.done;
		this.stopped = true;
		this.reader?.cancel("Playback stopped").catch(() => {});
		if (!this.nodes.size) {
			this.finish();
			return this.done;
		}
		if (this.context.state !== "running") {
			this.finish(/* @__PURE__ */ new Error("Playback context cannot confirm fade completion"));
			return this.done;
		}
		const start = this.context.currentTime;
		const end = start + options.fadeMs / 1e3;
		this.stoppedAt = end;
		this.gain.gain.cancelScheduledValues(start);
		this.gain.gain.setValueAtTime(this.gain.gain.value, start);
		this.gain.gain.linearRampToValueAtTime(0, end);
		this.nodes.forEach((_entry, source) => source.stop(end));
		return this.done;
	}
	/** Triggering workflow: browser suspends or closes the audio context → fail pending playback and silence receipt. */
	contextChanged = () => {
		if (this.context.state !== "running" && !this.settled) this.finish(/* @__PURE__ */ new Error("Audio context stopped during playback"));
	};
	finish(error) {
		if (this.settled) return;
		this.settled = true;
		this.stopped = true;
		this.reader?.cancel(error).catch(() => {});
		this.context.removeEventListener("statechange", this.contextChanged);
		this.nodes.forEach((_entry, source) => {
			source.onended = null;
			source.stop();
			source.disconnect();
		});
		this.nodes.clear();
		this.gain.disconnect();
		if (error) this.completion.reject(error);
		else if (this.firstStart === void 0 || this.renderedEnd === void 0) this.completion.resolve({ throughMs: this.throughMs });
		else this.completion.resolve({
			throughMs: this.throughMs,
			interval: {
				startMs: this.firstStart * 1e3,
				endMs: this.renderedEnd * 1e3
			}
		});
	}
};
//#endregion
export { AudioOutput };
