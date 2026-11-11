import { clamp } from "es-toolkit/math";
//#region src/pose.ts
/** Pose axes used by Live2D motion adapters and filters. */
const poseAxes = [
	"eyeX",
	"eyeY",
	"eyeSquint",
	"headX",
	"headY",
	"headZ",
	"bodyX",
	"bodyY",
	"bodyZ",
	"mouthForm",
	"mouthOpen",
	"offsetX",
	"offsetY"
];
/** A pose with every normalized axis at its neutral value. */
const neutralPose = Object.freeze({
	eyeX: 0,
	eyeY: 0,
	eyeSquint: 0,
	headX: 0,
	headY: 0,
	headZ: 0,
	bodyX: 0,
	bodyY: 0,
	bodyZ: 0,
	mouthForm: 0,
	mouthOpen: 0,
	offsetX: 0,
	offsetY: 0
});
/** Converts one Live2D pose to the stable MAGIC channel order. */
function valuesFromPose(pose) {
	return poseAxes.map((axis) => pose[axis]);
}
/** Converts one MAGIC frame from the stable channel order to a Live2D pose. */
function poseFromValues(values) {
	if (values.length !== poseAxes.length) throw new Error(`The MAGIC frame must contain ${poseAxes.length} Live2D values.`);
	const pose = { ...neutralPose };
	for (let index = 0; index < poseAxes.length; index++) pose[poseAxes[index]] = values[index];
	return pose;
}
/** Converts a fixed-rate Live2D pose sequence to MAGIC training frames. */
function createTrainingSequence(source) {
	return {
		sampleRateHz: source.sampleRateHz,
		sourceDurationMs: source.sourceDurationMs,
		frames: source.poses.map(valuesFromPose)
	};
}
//#endregion
//#region src/filter.ts
/** Tuned controls used when a driver does not supply filter options. */
const defaultOutputFilterOptions = Object.freeze({
	enabled: true,
	smoothing: .8,
	cutoff: .0575
});
function normalizeOptions(options) {
	return {
		enabled: options.enabled,
		smoothing: clamp(options.smoothing, 0, .999),
		cutoff: clamp(options.cutoff, 0, 1)
	};
}
function meanAbsoluteDifference(left, right) {
	return poseAxes.reduce((sum, axis) => sum + Math.abs(left[axis] - right[axis]), 0) / poseAxes.length;
}
/** Creates one generated-pose output filter. */
function createOutputFilter(initialOptions = defaultOutputFilterOptions) {
	let options = normalizeOptions(initialOptions);
	let previousInput;
	let acceptedPose;
	let outputPose;
	function reset() {
		previousInput = void 0;
		acceptedPose = void 0;
		outputPose = void 0;
	}
	function setOptions(nextOptions) {
		const normalizedOptions = normalizeOptions(nextOptions);
		if (normalizedOptions.enabled !== options.enabled) reset();
		options = normalizedOptions;
	}
	function process(input) {
		const inputPose = { ...input };
		if (!previousInput || !acceptedPose || !outputPose) {
			previousInput = inputPose;
			acceptedPose = inputPose;
			outputPose = inputPose;
			return {
				inputPose,
				pose: inputPose,
				inputChangeMeanAbsolute: 0,
				outputChangeMeanAbsolute: 0,
				cutoffTrackCount: 0
			};
		}
		const previousOutput = outputPose;
		const inputChangeMeanAbsolute = meanAbsoluteDifference(inputPose, previousInput);
		previousInput = inputPose;
		if (!options.enabled) {
			acceptedPose = inputPose;
			outputPose = inputPose;
			return {
				inputPose,
				pose: inputPose,
				inputChangeMeanAbsolute,
				outputChangeMeanAbsolute: meanAbsoluteDifference(inputPose, previousOutput),
				cutoffTrackCount: 0
			};
		}
		const nextAcceptedPose = { ...acceptedPose };
		const nextOutputPose = { ...outputPose };
		let cutoffTrackCount = 0;
		for (const axis of poseAxes) {
			const changeFromAccepted = Math.abs(inputPose[axis] - acceptedPose[axis]);
			if (changeFromAccepted >= options.cutoff) nextAcceptedPose[axis] = inputPose[axis];
			else if (changeFromAccepted > 0) cutoffTrackCount++;
			nextOutputPose[axis] = outputPose[axis] * options.smoothing + nextAcceptedPose[axis] * (1 - options.smoothing);
		}
		acceptedPose = nextAcceptedPose;
		outputPose = nextOutputPose;
		return {
			inputPose,
			pose: nextOutputPose,
			inputChangeMeanAbsolute,
			outputChangeMeanAbsolute: meanAbsoluteDifference(nextOutputPose, previousOutput),
			cutoffTrackCount
		};
	}
	return {
		process,
		reset,
		setOptions
	};
}
//#endregion
//#region src/driver.ts
/** Creates a MAGIC driver for one Live2D target. */
function createDriver(options) {
	const now = options.now ?? (() => performance.now());
	const requestFrame = options.requestFrame ?? ((callback) => requestAnimationFrame(callback));
	const cancelFrame = options.cancelFrame ?? ((handle) => cancelAnimationFrame(handle));
	const filter = createOutputFilter(options.filterOptions ?? defaultOutputFilterOptions);
	let generator;
	let animationFrame;
	let lastFrameAt = 0;
	let accumulatedMs = 0;
	let outputFrame;
	function generatePose() {
		const frame = generator.next(options.generateOptions?.());
		options.onGenerate?.(frame.state);
		return poseFromValues(frame.values);
	}
	function applyPose(pose) {
		const filteredFrame = filter.process(pose);
		outputFrame = options.skipMouthOpen?.() ?? true ? {
			...filteredFrame,
			pose: {
				...filteredFrame.pose,
				mouthOpen: neutralPose.mouthOpen
			}
		} : filteredFrame;
		options.onOutput?.(outputFrame);
		options.target.apply(outputFrame.pose);
	}
	function generationFrame(timestamp) {
		if (!generator) return;
		const frameIntervalMs = 1e3 / generator.sampleRateHz;
		accumulatedMs += Math.min(250, Math.max(0, timestamp - lastFrameAt));
		lastFrameAt = timestamp;
		let nextPose;
		while (accumulatedMs >= frameIntervalMs) {
			nextPose = generatePose();
			accumulatedMs -= frameIntervalMs;
		}
		if (nextPose) applyPose(nextPose);
		animationFrame = requestFrame(generationFrame);
	}
	function start(nextGenerator) {
		if (generator) throw new Error("The MAGIC Live2D driver is already playing.");
		generator = nextGenerator;
		accumulatedMs = 0;
		lastFrameAt = now();
		filter.reset();
		outputFrame = void 0;
		options.onOutput?.(void 0);
		applyPose(generatePose());
		animationFrame = requestFrame(generationFrame);
	}
	function replace(nextGenerator) {
		if (!generator) throw new Error("The MAGIC Live2D driver is not playing.");
		generator = nextGenerator;
		accumulatedMs = 0;
		lastFrameAt = now();
	}
	function stop() {
		if (!generator) return;
		if (animationFrame !== void 0) cancelFrame(animationFrame);
		generator = void 0;
		animationFrame = void 0;
		accumulatedMs = 0;
		filter.reset();
		outputFrame = void 0;
		options.onOutput?.(void 0);
		options.target.release();
	}
	function setFilterOptions(filterOptions) {
		filter.setOptions(filterOptions);
	}
	function resetFilter() {
		const inputPose = outputFrame?.inputPose;
		filter.reset();
		outputFrame = void 0;
		options.onOutput?.(void 0);
		if (generator && inputPose) applyPose(inputPose);
	}
	return {
		get playing() {
			return generator !== void 0;
		},
		start,
		replace,
		stop,
		setFilterOptions,
		resetFilter,
		dispose: stop
	};
}
//#endregion
export { createDriver, createOutputFilter, createTrainingSequence, defaultOutputFilterOptions, neutralPose, poseAxes, poseFromValues, valuesFromPose };
