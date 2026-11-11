import { clamp } from "es-toolkit/math";
//#region src/shared/channels.ts
function mean(values) {
	return values.reduce((sum, value) => sum + value, 0) / values.length;
}
function standardDeviation(values, average) {
	const variance = values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length;
	return Math.sqrt(variance);
}
function tracksMatch(frames, left, right) {
	return frames.every((frame) => Math.abs(frame[left] - frame[right]) <= 1e-8);
}
/** Extracts varying channels and folds exact duplicate source curves together. */
function createMotionChannels(frames) {
	const channels = [];
	for (let valueIndex = 0; valueIndex < frames[0].length; valueIndex++) {
		const values = frames.map((frame) => frame[valueIndex]);
		const average = mean(values);
		const scale = standardDeviation(values, average);
		if (scale <= 1e-8) continue;
		const matchingChannel = channels.find((channel) => tracksMatch(frames, channel.valueIndices[0], valueIndex));
		if (matchingChannel) {
			matchingChannel.valueIndices.push(valueIndex);
			continue;
		}
		channels.push({
			valueIndices: [valueIndex],
			mean: average,
			scale,
			minimum: Math.min(...values),
			maximum: Math.max(...values)
		});
	}
	return channels;
}
/** Creates the mean frame, including values that are constant in the source. */
function createBaselineFrame(frames) {
	return Array.from({ length: frames[0].length }, (_, valueIndex) => mean(frames.map((frame) => frame[valueIndex])));
}
/** Projects normalized channel values back into a complete, bounded frame. */
function frameFromChannels(baselineFrame, channels, values) {
	const frame = [...baselineFrame];
	for (let channelIndex = 0; channelIndex < channels.length; channelIndex++) {
		const channel = channels[channelIndex];
		const rawValue = clamp(channel.mean + values[channelIndex] * channel.scale, channel.minimum, channel.maximum);
		for (const valueIndex of channel.valueIndices) frame[valueIndex] = rawValue;
	}
	return frame;
}
//#endregion
//#region src/shared/numeric.ts
/** Creates one intercept-and-lag feature vector from autoregressive history. */
function createAutoregressiveFeature(frames, order, channelCount, endIndex = frames.length) {
	const feature = [1];
	for (let lag = 1; lag <= order; lag++) {
		const frame = frames[endIndex - lag];
		for (let channel = 0; channel < channelCount; channel++) feature.push(frame[channel]);
	}
	return feature;
}
/** Applies autoregressive coefficients to one feature vector. */
function predictAutoregressiveValues(coefficients, feature) {
	const outputCount = coefficients[0].length;
	const prediction = Array.from({ length: outputCount }).fill(0);
	for (let featureIndex = 0; featureIndex < feature.length; featureIndex++) for (let outputIndex = 0; outputIndex < outputCount; outputIndex++) prediction[outputIndex] += feature[featureIndex] * coefficients[featureIndex][outputIndex];
	return prediction;
}
/** Computes the lower-triangular Cholesky factor of a positive-definite matrix. */
function cholesky(matrix, singularMessage) {
	const size = matrix.length;
	const lower = Array.from({ length: size }, () => Array.from({ length: size }).fill(0));
	for (let row = 0; row < size; row++) for (let column = 0; column <= row; column++) {
		let value = matrix[row][column];
		for (let index = 0; index < column; index++) value -= lower[row][index] * lower[column][index];
		if (row === column) {
			if (value <= 1e-12) throw new Error(singularMessage);
			lower[row][column] = Math.sqrt(value);
		} else lower[row][column] = value / lower[column][column];
	}
	return lower;
}
/** Solves a positive-definite linear system for one or more target columns. */
function solvePositiveDefinite(matrix, targets, singularMessage) {
	const lower = cholesky(matrix, singularMessage);
	const size = matrix.length;
	const outputCount = targets[0].length;
	const intermediate = Array.from({ length: size }, () => Array.from({ length: outputCount }).fill(0));
	for (let row = 0; row < size; row++) for (let output = 0; output < outputCount; output++) {
		let value = targets[row][output];
		for (let column = 0; column < row; column++) value -= lower[row][column] * intermediate[column][output];
		intermediate[row][output] = value / lower[row][row];
	}
	const solution = Array.from({ length: size }, () => Array.from({ length: outputCount }).fill(0));
	for (let row = size - 1; row >= 0; row--) for (let output = 0; output < outputCount; output++) {
		let value = intermediate[row][output];
		for (let column = row + 1; column < size; column++) value -= lower[column][row] * solution[column][output];
		solution[row][output] = value / lower[row][row];
	}
	return solution;
}
//#endregion
//#region src/shared/random.ts
/** Creates a deterministic uniform random stream from one unsigned seed. */
function createSeededRandom(seed) {
	let state = seed >>> 0;
	return () => {
		state += 1831565813;
		let value = state;
		value = Math.imul(value ^ value >>> 15, value | 1);
		value ^= value + Math.imul(value ^ value >>> 7, value | 61);
		return ((value ^ value >>> 14) >>> 0) / 4294967296;
	};
}
/** Samples an index from a normalized categorical distribution. */
function sampleCategorical(probabilities, random) {
	const target = random();
	let cumulative = 0;
	for (let index = 0; index < probabilities.length; index++) {
		cumulative += probabilities[index];
		if (target <= cumulative) return index;
	}
	return probabilities.length - 1;
}
/** Creates a standard-normal random stream from a uniform random stream. */
function createNormalRandom(random) {
	let spare;
	return () => {
		if (spare !== void 0) {
			const value = spare;
			spare = void 0;
			return value;
		}
		const radius = Math.sqrt(-2 * Math.log(Math.max(Number.EPSILON, random())));
		const angle = 2 * Math.PI * random();
		spare = radius * Math.sin(angle);
		return radius * Math.cos(angle);
	};
}
//#endregion
//#region src/shared/var.ts
function fitCoefficients(frames, options) {
	const channelCount = frames[0].length;
	const featureCount = 1 + options.order * channelCount;
	const gram = Array.from({ length: featureCount }, () => Array.from({ length: featureCount }).fill(0));
	const cross = Array.from({ length: featureCount }, () => Array.from({ length: channelCount }).fill(0));
	for (let frameIndex = options.order; frameIndex < frames.length; frameIndex++) {
		const feature = createAutoregressiveFeature(frames, options.order, channelCount, frameIndex);
		const target = frames[frameIndex];
		for (let row = 0; row < featureCount; row++) {
			for (let column = 0; column <= row; column++) gram[row][column] += feature[row] * feature[column];
			for (let output = 0; output < channelCount; output++) cross[row][output] += feature[row] * target[output];
		}
	}
	for (let row = 0; row < featureCount; row++) for (let column = 0; column < row; column++) gram[column][row] = gram[row][column];
	const trainingRowCount = frames.length - options.order;
	for (let index = 1; index < featureCount; index++) gram[index][index] += options.ridge * trainingRowCount;
	return solvePositiveDefinite(gram, cross, "The VAR fit is numerically singular. Increase the ridge penalty.");
}
function createResiduals(frames, coefficients, order) {
	const channelCount = frames[0].length;
	const residuals = [];
	for (let frameIndex = order; frameIndex < frames.length; frameIndex++) {
		const prediction = predictAutoregressiveValues(coefficients, createAutoregressiveFeature(frames, order, channelCount, frameIndex));
		residuals.push(frames[frameIndex].map((value, channel) => value - prediction[channel]));
	}
	return residuals;
}
/** Fits the VAR parameters that both public methods use. */
function fitVarParameters(sequence, options) {
	if (!Number.isFinite(sequence.sampleRateHz) || sequence.sampleRateHz <= 0) throw new Error("The motion sample rate must be positive.");
	if (options.order < 1 || !Number.isInteger(options.order)) throw new Error("The VAR order must be a positive integer.");
	const frames = sequence.frames;
	if (frames.length === 0 || frames[0].length === 0) throw new Error("The motion sequence must contain at least one value.");
	if (frames.some((frame) => frame.length !== frames[0].length)) throw new Error("Every motion frame must have the same number of values.");
	const channels = createMotionChannels(frames);
	if (channels.length === 0) throw new Error("The current motion has no changing channels.");
	if (frames.length <= options.order + 1) throw new Error("The current motion is too short for this VAR order.");
	const baselineFrame = createBaselineFrame(frames);
	const trainingFrames = frames.map((frame) => channels.map((channel) => (frame[channel.valueIndices[0]] - channel.mean) / channel.scale));
	const coefficients = fitCoefficients(trainingFrames, options);
	const residuals = createResiduals(trainingFrames, coefficients, options.order);
	const squaredResidualSum = residuals.reduce((sum, residual) => sum + residual.reduce((channelSum, value) => channelSum + value ** 2, 0), 0);
	return {
		options,
		sampleRateHz: sequence.sampleRateHz,
		sourceFrameCount: frames.length,
		channelCount: channels.length,
		featureCount: coefficients.length,
		residualRootMeanSquare: Math.sqrt(squaredResidualSum / (residuals.length * channels.length)),
		channels,
		coefficients,
		residuals,
		trainingFrames,
		baselineFrame
	};
}
/** Creates one independent VAR generator from internal model parameters. */
function toVarGenerator(parameters, options) {
	const random = createSeededRandom(options.seed);
	const maximumStart = parameters.trainingFrames.length - parameters.options.order;
	const start = Math.floor(random() * maximumStart);
	const history = parameters.trainingFrames.slice(start, start + parameters.options.order).map((frame) => [...frame]);
	function next(generateOptions) {
		const noiseScale = generateOptions?.noiseScale ?? 1;
		const feature = createAutoregressiveFeature(history, parameters.options.order, parameters.channelCount);
		const prediction = predictAutoregressiveValues(parameters.coefficients, feature);
		const residual = parameters.residuals[Math.floor(random() * parameters.residuals.length)];
		const nextFrame = prediction.map((value, channelIndex) => {
			const channel = parameters.channels[channelIndex];
			const rawValue = channel.mean + (value + residual[channelIndex] * noiseScale) * channel.scale;
			return (Math.min(channel.maximum, Math.max(channel.minimum, rawValue)) - channel.mean) / channel.scale;
		});
		history.shift();
		history.push(nextFrame);
		return {
			values: frameFromChannels(parameters.baselineFrame, parameters.channels, nextFrame),
			state: void 0
		};
	}
	return {
		sampleRateHz: parameters.sampleRateHz,
		next
	};
}
//#endregion
//#region src/ar-hmm.ts
function logSumExp(values) {
	const maximum = Math.max(...values);
	let sum = 0;
	for (const value of values) sum += Math.exp(value - maximum);
	return maximum + Math.log(sum);
}
function normalizeProbabilities(values) {
	const sum = values.reduce((total, value) => total + value, 0);
	return values.map((value) => value / sum);
}
function squaredDistance(left, right) {
	return left.reduce((sum, value, index) => sum + (value - right[index]) ** 2, 0);
}
function createClusterFeatures(frames, order) {
	const channelCount = frames[0].length;
	const velocityScales = Array.from({ length: channelCount }).fill(0);
	for (let frameIndex = order; frameIndex < frames.length; frameIndex++) for (let channel = 0; channel < channelCount; channel++) velocityScales[channel] += (frames[frameIndex][channel] - frames[frameIndex - 1][channel]) ** 2;
	for (let channel = 0; channel < channelCount; channel++) velocityScales[channel] = Math.max(1e-6, Math.sqrt(velocityScales[channel] / (frames.length - order)));
	return frames.slice(order).map((frame, rowIndex) => [...frame, ...frame.map((value, channel) => (value - frames[rowIndex + order - 1][channel]) / velocityScales[channel])]);
}
function initializeAssignments(features, stateCount) {
	const velocityOffset = features[0].length / 2;
	let quietestIndex = 0;
	let quietestSpeed = Number.POSITIVE_INFINITY;
	for (let index = 0; index < features.length; index++) {
		const speed = features[index].slice(velocityOffset).reduce((sum, value) => sum + value ** 2, 0);
		if (speed < quietestSpeed) {
			quietestSpeed = speed;
			quietestIndex = index;
		}
	}
	const centroids = [[...features[quietestIndex]]];
	while (centroids.length < stateCount) {
		let farthestIndex = 0;
		let farthestDistance = -1;
		for (let index = 0; index < features.length; index++) {
			const distance = Math.min(...centroids.map((centroid) => squaredDistance(features[index], centroid)));
			if (distance > farthestDistance) {
				farthestDistance = distance;
				farthestIndex = index;
			}
		}
		centroids.push([...features[farthestIndex]]);
	}
	const assignments = Array.from({ length: features.length }).fill(0);
	for (let iteration = 0; iteration < 12; iteration++) {
		for (let row = 0; row < features.length; row++) {
			let bestState = 0;
			let bestDistance = Number.POSITIVE_INFINITY;
			for (let state = 0; state < stateCount; state++) {
				const distance = squaredDistance(features[row], centroids[state]);
				if (distance < bestDistance) {
					bestDistance = distance;
					bestState = state;
				}
			}
			assignments[row] = bestState;
		}
		const nextCentroids = Array.from({ length: stateCount }, () => Array.from({ length: features[0].length }).fill(0));
		const counts = Array.from({ length: stateCount }).fill(0);
		for (let row = 0; row < features.length; row++) {
			counts[assignments[row]]++;
			for (let feature = 0; feature < features[row].length; feature++) nextCentroids[assignments[row]][feature] += features[row][feature];
		}
		for (let state = 0; state < stateCount; state++) {
			if (counts[state] === 0) continue;
			centroids[state] = nextCentroids[state].map((value) => value / counts[state]);
		}
	}
	return assignments;
}
function createInitialExpectations(assignments, stateCount) {
	const probabilityFloor = .001;
	const gamma = assignments.map((assignedState) => Array.from({ length: stateCount }, (_, state) => state === assignedState ? 1 - probabilityFloor * (stateCount - 1) : probabilityFloor));
	const transitionCounts = Array.from({ length: stateCount }, () => Array.from({ length: stateCount }).fill(.1));
	for (let row = 1; row < assignments.length; row++) transitionCounts[assignments[row - 1]][assignments[row]]++;
	return {
		gamma,
		transitionCounts,
		logLikelihood: Number.NEGATIVE_INFINITY
	};
}
function fitStateCoefficients(frames, gamma, state, sourceModel, options) {
	const channelCount = sourceModel.channelCount;
	const featureCount = 1 + options.order * channelCount;
	const gram = Array.from({ length: featureCount }, () => Array.from({ length: featureCount }).fill(0));
	const cross = Array.from({ length: featureCount }, () => Array.from({ length: channelCount }).fill(0));
	let stateWeight = 0;
	for (let row = 0; row < gamma.length; row++) {
		const weight = gamma[row][state];
		const frameIndex = row + options.order;
		const feature = createAutoregressiveFeature(frames, options.order, channelCount, frameIndex);
		const target = frames[frameIndex];
		stateWeight += weight;
		for (let featureRow = 0; featureRow < featureCount; featureRow++) {
			for (let featureColumn = 0; featureColumn <= featureRow; featureColumn++) gram[featureRow][featureColumn] += weight * feature[featureRow] * feature[featureColumn];
			for (let output = 0; output < channelCount; output++) cross[featureRow][output] += weight * feature[featureRow] * target[output];
		}
	}
	if (stateWeight < featureCount + 1) return sourceModel.coefficients.map((row) => [...row]);
	for (let row = 0; row < featureCount; row++) for (let column = 0; column < row; column++) gram[column][row] = gram[row][column];
	for (let index = 1; index < featureCount; index++) gram[index][index] += options.ridge * stateWeight;
	return solvePositiveDefinite(gram, cross, "The AR-HMM fit produced a singular covariance.");
}
function fitStateCovariance(frames, gamma, state, coefficients, options) {
	const channelCount = frames[0].length;
	const covariance = Array.from({ length: channelCount }, () => Array.from({ length: channelCount }).fill(0));
	let stateWeight = 0;
	for (let row = 0; row < gamma.length; row++) {
		const weight = gamma[row][state];
		const frameIndex = row + options.order;
		const prediction = predictAutoregressiveValues(coefficients, createAutoregressiveFeature(frames, options.order, channelCount, frameIndex));
		const residual = frames[frameIndex].map((value, channel) => value - prediction[channel]);
		stateWeight += weight;
		for (let left = 0; left < channelCount; left++) for (let right = 0; right <= left; right++) covariance[left][right] += weight * residual[left] * residual[right];
	}
	for (let left = 0; left < channelCount; left++) {
		for (let right = 0; right <= left; right++) {
			covariance[left][right] /= stateWeight;
			covariance[right][left] = covariance[left][right];
		}
		covariance[left][left] += .0025;
	}
	return covariance;
}
function maximizeParameters(sourceModel, expectation, options) {
	return {
		initialProbabilities: normalizeProbabilities(expectation.gamma[0].map((value) => value + .1)),
		transitionProbabilities: expectation.transitionCounts.map((row, state) => normalizeProbabilities(row.map((value, nextState) => value + (state === nextState ? 2 : .1)))),
		states: Array.from({ length: options.stateCount }, (_, state) => {
			const coefficients = fitStateCoefficients(sourceModel.trainingFrames, expectation.gamma, state, sourceModel, options);
			const covariance = fitStateCovariance(sourceModel.trainingFrames, expectation.gamma, state, coefficients, options);
			return {
				coefficients,
				covariance,
				covarianceCholesky: cholesky(covariance, "The AR-HMM fit produced a singular covariance.")
			};
		})
	};
}
function emissionLogProbability(state, feature, observation) {
	const prediction = predictAutoregressiveValues(state.coefficients, feature);
	const solved = Array.from({ length: observation.length }).fill(0);
	for (let row = 0; row < observation.length; row++) {
		let value = observation[row] - prediction[row];
		for (let column = 0; column < row; column++) value -= state.covarianceCholesky[row][column] * solved[column];
		solved[row] = value / state.covarianceCholesky[row][row];
	}
	const quadratic = solved.reduce((sum, value) => sum + value ** 2, 0);
	const logDeterminant = 2 * state.covarianceCholesky.reduce((sum, row, index) => sum + Math.log(row[index]), 0);
	return -.5 * (observation.length * Math.log(2 * Math.PI) + logDeterminant + quadratic);
}
function expectationStep(sourceModel, parameters, options) {
	const frames = sourceModel.trainingFrames;
	const rowCount = frames.length - options.order;
	const emissions = Array.from({ length: rowCount }, (_, row) => {
		const frameIndex = row + options.order;
		const feature = createAutoregressiveFeature(frames, options.order, sourceModel.channelCount, frameIndex);
		return parameters.states.map((state) => emissionLogProbability(state, feature, frames[frameIndex]));
	});
	const logTransitions = parameters.transitionProbabilities.map((row) => row.map(Math.log));
	const alpha = Array.from({ length: rowCount }, () => Array.from({ length: options.stateCount }).fill(0));
	const firstAlpha = parameters.initialProbabilities.map((probability, state) => Math.log(probability) + emissions[0][state]);
	let scale = logSumExp(firstAlpha);
	let logLikelihood = scale;
	alpha[0] = firstAlpha.map((value) => value - scale);
	for (let row = 1; row < rowCount; row++) {
		const nextAlpha = Array.from({ length: options.stateCount }, (_, state) => emissions[row][state] + logSumExp(alpha[row - 1].map((value, previousState) => value + logTransitions[previousState][state])));
		scale = logSumExp(nextAlpha);
		logLikelihood += scale;
		alpha[row] = nextAlpha.map((value) => value - scale);
	}
	const beta = Array.from({ length: rowCount }, () => Array.from({ length: options.stateCount }).fill(0));
	for (let row = rowCount - 2; row >= 0; row--) {
		const nextBeta = Array.from({ length: options.stateCount }, (_, state) => logSumExp(beta[row + 1].map((value, nextState) => logTransitions[state][nextState] + emissions[row + 1][nextState] + value)));
		const betaScale = logSumExp(nextBeta);
		beta[row] = nextBeta.map((value) => value - betaScale);
	}
	const gamma = alpha.map((row, rowIndex) => {
		const values = row.map((value, state) => value + beta[rowIndex][state]);
		const normalization = logSumExp(values);
		return values.map((value) => Math.exp(value - normalization));
	});
	const transitionCounts = Array.from({ length: options.stateCount }, () => Array.from({ length: options.stateCount }).fill(0));
	for (let row = 0; row < rowCount - 1; row++) {
		const values = alpha[row].flatMap((value, state) => parameters.states.map((_nextStateModel, nextState) => value + logTransitions[state][nextState] + emissions[row + 1][nextState] + beta[row + 1][nextState]));
		const normalization = logSumExp(values);
		for (let state = 0; state < options.stateCount; state++) for (let nextState = 0; nextState < options.stateCount; nextState++) transitionCounts[state][nextState] += Math.exp(values[state * options.stateCount + nextState] - normalization);
	}
	return {
		gamma,
		transitionCounts,
		logLikelihood
	};
}
/** Creates a linear Gaussian AR-HMM model with deterministic clustering and EM updates. */
function createArHmmModel(sequence, options) {
	if (options.stateCount < 2 || !Number.isInteger(options.stateCount)) throw new Error("The AR-HMM state count must be an integer greater than one.");
	if (options.iterations < 1 || !Number.isInteger(options.iterations)) throw new Error("The AR-HMM iteration count must be a positive integer.");
	const sourceModel = fitVarParameters(sequence, {
		order: options.order,
		ridge: options.ridge
	});
	const rowCount = sourceModel.trainingFrames.length - options.order;
	if (rowCount < options.stateCount * (sourceModel.featureCount + 1)) throw new Error("The current motion is too short for this AR-HMM shape.");
	let expectation = createInitialExpectations(initializeAssignments(createClusterFeatures(sourceModel.trainingFrames, options.order), options.stateCount), options.stateCount);
	let stateParameters = maximizeParameters(sourceModel, expectation, options);
	const logLikelihoods = [];
	for (let iteration = 0; iteration < options.iterations; iteration++) {
		expectation = expectationStep(sourceModel, stateParameters, options);
		logLikelihoods.push(expectation.logLikelihood);
		stateParameters = maximizeParameters(sourceModel, expectation, options);
	}
	expectation = expectationStep(sourceModel, stateParameters, options);
	logLikelihoods.push(expectation.logLikelihood);
	const stateOccupancy = normalizeProbabilities(Array.from({ length: options.stateCount }, (_, state) => expectation.gamma.reduce((sum, probabilities) => sum + probabilities[state], 0)));
	const meanDwellFrames = stateOccupancy.reduce((sum, occupancy, state) => {
		return sum + occupancy / Math.max(1 / rowCount, 1 - stateParameters.transitionProbabilities[state][state]);
	}, 0);
	const modelParameters = {
		options,
		sourceModel,
		...stateParameters,
		posteriorProbabilities: expectation.gamma
	};
	const diagnostics = Object.freeze({
		sourceFrameCount: sourceModel.sourceFrameCount,
		channelCount: sourceModel.channelCount,
		featureCount: sourceModel.featureCount,
		stateCount: options.stateCount,
		meanLogLikelihoodPerFrame: logLikelihoods.at(-1) / expectation.gamma.length,
		stateOccupancy: Object.freeze([...stateOccupancy]),
		meanDwellSeconds: meanDwellFrames / sourceModel.sampleRateHz
	});
	return Object.freeze({
		method: "ar-hmm",
		sampleRateHz: sourceModel.sampleRateHz,
		diagnostics,
		toGenerator: (generatorOptions) => toGenerator(modelParameters, generatorOptions)
	});
}
function toGenerator(model, options) {
	const random = createSeededRandom(options.seed);
	const normalRandom = createNormalRandom(random);
	const maximumStart = model.sourceModel.trainingFrames.length - model.options.order;
	const start = Math.floor(random() * maximumStart);
	const history = model.sourceModel.trainingFrames.slice(start, start + model.options.order).map((frame) => [...frame]);
	let state = sampleCategorical(model.posteriorProbabilities[start], random);
	function next(generateOptions) {
		const noiseScale = generateOptions?.noiseScale ?? 1;
		state = sampleCategorical(model.transitionProbabilities[state], random);
		const stateModel = model.states[state];
		const feature = createAutoregressiveFeature(history, model.options.order, model.sourceModel.channelCount);
		const prediction = predictAutoregressiveValues(stateModel.coefficients, feature);
		const gaussian = Array.from({ length: model.sourceModel.channelCount }, normalRandom);
		const nextValues = prediction.map((value, channel) => {
			let noise = 0;
			for (let source = 0; source <= channel; source++) noise += stateModel.covarianceCholesky[channel][source] * gaussian[source];
			const sourceChannel = model.sourceModel.channels[channel];
			const rawValue = sourceChannel.mean + (value + noise * noiseScale) * sourceChannel.scale;
			return (clamp(rawValue, sourceChannel.minimum, sourceChannel.maximum) - sourceChannel.mean) / sourceChannel.scale;
		});
		history.shift();
		history.push(nextValues);
		return {
			values: frameFromChannels(model.sourceModel.baselineFrame, model.sourceModel.channels, nextValues),
			state
		};
	}
	return {
		sampleRateHz: model.sourceModel.sampleRateHz,
		next
	};
}
//#endregion
//#region src/crossfade.ts
function smoothstep(progress) {
	return progress * progress * (3 - 2 * progress);
}
/**
* Blends the frames of one generator into the frames of another generator.
*
* Both generators advance on each frame until the blend ends, so the outgoing
* motion keeps moving while it fades. A smoothstep weight starts and ends the
* blend without a jump in speed. After the blend, the result returns the frames
* of `to` only, with its own state.
*
* Use when:
* - A motion source changes its profile, for example from idle to speaking.
*
* Expects:
* - Both generators have the same sample rate and the same frame width.
*/
function crossfade(from, to, options) {
	if (from.sampleRateHz !== to.sampleRateHz) throw new Error(`Cannot crossfade generators with different sample rates: ${from.sampleRateHz} Hz and ${to.sampleRateHz} Hz.`);
	const frameCount = Math.max(0, Math.round(options.frameCount));
	let frameIndex = 0;
	function next(generateOptions) {
		const target = to.next(generateOptions);
		if (frameIndex >= frameCount) return target;
		frameIndex += 1;
		const source = from.next(generateOptions);
		if (source.values.length !== target.values.length) throw new Error(`Cannot crossfade frames with different widths: ${source.values.length} and ${target.values.length}.`);
		const weight = smoothstep(frameIndex / frameCount);
		return {
			values: target.values.map((value, index) => source.values[index] + (value - source.values[index]) * weight),
			state: target.state
		};
	}
	return {
		sampleRateHz: to.sampleRateHz,
		next
	};
}
//#endregion
//#region src/var.ts
/** Creates a ridge-regularized VAR model from a fixed-rate motion sequence. */
function createVarModel(sequence, options) {
	const parameters = fitVarParameters(sequence, options);
	const diagnostics = Object.freeze({
		sourceFrameCount: parameters.sourceFrameCount,
		channelCount: parameters.channelCount,
		featureCount: parameters.featureCount,
		residualRootMeanSquare: parameters.residualRootMeanSquare
	});
	return Object.freeze({
		method: "var",
		sampleRateHz: parameters.sampleRateHz,
		diagnostics,
		toGenerator: (generatorOptions) => toVarGenerator(parameters, generatorOptions)
	});
}
//#endregion
//#region src/fit.ts
function fit(sequence, options) {
	if (options.method === "var") return createVarModel(sequence, {
		order: options.order,
		ridge: options.ridge
	});
	return createArHmmModel(sequence, {
		stateCount: options.stateCount,
		order: options.order,
		ridge: options.ridge,
		iterations: options.iterations
	});
}
//#endregion
export { createArHmmModel, createVarModel, crossfade, fit };
