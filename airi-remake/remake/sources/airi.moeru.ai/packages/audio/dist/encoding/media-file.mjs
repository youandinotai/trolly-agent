import { ALL_FORMATS, AudioSample, AudioSampleSink, AudioSampleSource, BlobSource, BufferTarget, Input, Output, WavOutputFormat } from "mediabunny";
import { nanoid } from "nanoid/non-secure";
//#region src/encoding/media-file.ts
function planar(block) {
	const frames = block.range.endFrame - block.range.startFrame;
	const data = new Float32Array(frames * block.channels.length);
	block.channels.forEach((channel, index) => data.set(channel, index * frames));
	return data;
}
/**
* Encodes PCM blocks into a 16-bit WAV file while the stream arrives.
*
* Mediabunny resamples and remixes to `options`. Aborting `signal` cancels the stream and the output.
*
* @example
* const wav = await encodeWav(capture.stream, { sampleRate: 16000, channels: 1 })
* // => Blob { type: 'audio/wav' }
*/
async function encodeWav(frames, options, signal) {
	const output = new Output({
		format: new WavOutputFormat(),
		target: new BufferTarget()
	});
	const source = new AudioSampleSource({
		codec: "pcm-s16",
		transform: {
			sampleRate: options.sampleRate,
			numberOfChannels: options.channels
		}
	});
	output.addAudioTrack(source);
	const reader = frames.getReader();
	const abort = () => void reader.cancel(signal?.reason).catch(() => {});
	signal?.addEventListener("abort", abort, { once: true });
	try {
		signal?.throwIfAborted();
		await output.start();
		let startFrame;
		while (true) {
			const { done, value: block } = await reader.read();
			signal?.throwIfAborted();
			if (done) break;
			startFrame ??= block.range.startFrame;
			const sample = new AudioSample({
				data: planar(block),
				format: "f32-planar",
				numberOfChannels: block.channels.length,
				sampleRate: block.sampleRate,
				timestamp: (block.range.startFrame - startFrame) / block.sampleRate
			});
			try {
				await source.add(sample);
			} finally {
				sample.close();
			}
		}
		source.close();
		await output.finalize();
		return new Blob([output.target.buffer], { type: "audio/wav" });
	} catch (error) {
		await output.cancel().catch(() => {});
		throw error;
	} finally {
		signal?.removeEventListener("abort", abort);
		reader.releaseLock();
	}
}
/**
* Decodes an audio file as a source. Each connection decodes from the start with new frame coordinates.
*
* A file is not live. Its reader sets the decode speed, so each consumer opens its own stream.
*
* The decoder is released when the file ends, decoding fails, the stream is cancelled, or `signal` aborts.
*
* @example
* const events = transcriber.transcribe({ audio: fileSource(recording).open(signal), signal })
*/
function fileSource(file) {
	return { open(signal) {
		const input = new Input({
			source: new BlobSource(file),
			formats: ALL_FORMATS
		});
		const sourceId = nanoid();
		let samples;
		let frame = 0;
		let released = false;
		function release() {
			if (released) return;
			released = true;
			signal.removeEventListener("abort", abort);
			samples?.return(void 0).catch(() => {});
			input.dispose();
		}
		let output;
		function abort() {
			output?.error(signal.reason);
			release();
		}
		return new ReadableStream({
			start(controller) {
				output = controller;
				signal.addEventListener("abort", abort, { once: true });
				if (signal.aborted) abort();
			},
			async pull(controller) {
				try {
					if (!samples) {
						const track = await input.getPrimaryAudioTrack();
						if (!track) throw new Error("The file has no audio track");
						samples = new AudioSampleSink(track).samples();
					}
					signal.throwIfAborted();
					const { done, value: sample } = await samples.next();
					if (released) return;
					if (done) {
						controller.close();
						release();
						return;
					}
					try {
						const channels = Array.from({ length: sample.numberOfChannels }, (_, planeIndex) => {
							const channel = new Float32Array(sample.numberOfFrames);
							sample.copyTo(channel, {
								format: "f32-planar",
								planeIndex
							});
							return channel;
						});
						controller.enqueue({
							range: {
								sourceId,
								startFrame: frame,
								endFrame: frame + sample.numberOfFrames
							},
							sampleRate: sample.sampleRate,
							channels
						});
						frame += sample.numberOfFrames;
					} finally {
						sample.close();
					}
				} catch (error) {
					release();
					throw error;
				}
			},
			cancel: release
		});
	} };
}
//#endregion
export { encodeWav, fileSource };
