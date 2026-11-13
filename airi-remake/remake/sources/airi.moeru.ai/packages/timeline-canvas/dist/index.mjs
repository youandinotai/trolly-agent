//#region src/view.ts
/** Pixels for one millisecond. */
function pixelsPerMs(view) {
	return view.width / Math.max(Number.EPSILON, view.end - view.start);
}
/** The x offset of a time, in CSS pixels from the left of the view. */
function timeToX(view, time) {
	return (time - view.start) * pixelsPerMs(view);
}
/** The time at an x offset, in CSS pixels from the left of the view. */
function xToTime(view, x) {
	return view.start + x / pixelsPerMs(view);
}
//#endregion
//#region src/aggregate.ts
/** Pixels outside the view that a shape can reach, so a clipped edge does not draw a rounded corner in view. */
const CLIP_MARGIN_PX = 8;
/**
* The shapes of the visible intervals of a column.
*
* The work is linear in the number of visible intervals, and the output is bounded by the view width times the number
* of styles, because narrow intervals merge. That keeps a million intervals drawable when zoomed out.
*
* The shapes come out in the start order of their first interval, across styles. Wider intervals can overlap, and a
* later run draws over an earlier one, so the top shape is the interval that `hitInterval` picks.
*/
function intervalRuns(column, view, options = {}) {
	const mergeBelowPx = options.mergeBelowPx ?? 2;
	const minWidthPx = options.minWidthPx ?? 1;
	const ppm = pixelsPerMs(view);
	const right = view.width + CLIP_MARGIN_PX;
	const openEnd = options.now ?? view.end;
	const runs = [];
	const current = /* @__PURE__ */ new Map();
	const take = (index) => {
		const start = column.starts[index];
		const rawEnd = column.ends[index];
		const open = Number.isNaN(rawEnd);
		const end = open ? Math.max(start, openEnd) : rawEnd;
		if (end < view.start || start > view.end) return;
		const x0 = Math.max(-8, (start - view.start) * ppm);
		const x1 = Math.min(right, Math.max(x0 + minWidthPx, (end - view.start) * ppm));
		const style = column.styles[index];
		const run = current.get(style);
		if (x1 - x0 >= mergeBelowPx) {
			if (run) {
				runs.push(run);
				current.delete(style);
			}
			runs.push({
				x0,
				x1,
				style,
				index,
				count: 1,
				open
			});
			return;
		}
		if (run && x0 <= run.x1 + 1) {
			run.x1 = Math.max(run.x1, x1);
			run.count++;
			run.open ||= open;
			return;
		}
		if (run) runs.push(run);
		current.set(style, {
			x0,
			x1,
			style,
			index,
			count: 1,
			open
		});
	};
	const flush = () => {
		for (const run of current.values()) runs.push(run);
		current.clear();
	};
	const { begin, end } = column.visibleRange(view.start, view.end);
	const before = [...column.openIndices].filter((index) => index < begin).sort((a, b) => a - b);
	for (const index of before) take(index);
	flush();
	for (let index = begin; index < end; index++) take(index);
	flush();
	return runs.sort((a, b) => a.index - b.index);
}
/**
* The marks of the visible points of a column.
*
* Sparse points draw one by one, and a point closer than `bucketPx` to the last drawn point is skipped. Dense points
* draw as a histogram of `bucketPx` buckets. A bucket takes the style of its first point.
*/
function pointMarks(column, view, options = {}) {
	const bucketPx = options.bucketPx ?? 3;
	const ppm = pixelsPerMs(view);
	const { begin, end } = column.visibleRange(view.start, view.end);
	const visible = end - begin;
	const marks = [];
	if (visible <= 0) return marks;
	if (visible <= view.width / bucketPx) {
		let lastX = Number.NEGATIVE_INFINITY;
		for (let index = begin; index < end; index++) {
			const x = (column.times[index] - view.start) * ppm;
			if (x - lastX < bucketPx) continue;
			marks.push({
				kind: "point",
				x,
				style: column.styles[index],
				index
			});
			lastX = x;
		}
		return marks;
	}
	const bucketCount = Math.ceil(view.width / bucketPx);
	const counts = new Uint32Array(bucketCount);
	const firsts = new Int32Array(bucketCount).fill(-1);
	for (let index = begin; index < end; index++) {
		const bucket = Math.min(bucketCount - 1, Math.max(0, Math.floor((column.times[index] - view.start) * ppm / bucketPx)));
		counts[bucket]++;
		if (firsts[bucket] === -1) firsts[bucket] = index;
	}
	for (let bucket = 0; bucket < bucketCount; bucket++) {
		if (counts[bucket] === 0) continue;
		const index = firsts[bucket];
		marks.push({
			kind: "bucket",
			x0: bucket * bucketPx,
			x1: (bucket + 1) * bucketPx,
			count: counts[bucket],
			style: column.styles[index],
			index
		});
	}
	return marks;
}
//#endregion
//#region src/search.ts
/**
* The first index in `[0, count)` whose value is not less than `value`. Returns `count` when every value is less.
*
* @example
* lowerBound(new Float64Array([1, 3, 3, 5]), 4, 3)
* // => 1
*/
function lowerBound(column, count, value) {
	let low = 0;
	let high = count;
	while (low < high) {
		const middle = low + high >>> 1;
		if (column[middle] < value) low = middle + 1;
		else high = middle;
	}
	return low;
}
/**
* The first index in `[0, count)` whose value is greater than `value`. Returns `count` when no value is greater.
*
* @example
* upperBound(new Float64Array([1, 3, 3, 5]), 4, 3)
* // => 3
*/
function upperBound(column, count, value) {
	let low = 0;
	let high = count;
	while (low < high) {
		const middle = low + high >>> 1;
		if (column[middle] <= value) low = middle + 1;
		else high = middle;
	}
	return low;
}
//#endregion
//#region src/columns.ts
/** Growth factor of a column when it is full. */
const GROWTH = 2;
const INITIAL_CAPACITY = 64;
/**
* The largest style index that a column stores. The styles are a `Uint16Array`, so a million items take 2 MB of styles.
* A row needs a few dozen styles.
*/
const MAX_STYLE_INDEX = 65535;
/** Rejects a style index that a `Uint16Array` cannot hold, because the array would wrap it to another style. */
function assertStyleIndex(style) {
	if (!Number.isInteger(style) || style < 0 || style > 65535) throw new RangeError(`Style index ${style} is not an integer from 0 to ${MAX_STYLE_INDEX}`);
}
/** A copy of a typed array with more capacity. */
function grow(array, capacity) {
	const next = new array.constructor(capacity);
	next.set(array);
	return next;
}
/**
* Intervals in columns of typed arrays, sorted by start.
*
* - An open interval has the end `NaN`. It draws to the time that the caller gives as now.
* - `style` indexes the style table of the lane, so a million items need no style objects.
* - `keys` hold the identity of each item, for example a span key, for selection and hover.
* - `maxSpan` is the length of the longest closed interval. A visible search starts this far before the view, so it
*   finds intervals that start before the view and end inside it. An open interval is kept in `openIndices` instead.
*
* Appends must come in start order. An out-of-order append inserts with a copy, which is slow but correct.
*/
var IntervalColumn = class {
	starts = new Float64Array(INITIAL_CAPACITY);
	ends = new Float64Array(INITIAL_CAPACITY);
	styles = new Uint16Array(INITIAL_CAPACITY);
	keys = [];
	count = 0;
	maxSpan = 0;
	/** Indices of open intervals. An open interval can start long before the view and still cover it. */
	openIndices = /* @__PURE__ */ new Set();
	append(start, end, style, key) {
		assertStyleIndex(style);
		this.ensureCapacity(this.count + 1);
		let index = this.count;
		if (index > 0 && this.starts[index - 1] > start) {
			index = upperBound(this.starts, this.count, start);
			this.starts.copyWithin(index + 1, index, this.count);
			this.ends.copyWithin(index + 1, index, this.count);
			this.styles.copyWithin(index + 1, index, this.count);
			this.keys.splice(index, 0, key);
			this.shiftOpenIndices(index);
		} else this.keys.push(key);
		this.starts[index] = start;
		this.ends[index] = end ?? NaN;
		this.styles[index] = style;
		this.count++;
		if (end === void 0) this.openIndices.add(index);
		else this.maxSpan = Math.max(this.maxSpan, end - start);
		return index;
	}
	/** Closes an open interval, for example when its span ends. */
	close(index, end) {
		this.ends[index] = end;
		this.openIndices.delete(index);
		this.maxSpan = Math.max(this.maxSpan, end - this.starts[index]);
	}
	setStyle(index, style) {
		assertStyleIndex(style);
		this.styles[index] = style;
	}
	/**
	* The index range `[begin, end)` of intervals that can overlap `[from, to]`. Open intervals before `begin` are in
	* `openIndices`. Some intervals inside the range can still end before `from`, so a caller checks each end.
	*/
	visibleRange(from, to) {
		return {
			begin: lowerBound(this.starts, this.count, from - this.maxSpan),
			end: upperBound(this.starts, this.count, to)
		};
	}
	ensureCapacity(capacity) {
		if (capacity <= this.starts.length) return;
		const next = Math.max(capacity, this.starts.length * GROWTH);
		this.starts = grow(this.starts, next);
		this.ends = grow(this.ends, next);
		this.styles = grow(this.styles, next);
	}
	shiftOpenIndices(from) {
		const shifted = [...this.openIndices].map((index) => index >= from ? index + 1 : index);
		this.openIndices.clear();
		for (const index of shifted) this.openIndices.add(index);
	}
};
/** Points in columns of typed arrays, sorted by time. Same append rules as {@link IntervalColumn}. */
var PointColumn = class {
	times = new Float64Array(INITIAL_CAPACITY);
	styles = new Uint16Array(INITIAL_CAPACITY);
	keys = [];
	count = 0;
	append(time, style, key) {
		assertStyleIndex(style);
		if (this.count + 1 > this.times.length) {
			const next = this.times.length * GROWTH;
			this.times = grow(this.times, next);
			this.styles = grow(this.styles, next);
		}
		let index = this.count;
		if (index > 0 && this.times[index - 1] > time) {
			index = upperBound(this.times, this.count, time);
			this.times.copyWithin(index + 1, index, this.count);
			this.styles.copyWithin(index + 1, index, this.count);
			this.keys.splice(index, 0, key);
		} else this.keys.push(key);
		this.times[index] = time;
		this.styles[index] = style;
		this.count++;
		return index;
	}
	visibleRange(from, to) {
		return {
			begin: lowerBound(this.times, this.count, from),
			end: upperBound(this.times, this.count, to)
		};
	}
};
//#endregion
//#region src/capsule.ts
/** Colors of the capsule states that do not come from the item. */
const CAPSULE_COLORS = {
	/** The failure dot and failure text. */
	failed: "#ef4444",
	/** A failed capsule keeps its own color under this tint and this outline. */
	failedOverlay: "rgba(239,68,68,0.12)",
	failedStroke: "rgba(239,68,68,0.35)",
	overdue: "#f59e0b",
	abandoned: "#a3a3a3"
};
/**
* The style of a capsule in a state.
*
* @example
* capsuleStyle({ color: '#3b82f6', activity: 'thinking', failed: true })
* // => { color: '#3b82f6', pattern: 'soft', overlay: 'rgba(239,68,68,0.12)', stroke: 'rgba(239,68,68,0.35)', status: 'failed' }
*/
function capsuleStyle(state) {
	const activity = state.activity ?? "active";
	const pattern = activity === "thinking" ? "soft" : activity === "waiting" ? "hatch" : "solid";
	const style = {
		color: state.color,
		pattern
	};
	if (state.glyph) style.glyph = state.glyph;
	if (state.failed) {
		style.overlay = CAPSULE_COLORS.failedOverlay;
		style.status = "failed";
	}
	const stroke = state.failed ? CAPSULE_COLORS.failedStroke : state.overdue ? CAPSULE_COLORS.overdue : state.abandoned ? CAPSULE_COLORS.abandoned : void 0;
	if (stroke) style.stroke = stroke;
	if (state.open && !state.abandoned && pattern !== "solid") style.shimmer = true;
	const opacity = state.dimmed ? .25 : state.cancelled ? .55 : void 0;
	if (opacity !== void 0) style.opacity = opacity;
	if (state.retry) style.icon = "retry";
	return style;
}
/**
* The layers of an entity lane, in draw order. Active work covers thinking and waiting, and failures cover everything,
* so a failure always shows.
*/
const LANE_LAYERS = [
	"waiting",
	"thinking",
	"active",
	"failed"
];
/** The layer of a capsule on an entity lane. */
function laneLayerOf(state) {
	return state.failed ? "failed" : state.activity ?? "active";
}
/**
* The style of a capsule on an entity lane. A failure keeps the color of its work under the red tint, and its layer
* draws last, so it shows over other work. A lane draws no icons and no glyphs: the rows of its tracks show the same
* items with them. It keeps the status dot.
*/
function laneCapsuleStyle(state) {
	const { icon: _icon, glyph: _glyph, ...style } = capsuleStyle(state);
	return style;
}
/**
* A table that stores each distinct style once, so columns store small style indices. It holds at most
* {@link MAX_STYLE_INDEX} + 1 styles, and a new style past that throws a `RangeError`.
*
* @example
* const table = new StyleTable()
* table.index({ color: 'red' }) === table.index({ color: 'red' })
* // => true
*/
var StyleTable = class {
	styles = [];
	indices = /* @__PURE__ */ new Map();
	index(style) {
		const key = `${style.color}|${style.pattern}|${style.stroke}|${style.text}|${style.shimmer}|${style.opacity}|${style.icon}|${style.glyph}|${style.status}|${style.overlay}`;
		let index = this.indices.get(key);
		if (index === void 0) {
			index = this.styles.length;
			if (index > 65535) throw new RangeError(`A style table holds at most 65536 styles, the most that a column can index`);
			this.styles.push(style);
			this.indices.set(key, index);
		}
		return index;
	}
};
//#endregion
//#region src/series.ts
/** Samples that one bucket of the next level covers. */
const FACTOR = 4;
/**
* A sample series with a min/max pyramid, for waveforms and level curves.
*
* Level 0 holds the samples. Each next level holds the minimum and maximum of {@link FACTOR} buckets of the level
* below. An envelope reads the coarsest level that still has at least two buckets per pixel, so its work follows the
* view width, not the series length.
*
* Samples must arrive in time order. Irregular intervals are fine. Each bucket keeps the times of its first and last
* samples, and an envelope reads the buckets of the level below for a bucket that spans a pause.
*/
var SeriesPyramid = class {
	levels = [createLevel(256, false)];
	get count() {
		return this.levels[0].count;
	}
	get start() {
		return this.count > 0 ? this.levels[0].times[0] : NaN;
	}
	get end() {
		return this.count > 0 ? this.levels[0].times[this.count - 1] : NaN;
	}
	/** The average time between samples, or `NaN` with fewer than two samples. A gap between samples is longer. */
	get intervalMs() {
		return this.count > 1 ? (this.end - this.start) / (this.count - 1) : NaN;
	}
	append(time, value) {
		this.push(0, time, time, value, value);
	}
	/** Appends many samples. `times` and `values` have the same length. */
	appendMany(times, values) {
		for (let index = 0; index < times.length; index++) this.push(0, times[index], times[index], values[index], values[index]);
	}
	/**
	* The widest gap in pixels that still joins two samples in the view: one and a half sample intervals, so a series
	* draws as one shape at any zoom, and a real pause in the samples still breaks it.
	*/
	bridgePx(view) {
		const interval = this.intervalMs;
		return Number.isFinite(interval) ? interval * pixelsPerMs(view) * 1.5 : 0;
	}
	/** The envelope of the view, one column for each `columnPx` pixels. */
	envelope(view, columnPx = 1) {
		const columns = Math.max(1, Math.ceil(view.width / columnPx));
		const mins = new Float32Array(columns).fill(NaN);
		const maxs = new Float32Array(columns).fill(NaN);
		const ppm = pixelsPerMs(view) / columnPx;
		const raw = this.levels[0];
		const visibleSamples = Math.max(1, upperBound(raw.times, raw.count, view.end) - lowerBound(raw.times, raw.count, view.start));
		let level = 0;
		while (level + 1 < this.levels.length && visibleSamples / FACTOR ** (level + 1) >= columns * 2) level++;
		const columnOf = (time) => Math.floor((time - view.start) * ppm);
		const add = (levelIndex, index) => {
			const data = this.levels[levelIndex];
			const first = columnOf(data.times[index]);
			const last = data.ends ? columnOf(data.ends[index]) : first;
			if (last < 0 || first >= columns) return;
			if (last - first > 1 || first < 0) {
				const child = index * FACTOR;
				for (let offset = 0; offset < FACTOR; offset++) add(levelIndex - 1, child + offset);
				return;
			}
			const min = data.mins[index];
			const max = data.maxs[index];
			if (Number.isNaN(mins[first]) || min < mins[first]) mins[first] = min;
			if (Number.isNaN(maxs[first]) || max > maxs[first]) maxs[first] = max;
		};
		const data = this.levels[level];
		const end = Math.min(data.count, upperBound(data.times, data.count, view.end) + 1);
		for (let index = Math.max(0, lowerBound(data.times, data.count, view.start) - 1); index < end; index++) add(level, index);
		for (let index = data.count * FACTOR ** level; index < raw.count; index++) add(0, index);
		return {
			mins,
			maxs,
			level
		};
	}
	push(levelIndex, time, endTime, min, max) {
		let level = this.levels[levelIndex];
		if (!level) {
			level = createLevel(64, true);
			this.levels.push(level);
		}
		if (level.count === level.times.length) {
			const capacity = level.times.length * 2;
			level.times = grow(level.times, capacity);
			level.mins = grow(level.mins, capacity);
			level.maxs = grow(level.maxs, capacity);
			if (level.ends) level.ends = grow(level.ends, capacity);
		}
		level.times[level.count] = time;
		if (level.ends) level.ends[level.count] = endTime;
		level.mins[level.count] = min;
		level.maxs[level.count] = max;
		level.count++;
		if (level.count % FACTOR === 0) {
			const first = level.count - FACTOR;
			let groupMin = Number.POSITIVE_INFINITY;
			let groupMax = Number.NEGATIVE_INFINITY;
			for (let index = first; index < level.count; index++) {
				groupMin = Math.min(groupMin, level.mins[index]);
				groupMax = Math.max(groupMax, level.maxs[index]);
			}
			const lastTime = level.ends?.[level.count - 1] ?? level.times[level.count - 1];
			this.push(levelIndex + 1, level.times[first], lastTime, groupMin, groupMax);
		}
	}
};
function createLevel(capacity, withEnds) {
	return {
		times: new Float64Array(capacity),
		ends: withEnds ? new Float64Array(capacity) : void 0,
		mins: new Float32Array(capacity),
		maxs: new Float32Array(capacity),
		count: 0
	};
}
/**
* The bar values of a waveform: the envelope with short gaps filled by linear interpolation, then blended a little with
* the neighbor columns. A column in a long gap stays `undefined`, so a real pause still shows.
*/
function waveformColumns(envelope, options) {
	const count = envelope.mins.length;
	const values = Array.from({ length: count });
	let previous = -1;
	for (let column = 0; column < count; column++) {
		if (Number.isNaN(envelope.maxs[column])) continue;
		values[column] = {
			min: envelope.mins[column],
			max: envelope.maxs[column]
		};
		if (previous >= 0 && column - previous > 1 && column - previous <= options.bridgeColumns) for (let fill = previous + 1; fill < column; fill++) {
			const ratio = (fill - previous) / (column - previous);
			values[fill] = {
				min: envelope.mins[previous] + (envelope.mins[column] - envelope.mins[previous]) * ratio,
				max: envelope.maxs[previous] + (envelope.maxs[column] - envelope.maxs[previous]) * ratio
			};
		}
		previous = column;
	}
	const smoothing = Math.min(1, Math.max(0, options.smoothing ?? .3));
	if (smoothing === 0) return values;
	return values.map((value, column) => {
		if (!value) return void 0;
		const left = values[column - 1] ?? value;
		const right = values[column + 1] ?? value;
		return {
			min: value.min * (1 - smoothing) + (left.min + right.min) * smoothing / 2,
			max: value.max * (1 - smoothing) + (left.max + right.max) * smoothing / 2
		};
	});
}
//#endregion
//#region src/value.ts
/**
* The y offset of a value in a row, in CSS pixels from the top of the canvas. A value outside the range maps outside
* the row, so a caller that must stay in the row clamps the value first.
*
* @example
* valueToY([-1, 1], { top: 10, height: 100 }, 0)
* // => 60
*/
function valueToY(range, geometry, value) {
	const [low, high] = range;
	return geometry.top + geometry.height - (value - low) / (high - low || 1) * geometry.height;
}
/**
* The value at a y offset in a row, the inverse of {@link valueToY}. It does not clamp.
*
* @example
* yToValue([-1, 1], { top: 10, height: 100 }, 60)
* // => 0
*/
function yToValue(range, geometry, y) {
	const [low, high] = range;
	return low + (geometry.top + geometry.height - y) / (geometry.height || 1) * (high - low);
}
//#endregion
//#region src/draw.ts
/**
* Width in CSS pixels over which new waveform bars grow to their height. A reveal edge this far right of the newest
* sample shows every bar whole.
*/
const WAVEFORM_REVEAL_PX = 18;
/** How far a bar has grown, from 0 to 1, by its distance left of the reveal edge, with an ease out. */
function revealGrowth(distancePx) {
	if (distancePx < 0) return 0;
	return 1 - (1 - Math.min(1, distancePx / 18)) ** 3;
}
/** The narrowest gap that a series always bridges, so a comb of single samples does not show. */
const MIN_BRIDGE_PX = 12;
/** Size of an item icon in CSS pixels. */
const ICON_PX = 14;
/** The font of the trailing text of an item. */
const TRAILING_FONT = "500 10px system-ui, sans-serif";
/** The label font of every item. Semibold, so it reads on a colored shape. */
const LABEL_FONT = "600 11px system-ui, sans-serif";
/** Height of the top band that holds a label at `labelPosition: 'top'`, with room above the text. Content under it starts this far down. */
const LABEL_BAND_PX = 21;
const LABEL_PADDING_PX = 5;
/**
* The pitch of waveform bars: a 1.5 px bar and a 1.5 px gap. The bar is about half the stroke of the label font. Read
* the envelope with this `columnPx` for a waveform.
*/
const WAVEFORM_BAR_PITCH_PX = 3;
const SHIMMER_PERIOD_MS = 1400;
const SHIMMER_BAND_PX = 64;
const SHIMMER_ALPHA = .45;
const rgbCache = /* @__PURE__ */ new Map();
/**
* A CSS color with an alpha. The canvas normalizes the color, so any CSS color works.
* Both ends of a gradient get the same color with alpha 0, because a transparent black end darkens the band.
*/
function withAlpha(ctx, color, alpha) {
	let rgb = rgbCache.get(color);
	if (rgb === void 0) {
		const previous = ctx.fillStyle;
		ctx.fillStyle = color;
		const normalized = String(ctx.fillStyle);
		ctx.fillStyle = previous;
		const hex = /^#([0-9a-f]{6})$/i.exec(normalized)?.[1];
		rgb = hex ? [
			0,
			2,
			4
		].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16)).join(",") : /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(normalized)?.slice(1, 4).join(",") ?? "255,255,255";
		rgbCache.set(color, rgb);
	}
	return `rgba(${rgb},${alpha})`;
}
const hatchPatterns = /* @__PURE__ */ new Map();
function hatchPattern(ctx, color) {
	const cached = hatchPatterns.get(color);
	if (cached !== void 0) return cached;
	if (typeof OffscreenCanvas === "undefined") return null;
	const tile = new OffscreenCanvas(8, 8);
	const tileContext = tile.getContext("2d");
	if (!tileContext) return null;
	tileContext.strokeStyle = color;
	tileContext.globalAlpha = .55;
	tileContext.lineWidth = 2;
	tileContext.beginPath();
	tileContext.moveTo(-2, 10);
	tileContext.lineTo(10, -2);
	tileContext.moveTo(6, 10);
	tileContext.lineTo(10, 6);
	tileContext.moveTo(-2, 2);
	tileContext.lineTo(2, -2);
	tileContext.stroke();
	const pattern = ctx.createPattern(tile, "repeat");
	hatchPatterns.set(color, pattern);
	return pattern;
}
function capsulePath(ctx, x, y, width, height, radius) {
	const r = Math.max(0, Math.min(radius, width / 2, height / 2));
	ctx.beginPath();
	ctx.roundRect(x, y, width, height, r);
}
/** The corner radius that an item of this size draws with, for an `IntervalDrawOptions.radius` of `radius`. */
function itemRadius(width, height, radius = 5) {
	return Math.max(0, Math.min(width < 6 ? 1.5 : radius, width / 2, height / 2));
}
/**
* Strokes a ring around an item, for example for hover, focus, or selection. The ring follows the corners of the item:
* its radius is the item radius plus its distance from the item.
*/
function strokeItemRing(ctx, item, options) {
	const width = options.width ?? 2;
	const distance = (options.offset ?? 1) + width / 2;
	ctx.save();
	ctx.strokeStyle = options.color;
	ctx.globalAlpha = options.alpha ?? 1;
	ctx.lineWidth = width;
	ctx.setLineDash(options.dash ?? []);
	ctx.beginPath();
	ctx.roundRect(item.x0 - distance, item.top - distance, item.x1 - item.x0 + distance * 2, item.height + distance * 2, item.radius + distance);
	ctx.stroke();
	ctx.restore();
}
/** Draws the runs of one interval row. Runs draw in order, so a later run covers an earlier one. */
function drawIntervalRuns(ctx, runs, styles, options) {
	const radius = options.radius ?? 5;
	const font = options.font ?? "600 11px system-ui, sans-serif";
	const { top, height } = options;
	ctx.save();
	ctx.font = font;
	ctx.textBaseline = "middle";
	for (const run of runs) {
		const style = styles[run.style];
		if (!style) continue;
		const width = run.x1 - run.x0;
		const pattern = style.pattern ?? "solid";
		ctx.globalAlpha = (style.opacity ?? 1) * (run.count > 1 ? .85 : 1);
		capsulePath(ctx, run.x0, top, width, height, itemRadius(width, height, radius));
		if (pattern === "solid") {
			ctx.fillStyle = style.color;
			ctx.fill();
		} else if (pattern === "soft") {
			ctx.fillStyle = style.color;
			ctx.globalAlpha *= .32;
			ctx.fill();
			ctx.globalAlpha /= .32;
		} else {
			ctx.fillStyle = style.color;
			ctx.globalAlpha *= .22;
			ctx.fill();
			ctx.globalAlpha /= .22;
			const hatch = hatchPattern(ctx, style.color);
			if (hatch) {
				ctx.fillStyle = hatch;
				ctx.fill();
			}
		}
		if (style.overlay) {
			ctx.fillStyle = style.overlay;
			ctx.fill();
		}
		if (run.open && style.shimmer && options.time !== void 0 && width > 8) {
			const phase = options.time % SHIMMER_PERIOD_MS / SHIMMER_PERIOD_MS;
			const bandX = run.x0 - SHIMMER_BAND_PX + phase * (width + 128);
			const gradient = ctx.createLinearGradient(bandX, 0, bandX + SHIMMER_BAND_PX, 0);
			gradient.addColorStop(0, withAlpha(ctx, style.color, 0));
			gradient.addColorStop(.5, withAlpha(ctx, style.color, SHIMMER_ALPHA));
			gradient.addColorStop(1, withAlpha(ctx, style.color, 0));
			ctx.save();
			ctx.clip();
			ctx.fillStyle = gradient;
			ctx.fillRect(run.x0, top, width, height);
			ctx.restore();
		}
		if (style.stroke) {
			ctx.strokeStyle = style.stroke;
			ctx.lineWidth = 1;
			capsulePath(ctx, run.x0 + .5, top + .5, width - 1, height - 1, width < 6 ? 1 : radius - .5);
			ctx.stroke();
		}
		if (style.status === "failed" && run.count === 1 && width >= 8 && height >= 8) drawStatusDot(ctx, run.x0, top);
	}
	ctx.restore();
	if (options.decorate ?? true) drawRunLabels(ctx, runs, styles, options);
}
/** A red dot with a white ring in the top left corner of an item, inside its rounded corner. */
function drawStatusDot(ctx, x0, top) {
	ctx.save();
	ctx.globalAlpha = 1;
	ctx.beginPath();
	ctx.arc(x0 + 5, top + 5, 3.5, 0, Math.PI * 2);
	ctx.fillStyle = "#ffffff";
	ctx.fill();
	ctx.beginPath();
	ctx.arc(x0 + 5, top + 5, 2.5, 0, Math.PI * 2);
	ctx.fillStyle = CAPSULE_COLORS.failed;
	ctx.fill();
	ctx.restore();
}
/**
* The retry glyph: the `refresh-2-line` icon of MingCute (Apache-2.0 license), the icon set of the tracer UI, in a
* 24 px box.
*/
const RETRY_GLYPH = { paths: [{
	d: "M3.811 8.264A9 9 0 0 1 14.33 3.307a9 9 0 0 1 6.672 8.622c0 .08-.088.126-.154.082l-2.678-1.804c-.091-.062-.03-.205.078-.181L20 10.41m.189 5.327c-1.789 3.932-6.208 6.112-10.519 4.956a9 9 0 0 1-6.672-8.622c0-.08.088-.126.154-.082l2.678 1.805c.091.061.03.204-.078.18L4 13.59",
	fill: false,
	stroke: true,
	width: 2.25,
	cap: "round",
	join: "round"
}] };
/** Compiled paths of each glyph. A glyph compiles one time. */
const compiledGlyphs = /* @__PURE__ */ new WeakMap();
/** Draws a glyph centered at `x`, `y`, at {@link ICON_PX}, so it stays sharp at any pixel ratio. */
function drawGlyph(ctx, glyph, x, y, color) {
	let paths = compiledGlyphs.get(glyph);
	if (!paths) {
		paths = glyph.paths.map((path) => new Path2D(path.d));
		compiledGlyphs.set(glyph, paths);
	}
	ctx.save();
	ctx.translate(x - ICON_PX / 2, y - ICON_PX / 2);
	ctx.scale(ICON_PX / 24, ICON_PX / 24);
	ctx.fillStyle = color;
	ctx.strokeStyle = color;
	for (const [index, path] of glyph.paths.entries()) {
		if (path.fill) ctx.fill(paths[index]);
		if (path.stroke) {
			ctx.lineWidth = path.width ?? 2;
			ctx.lineCap = path.cap ?? "butt";
			ctx.lineJoin = path.join ?? "miter";
			ctx.stroke(paths[index]);
		}
	}
	ctx.restore();
}
/**
* Draws what an item shows at its start and its end: the glyph or the icon, the label, and the trailing text. The
* glyph comes first, then the label, then the trailing text at the right end. A part that does not fit is left out,
* the trailing text first.
*/
function drawRunLabels(ctx, runs, styles, options) {
	const { top, height } = options;
	const y = options.labelPosition === "top" ? top + 21 / 2 + 1.5 : top + height / 2 + .5;
	ctx.save();
	ctx.textBaseline = "middle";
	for (const run of runs) {
		const style = styles[run.style];
		if (!style || run.count !== 1) continue;
		const left = Math.max(run.x0, options.labelLeft ?? 0);
		const right = run.x1 - LABEL_PADDING_PX;
		if (right - left < 19) continue;
		const solid = (style.pattern ?? "solid") === "solid";
		const ink = style.text ?? (solid ? "#ffffff" : options.text ?? "#404040");
		ctx.globalAlpha = style.opacity ?? 1;
		let cursor = left + LABEL_PADDING_PX;
		const glyph = style.icon === "retry" ? RETRY_GLYPH : style.glyph ? options.glyphs?.(style.glyph) : void 0;
		if (glyph) {
			drawGlyph(ctx, glyph, cursor + ICON_PX / 2, y - .5, solid || style.icon === "retry" ? ink : style.text ?? style.color);
			cursor += 18;
		}
		ctx.font = options.font ?? "600 11px system-ui, sans-serif";
		const label = options.label?.(run.index);
		const labelWidth = label ? ctx.measureText(label).width : 0;
		ctx.font = TRAILING_FONT;
		const trailing = options.trailing?.(run.index);
		const trailingWidth = trailing ? ctx.measureText(trailing).width : 0;
		const showTrailing = trailing !== void 0 && cursor + (label ? labelWidth + 8 : 0) + trailingWidth <= right;
		const shadow = solid && style.text === void 0;
		ctx.shadowColor = shadow ? "rgba(0,0,0,0.3)" : "transparent";
		ctx.shadowBlur = shadow ? 2 : 0;
		if (label) {
			ctx.font = options.font ?? "600 11px system-ui, sans-serif";
			const fitted = fitText(ctx, label, right - cursor - (showTrailing ? trailingWidth + 8 : 0));
			if (fitted) {
				ctx.fillStyle = ink;
				ctx.fillText(fitted, cursor, y);
			}
		}
		if (showTrailing) {
			ctx.font = TRAILING_FONT;
			ctx.fillStyle = ink;
			ctx.globalAlpha = (style.opacity ?? 1) * (solid ? .85 : .7);
			ctx.textAlign = "right";
			ctx.fillText(trailing, right, y);
			ctx.textAlign = "left";
		}
	}
	ctx.restore();
}
/** The longest prefix of `text` with an ellipsis that fits `width`, or undefined when not even one character fits. */
function fitText(ctx, text, width) {
	if (ctx.measureText(text).width <= width) return text;
	let low = 0;
	let high = text.length;
	while (low < high) {
		const middle = low + high + 1 >>> 1;
		if (ctx.measureText(`${text.slice(0, middle)}…`).width <= width) low = middle;
		else high = middle - 1;
	}
	return low > 0 ? `${text.slice(0, low)}…` : void 0;
}
/** Draws the marks of one point row: a dot for each point, or a histogram bar for each bucket. */
function drawPointMarks(ctx, marks, styles, options) {
	const { top, height } = options;
	const middle = top + height / 2;
	const maxCount = options.maxCount ?? marks.reduce((max, mark) => mark.kind === "bucket" ? Math.max(max, mark.count) : max, 1);
	ctx.save();
	for (const mark of marks) {
		const style = styles[mark.style];
		if (!style) continue;
		ctx.globalAlpha = style.opacity ?? 1;
		ctx.fillStyle = style.color;
		if (mark.kind === "point") {
			ctx.beginPath();
			ctx.arc(mark.x, middle, Math.min(3, height / 2 - 1), 0, Math.PI * 2);
			ctx.fill();
			if (style.stroke) {
				ctx.strokeStyle = style.stroke;
				ctx.lineWidth = 1;
				ctx.stroke();
			}
		} else {
			const barHeight = Math.max(2, (height - 2) * Math.log2(1 + mark.count) / Math.log2(1 + maxCount));
			ctx.fillRect(mark.x0, top + height - barHeight, Math.max(1, mark.x1 - mark.x0 - 1), barHeight);
		}
	}
	ctx.restore();
}
/** Draws an envelope of a series inside one row. Columns without samples leave gaps. */
function drawEnvelope(ctx, envelope, options) {
	const columnPx = options.columnPx ?? 1;
	const [low, high] = options.range ?? (options.mode === "waveform" && !options.symmetric ? [-1, 1] : [0, 1]);
	const { top, height } = options;
	const y = (value) => valueToY([low, high], options, Math.min(high, Math.max(low, value)));
	ctx.save();
	ctx.fillStyle = options.color;
	ctx.strokeStyle = options.color;
	const bridgeColumns = Math.max(1, Math.ceil(Math.max(MIN_BRIDGE_PX, options.bridgePx ?? 0) / columnPx));
	if (options.mode === "waveform") {
		ctx.globalAlpha = options.opacity ?? .85;
		const middle = top + height / 2;
		const barWidth = Math.min(options.barWidthPx ?? columnPx / 2, columnPx);
		const gap = columnPx - barWidth;
		const values = waveformColumns(envelope, {
			bridgeColumns,
			smoothing: options.smoothing
		});
		const opacity = options.opacity ?? .85;
		const floor = options.intensityFloor ?? .25;
		const intensity = options.intensity ? waveformColumns(options.intensity, {
			bridgeColumns,
			smoothing: 0
		}) : void 0;
		for (let column = 0; column < values.length; column++) {
			const value = values[column];
			if (value === void 0) continue;
			if (intensity) {
				const level = Math.min(1, Math.max(0, intensity[column]?.max ?? 0));
				ctx.globalAlpha = opacity * (floor + (1 - floor) * level);
			}
			const growth = options.revealX === void 0 ? 1 : revealGrowth(options.revealX - (column + 1) * columnPx);
			if (growth <= 0) break;
			const x = column * columnPx + gap / 2;
			if (options.symmetric) {
				const half = Math.max(.75, Math.min(high, Math.max(0, value.max)) / (high || 1) * height / 2 * growth);
				ctx.beginPath();
				ctx.roundRect(x, middle - half, barWidth, half * 2, barWidth / 2);
				ctx.fill();
				continue;
			}
			const y0 = y(value.max);
			const y1 = y(value.min);
			ctx.fillRect(x, y0, barWidth, Math.max(1, y1 - y0));
		}
	} else {
		ctx.lineWidth = options.lineWidth ?? 1.5;
		ctx.lineJoin = "round";
		ctx.beginPath();
		let lastColumn = Number.NEGATIVE_INFINITY;
		for (let column = 0; column < envelope.maxs.length; column++) {
			const max = envelope.maxs[column];
			if (Number.isNaN(max)) continue;
			const x = column * columnPx + columnPx / 2;
			if (column - lastColumn <= bridgeColumns) ctx.lineTo(x, y(max));
			else ctx.moveTo(x, y(max));
			lastColumn = column;
		}
		ctx.stroke();
	}
	if (options.threshold !== void 0) {
		ctx.globalAlpha = .6;
		ctx.setLineDash([3, 3]);
		ctx.lineWidth = 1;
		ctx.beginPath();
		const thresholdY = Math.round(y(options.threshold)) + .5;
		ctx.moveTo(0, thresholdY);
		ctx.lineTo(envelope.mins.length * columnPx, thresholdY);
		ctx.stroke();
	}
	ctx.restore();
}
/**
* Draws a line through sparse points of a series, for example the keyframes of a curve. `times` must be sorted.
*
* The line includes the nearest point outside each side of the view, so a segment that crosses the view edge still
* draws when no point is inside the view. Use {@link drawEnvelope} for a dense series, where many samples share a pixel.
*/
function drawLine(ctx, times, values, options) {
	const count = Math.min(times.length, values.length);
	if (count === 0) return;
	const range = options.range ?? [0, 1];
	const [low, high] = range;
	const first = Math.max(0, lowerBound(times, count, options.view.start) - 1);
	const last = Math.min(count - 1, upperBound(times, count, options.view.end));
	const x = (index) => timeToX(options.view, times[index]);
	const y = (index) => valueToY(range, options, Math.min(high, Math.max(low, values[index])));
	ctx.save();
	ctx.globalAlpha = options.opacity ?? 1;
	ctx.strokeStyle = options.color;
	ctx.lineWidth = options.lineWidth ?? 1.5;
	ctx.lineJoin = "round";
	ctx.lineCap = "round";
	ctx.beginPath();
	ctx.moveTo(x(first), y(first));
	for (let index = first + 1; index <= last; index++) {
		if (options.curve === "step") ctx.lineTo(x(index), y(index - 1));
		ctx.lineTo(x(index), y(index));
	}
	ctx.stroke();
	ctx.restore();
}
//#endregion
//#region src/hit.ts
/**
* The interval under an x offset, or undefined.
*
* An interval that covers the time wins, and of several the one that starts last, because it draws on top. Otherwise
* the nearest interval within `tolerancePx` wins, so a very short interval can still be hit.
*/
function hitInterval(column, view, x, options = {}) {
	const tolerance = (options.tolerancePx ?? 3) / pixelsPerMs(view);
	const time = xToTime(view, x);
	const openEnd = options.now ?? view.end;
	let covering;
	let nearest;
	let nearestDistance = Number.POSITIVE_INFINITY;
	const check = (index) => {
		const start = column.starts[index];
		const rawEnd = column.ends[index];
		const end = Number.isNaN(rawEnd) ? Math.max(start, openEnd) : rawEnd;
		if (start <= time && time <= end) {
			if (covering === void 0 || start >= column.starts[covering]) covering = index;
			return;
		}
		const distance = time < start ? start - time : time - end;
		if (distance <= tolerance && distance < nearestDistance) {
			nearest = index;
			nearestDistance = distance;
		}
	};
	const { begin, end } = column.visibleRange(time - tolerance, time + tolerance);
	for (const index of column.openIndices) if (index < begin) check(index);
	for (let index = begin; index < end; index++) check(index);
	return covering ?? nearest;
}
/** The point nearest to an x offset within `tolerancePx`, or undefined. */
function hitPoint(column, view, x, options = {}) {
	const tolerance = (options.tolerancePx ?? 4) / pixelsPerMs(view);
	const time = xToTime(view, x);
	const { begin, end } = column.visibleRange(time - tolerance, time + tolerance);
	let nearest;
	let nearestDistance = Number.POSITIVE_INFINITY;
	for (let index = begin; index < end; index++) {
		const distance = Math.abs(column.times[index] - time);
		if (distance < nearestDistance) {
			nearest = index;
			nearestDistance = distance;
		}
	}
	return nearest;
}
//#endregion
//#region src/row.ts
/** Geometry of the rows of a timeline, in CSS pixels. */
const ROW_GEOMETRY = {
	/**
	* Row heights. A row with a waveform is taller, so the waveform has room to read. A hidden track keeps one row of the
	* detail height, so a single-row track does not move the rows under it when it hides or shows.
	*/
	height: {
		lane: 54,
		detail: 34,
		content: 62,
		hidden: 34
	},
	/** Height of an item on an entity lane, centered in the row. */
	laneItemHeight: 30,
	/** Space between the edge of a detail row and its items. */
	detailInset: 4,
	/** Space between the edge of an item and a series inside it. */
	contentInset: 4,
	/** Corner radius of the items of each row kind, and of the state bands behind them. */
	radius: {
		lane: 6,
		detail: 4,
		state: 3
	}
};
/** Where the items of a row draw, and their corner radius. */
function rowItemGeometry(kind, top, height) {
	return kind === "lane" ? {
		top: top + (height - ROW_GEOMETRY.laneItemHeight) / 2,
		height: ROW_GEOMETRY.laneItemHeight,
		radius: ROW_GEOMETRY.radius.lane
	} : {
		top: top + ROW_GEOMETRY.detailInset,
		height: height - ROW_GEOMETRY.detailInset * 2,
		radius: ROW_GEOMETRY.radius.detail
	};
}
/** Where the state bands of a row draw: the whole row, less 1 px at the top and the bottom. */
function stateBandGeometry(top, height) {
	return {
		top: top + 1,
		height: height - 2,
		radius: ROW_GEOMETRY.radius.state
	};
}
/**
* Draws one row of a timeline: the state bands, the items of each layer, the series inside the items, the labels, and
* the instants. Returns the drawn runs of the state bands and of each layer, so the caller can mark the drawn items.
*/
function drawTimelineRow(ctx, row, frame) {
	const { view, now } = frame;
	const geometry = rowItemGeometry(frame.kind, frame.top, frame.height);
	const shared = {
		time: frame.time,
		text: frame.text,
		glyphs: frame.glyphs
	};
	const states = row.states && row.states.count > 0 ? intervalRuns(row.states, view, { now }) : [];
	if (states.length > 0) drawIntervalRuns(ctx, states, row.styles, {
		...shared,
		...stateBandGeometry(frame.top, frame.height)
	});
	const runsByLayer = row.layers.map((layer) => {
		if (layer.column.count === 0) return [];
		const runs = intervalRuns(layer.column, view, { now });
		drawIntervalRuns(ctx, runs, row.styles, {
			...shared,
			...geometry,
			label: layer.label,
			trailing: layer.trailing,
			labelLeft: frame.labelLeft,
			decorate: !row.content
		});
		return runs;
	});
	if (row.content) {
		const runs = runsByLayer.flat();
		const decorated = frame.glyphs !== void 0 || row.layers.some((layer) => layer.label !== void 0 || layer.trailing !== void 0) || runs.some((run) => row.styles[run.style]?.icon !== void 0 || row.styles[run.style]?.status !== void 0);
		const band = decorated ? {
			top: geometry.top + 21,
			height: geometry.height - 21 - ROW_GEOMETRY.contentInset
		} : {
			top: geometry.top + ROW_GEOMETRY.contentInset,
			height: geometry.height - ROW_GEOMETRY.contentInset * 2
		};
		drawCapsuleContent(ctx, row.content, runs, row.styles, {
			view,
			clip: geometry,
			band
		});
		if (decorated) for (const [index, layer] of row.layers.entries()) drawRunLabels(ctx, runsByLayer[index], row.styles, {
			...shared,
			...geometry,
			label: layer.label,
			trailing: layer.trailing,
			labelLeft: frame.labelLeft,
			labelPosition: "top"
		});
	}
	if (row.points && row.points.count > 0) drawPointMarks(ctx, pointMarks(row.points, view), row.styles, geometry);
	return {
		states,
		layers: runsByLayer
	};
}
/**
* Draws a series inside the shapes of `runs`. Runs of each style draw on their own, so each item gets a series color that
* contrasts with it. A row without items draws the series across the whole row, so a track with only a series still
* shows it.
*/
function drawCapsuleContent(ctx, content, runs, styles, area) {
	if (runs.length === 0) {
		drawSeries(ctx, content, void 0, area);
		return;
	}
	const byStyle = Map.groupBy(runs, (run) => run.style);
	for (const [style, group] of byStyle) {
		ctx.save();
		ctx.beginPath();
		for (const run of group) ctx.rect(run.x0, area.clip.top, run.x1 - run.x0, area.clip.height);
		ctx.clip();
		drawSeries(ctx, content, styles[style], area);
		ctx.restore();
	}
}
function drawSeries(ctx, content, style, area) {
	const { view, band } = area;
	const solid = style !== void 0 && (style.pattern ?? "solid") === "solid";
	const color = solid ? style?.text ?? "#ffffff" : style?.text ?? style?.color ?? "#737373";
	if (content.kind === "waveform") {
		drawEnvelope(ctx, content.level.envelope(view, 3), {
			...band,
			color,
			columnPx: 3,
			mode: "waveform",
			symmetric: true,
			opacity: solid ? .85 : .6,
			bridgePx: content.level.bridgePx(view),
			intensity: content.intensity?.envelope(view, 3),
			revealX: content.revealX
		});
		if (content.curve) {
			ctx.save();
			if (content.revealX !== void 0) {
				ctx.beginPath();
				ctx.rect(0, band.top, Math.max(0, content.revealX), band.height);
				ctx.clip();
			}
			drawLineSeries(ctx, content.curve, {
				view,
				band,
				color,
				range: [0, 1],
				threshold: content.curveThreshold
			});
			ctx.restore();
		}
		return;
	}
	drawLineSeries(ctx, content.series, {
		view,
		band,
		color,
		range: content.range,
		threshold: content.threshold
	});
}
function drawLineSeries(ctx, series, options) {
	drawEnvelope(ctx, series.envelope(options.view, 2), {
		...options.band,
		color: options.color,
		columnPx: 2,
		mode: "line",
		range: options.range,
		threshold: options.threshold,
		bridgePx: series.bridgePx(options.view)
	});
}
//#endregion
export { CAPSULE_COLORS, IntervalColumn, LABEL_BAND_PX, LABEL_FONT, LANE_LAYERS, MAX_STYLE_INDEX, PointColumn, ROW_GEOMETRY, SeriesPyramid, StyleTable, WAVEFORM_BAR_PITCH_PX, WAVEFORM_REVEAL_PX, capsuleStyle, drawEnvelope, drawIntervalRuns, drawLine, drawPointMarks, drawRunLabels, drawTimelineRow, fitText, hitInterval, hitPoint, intervalRuns, itemRadius, laneCapsuleStyle, laneLayerOf, lowerBound, pixelsPerMs, pointMarks, rowItemGeometry, stateBandGeometry, strokeItemRing, timeToX, upperBound, valueToY, waveformColumns, xToTime, yToValue };
