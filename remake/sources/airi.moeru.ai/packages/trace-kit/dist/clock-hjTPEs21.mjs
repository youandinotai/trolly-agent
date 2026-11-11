//#region src/core/clock.ts
const DEFAULT_OPTIONS = { fitWindow: 16 };
/** Weight floor in ms, so a sample with zero uncertainty does not take the whole fit. */
const MIN_UNCERTAINTY_MS = .05;
/**
* Converts values of any clock to one trace clock.
*
* State model:
* - Each `clock.snapshot` adds one sample to every clock pair in it, in both directions.
* - A `clock.discontinuity` starts a new segment for each pair of that clock. Values after it use only later samples.
*   A segment is found by value, so a clock must only jump forward. A clock that goes back gets a new name.
* - A conversion walks the shortest path of pairs from the clock to the trace clock, and composes the fits.
*
* The graph does not read a clock. It is a pure function of the snapshots that it received.
*/
var ClockGraph = class {
	traceClock;
	options;
	/** Units of each clock in one millisecond. A media clock in frames at 48 kHz has 48. */
	unitsPerMs = /* @__PURE__ */ new Map();
	pairs = /* @__PURE__ */ new Map();
	paths = /* @__PURE__ */ new Map();
	constructor(traceClock, options) {
		this.traceClock = traceClock;
		this.options = {
			...DEFAULT_OPTIONS,
			...options
		};
	}
	/** Declares the unit of a clock. A clock without a declared unit counts in milliseconds. */
	setUnitsPerMs(clock, unitsPerMs) {
		this.unitsPerMs.set(clock, unitsPerMs);
	}
	addSnapshot(values, uncertaintyMs, estimated = false) {
		for (const [index, a] of values.entries()) for (const b of values.slice(index + 1)) {
			if (a.clock === b.clock) continue;
			this.addSample(a.clock, b.clock, {
				from: a.value,
				to: b.value,
				uncertaintyMs,
				estimated
			});
			this.addSample(b.clock, a.clock, {
				from: b.value,
				to: a.value,
				uncertaintyMs,
				estimated
			});
		}
	}
	/** Starts a new segment for every pair of `clock`. Earlier samples stay for values before the jump. */
	addDiscontinuity(clock) {
		for (const [from, targets] of this.pairs) for (const [to, segments] of targets) if (from === clock || to === clock) segments.push({
			startFrom: Number.POSITIVE_INFINITY,
			samples: []
		});
	}
	/** Forgets every unit, snapshot, and discontinuity, for example before a reader reads another trace. */
	clear() {
		this.unitsPerMs.clear();
		this.pairs.clear();
		this.paths.clear();
	}
	/** Converts a value of `clock` to the trace clock. Returns `undefined` when no snapshot path exists. */
	convert(clock, value) {
		if (clock === this.traceClock) return {
			value,
			estimated: false
		};
		const path = this.pathTo(clock);
		if (!path) return void 0;
		let current = value;
		let estimated = false;
		for (let index = 0; index < path.length - 1; index++) {
			const map = this.fit(path[index], path[index + 1], current);
			if (!map) return void 0;
			current = current * map.slope + map.offset;
			estimated ||= map.estimated;
		}
		return {
			value: current,
			estimated
		};
	}
	addSample(from, to, sample) {
		let targets = this.pairs.get(from);
		if (!targets) {
			targets = /* @__PURE__ */ new Map();
			this.pairs.set(from, targets);
		}
		let segments = targets.get(to);
		if (!segments) {
			segments = [];
			targets.set(to, segments);
			this.paths.clear();
		}
		let segment = segments.at(-1);
		if (!segment) {
			segment = {
				startFrom: sample.from,
				samples: []
			};
			segments.push(segment);
		}
		if (segment.samples.length === 0) segment.startFrom = sample.from;
		segment.samples.push(sample);
		if (segment.samples.length > this.options.fitWindow) segment.samples.shift();
	}
	/**
	* Fits `to = from * slope + offset` over the samples of the segment that holds `value`.
	*
	* The segment is the latest one that starts at or before `value`. This is correct when a clock only jumps forward.
	* After a backward reset, a value from before the reset can match the new segment. So a clock that goes back must
	* get a new name, as the `clock.discontinuity` record type says.
	*
	* One sample gives the offset only, with the slope from the declared units. Two or more samples give a weighted
	* least squares fit, which also measures drift. Each sample weighs `1 / uncertainty²`.
	*/
	fit(from, to, value) {
		const segments = this.pairs.get(from)?.get(to);
		if (!segments) return void 0;
		let segment = segments.find((candidate) => candidate.samples.length > 0);
		for (const candidate of segments) if (candidate.samples.length > 0 && candidate.startFrom <= value) segment = candidate;
		if (!segment) return void 0;
		const unitSlope = (this.unitsPerMs.get(to) ?? 1) / (this.unitsPerMs.get(from) ?? 1);
		const samples = segment.samples;
		const estimated = samples.some((sample) => sample.estimated);
		if (samples.length === 1) {
			const sample = samples[0];
			return {
				slope: unitSlope,
				offset: sample.to - sample.from * unitSlope,
				estimated: estimated || unitSlope !== 1
			};
		}
		let weightSum = 0;
		let meanFrom = 0;
		let meanTo = 0;
		for (const sample of samples) {
			const weight = 1 / Math.max(sample.uncertaintyMs, MIN_UNCERTAINTY_MS) ** 2;
			weightSum += weight;
			meanFrom += weight * sample.from;
			meanTo += weight * sample.to;
		}
		meanFrom /= weightSum;
		meanTo /= weightSum;
		let covariance = 0;
		let variance = 0;
		for (const sample of samples) {
			const weight = 1 / Math.max(sample.uncertaintyMs, MIN_UNCERTAINTY_MS) ** 2;
			covariance += weight * (sample.from - meanFrom) * (sample.to - meanTo);
			variance += weight * (sample.from - meanFrom) ** 2;
		}
		const slope = variance > 0 ? covariance / variance : unitSlope;
		return {
			slope,
			offset: meanTo - meanFrom * slope,
			estimated
		};
	}
	/** Breadth-first search from `clock` to the trace clock. The result is cached until a new pair appears. */
	pathTo(clock) {
		const cached = this.paths.get(clock);
		if (cached !== void 0) return cached ?? void 0;
		const previous = /* @__PURE__ */ new Map([[clock, clock]]);
		const queue = [clock];
		while (queue.length > 0) {
			const current = queue.shift();
			if (current === this.traceClock) break;
			for (const next of this.pairs.get(current)?.keys() ?? []) {
				if (previous.has(next)) continue;
				previous.set(next, current);
				queue.push(next);
			}
		}
		if (!previous.has(this.traceClock)) {
			this.paths.set(clock, null);
			return;
		}
		const path = [this.traceClock];
		while (path[0] !== clock) path.unshift(previous.get(path[0]));
		this.paths.set(clock, path);
		return path;
	}
};
/**
* Runs a ping exchange with a remote clock and returns the sample with the smallest round trip.
*
* Each ping asks the remote side for its clock value. The local value at the middle of the round trip pairs with it.
* Half the round trip is the uncertainty. A failed ping is skipped. Returns `undefined` when every ping failed.
*/
async function measureClockOffset(options) {
	let best;
	for (let index = 0; index < (options.count ?? 5); index++) {
		const sentAt = options.now();
		let remote;
		try {
			remote = await options.ping();
		} catch {
			continue;
		}
		const uncertaintyMs = (options.now() - sentAt) / 2;
		if (!best || uncertaintyMs < best.uncertaintyMs) best = {
			local: sentAt + uncertaintyMs,
			remote,
			uncertaintyMs
		};
	}
	return best;
}
//#endregion
export { measureClockOffset as n, ClockGraph as t };
