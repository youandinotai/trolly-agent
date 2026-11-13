import { toPCM16FromFloat32 } from "./wav.mjs";
//#region src/encoding/pcm-stream.ts
/** Converts accepted PCM to mono PCM16 bytes. Each reader pull advances conversion without collecting the complete recording. */
var Pcm16Encoder = class {
	options;
	stream;
	reader;
	converter;
	inputRate;
	inputFrames = 0;
	outputFrames = 0;
	ended = false;
	closed = false;
	output;
	constructor(frames, options) {
		this.options = options;
		if (!Number.isFinite(options.sampleRate) || options.sampleRate <= 0) throw new Error("PCM output sample rate must be positive");
		this.reader = frames.getReader();
		this.stream = new ReadableStream({
			start: (output) => {
				this.output = output;
				options.signal?.addEventListener("abort", this.abort, { once: true });
				if (options.signal?.aborted) this.abort();
			},
			pull: (output) => this.pull(output),
			cancel: (reason) => this.cancel(reason)
		});
	}
	/** Triggering workflow: encoded stream reader → source PCM → mono resampling → provider upload bytes. */
	async pull(output) {
		try {
			while (!this.closed) {
				if (this.ended) {
					const remaining = Math.floor(this.inputFrames * this.options.sampleRate / this.inputRate) - this.outputFrames;
					if (remaining > 0 && this.converter) {
						const tail = this.converter.full(new Float32Array(Math.max(1, Math.ceil(remaining * this.inputRate / this.options.sampleRate))));
						if (tail.length) {
							this.emit(tail.subarray(0, remaining), output);
							return;
						}
						continue;
					}
					output.close();
					this.release();
					return;
				}
				const result = await this.reader.read();
				if (this.closed) return;
				if (result.done) {
					this.ended = true;
					continue;
				}
				const block = result.value;
				if (this.inputRate !== void 0 && this.inputRate !== block.sampleRate) throw new Error("PCM sample rate changed during transcription");
				if (!block.channels.length || block.channels.some((channel) => channel.length !== block.channels[0].length)) throw new Error("Invalid PCM channel lengths");
				if (this.inputRate === void 0) {
					this.inputRate = block.sampleRate;
					if (this.inputRate !== this.options.sampleRate) {
						const { create, ConverterType } = await import("@alexanderolsen/libsamplerate-js");
						this.converter = await create(1, this.inputRate, this.options.sampleRate, { converterType: ConverterType.SRC_SINC_FASTEST });
						if (this.closed) {
							this.converter.destroy();
							return;
						}
					}
				}
				const mono = new Float32Array(block.channels[0].length);
				for (const channel of block.channels) for (let index = 0; index < mono.length; index++) mono[index] += channel[index] / block.channels.length;
				this.inputFrames += mono.length;
				const converted = this.converter ? this.converter.full(mono) : mono;
				if (converted.length) {
					this.emit(converted, output);
					return;
				}
			}
		} catch (error) {
			if (!this.closed) output.error(error);
			await this.cancel(error);
		}
	}
	emit(samples, output) {
		this.outputFrames += samples.length;
		output.enqueue(toPCM16FromFloat32(samples));
	}
	abort = () => {
		if (!this.closed) this.output?.error(this.options.signal?.reason);
		this.cancel(this.options.signal?.reason);
	};
	async cancel(reason) {
		if (this.closed) return;
		this.closed = true;
		try {
			await this.reader.cancel(reason).catch(() => {});
		} finally {
			this.release();
		}
	}
	release() {
		this.closed = true;
		this.options.signal?.removeEventListener("abort", this.abort);
		this.converter?.destroy();
		this.converter = void 0;
		this.reader.releaseLock();
	}
};
//#endregion
export { Pcm16Encoder };
