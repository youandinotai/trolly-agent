import { argsOf, headOf, isFunction, isNumber, isSymbol, isText, nothing, text, textOf } from "@proj-airi/mathjson";
import katex from "katex";
//#region src/heads.ts
/**
* The MathJSON head of each relation, keyed by the canonical TeX spelling of {@link canonicalSymbol}.
* The renderer maps the head back to the words of the relation.
*/
const relationHeads = {
	"=": "Equal",
	"\\neq": "NotEqual",
	"<": "Less",
	">": "Greater",
	"\\ll": "MuchLess",
	"\\gg": "MuchGreater",
	"\\leq": "LessEqual",
	"\\geq": "GreaterEqual",
	"\\approx": "Approx",
	"\\equiv": "Equivalent",
	"\\perp": "Perpendicular",
	"\\parallel": "Parallel",
	"\\in": "Element",
	"\\notin": "NotElement",
	"\\ni": "Contains",
	"\\subseteq": "SubsetEqual",
	"\\subset": "Subset",
	"\\supseteq": "SupersetEqual",
	"\\supset": "Superset",
	"\\nsubseteq": "NotSubsetEqual",
	"\\nsupseteq": "NotSupersetEqual",
	"\\sim": "Similar",
	"\\cong": "Congruent",
	"\\to": "To",
	"\\mapsto": "MapsTo",
	"\\Rightarrow": "Implies",
	"\\Leftrightarrow": "Iff",
	"\\propto": "Proportional",
	"\\gtrsim": "GreaterApprox",
	"\\lesssim": "LessApprox",
	"\\mid": "Divides",
	"\\nmid": "NotDivides",
	"\\vdash": "Proves",
	"\\coloneqq": "Assign"
};
/** The MathJSON head of each binary operator, keyed by its canonical TeX spelling. */
const operatorHeads = {
	"+": "Add",
	"-": "Subtract",
	"\\times": "Multiply",
	"\\cdot": "Multiply",
	"\\div": "InlineDivide",
	"\\pm": "PlusMinus",
	"\\mp": "MinusPlus",
	"\\cup": "Union",
	"\\cap": "Intersection",
	"\\setminus": "SetMinus",
	"\\sqcup": "DisjointUnion",
	"\\triangle": "SymmetricDifference",
	"\\circ": "Compose"
};
/** Operators that bind tighter than the others, so `a + b \times c` is `a + (b c)`. */
/**
* The head of a raw command that no extension lowered yet: `["Raw", 'command', 'source']`, see ./extension.
* {@link MathSpeech} replaces it with the MathJSON of the extension that owns the command.
*/
const rawHead = "Raw";
//#endregion
//#region src/locale.ts
const alphanumeric = /[a-z0-9]/i;
/** Joins words without a space, except between two Latin letters or digits, so `AB` and `CD` stay apart. */
function joinCompact(parts) {
	let result = "";
	for (const part of parts.map((part) => part.trim()).filter(Boolean)) {
		const last = result.at(-1) ?? "";
		if (result && alphanumeric.test(last) && alphanumeric.test(part[0])) result += " ";
		result += part;
	}
	return result;
}
function joinSpaced(parts) {
	return parts.map((part) => part.trim()).filter(Boolean).join(" ");
}
const greekNames = [
	"alpha",
	"beta",
	"gamma",
	"delta",
	"epsilon",
	"varepsilon",
	"zeta",
	"eta",
	"theta",
	"vartheta",
	"iota",
	"kappa",
	"lambda",
	"mu",
	"nu",
	"xi",
	"omicron",
	"pi",
	"rho",
	"sigma",
	"tau",
	"upsilon",
	"phi",
	"varphi",
	"chi",
	"psi",
	"omega"
];
const greekLetters$1 = "αβγδεεζηθϑικλμνξοπρστυφφχψω";
/** Maps each Greek command and its Unicode letter to one word. Capitals use the same word. */
function greek(words) {
	const result = {};
	greekNames.forEach((name, index) => {
		const word = words[index];
		result[`\\${name}`] = word;
		result[`\\${name[0].toUpperCase()}${name.slice(1)}`] = word;
		result[greekLetters$1[index]] = word;
	});
	return result;
}
/**
* The spellings of each relation and operator, keyed by one canonical spelling. Lexicons key their words by the
* canonical spelling, and lowering uses it as the identity of the symbol.
*/
const symbolAliases = {
	"=": ["="],
	"\\neq": [
		"\\neq",
		"\\ne",
		"≠"
	],
	"<": ["<", "\\lt"],
	">": [">", "\\gt"],
	"\\leq": [
		"\\leq",
		"\\le",
		"\\leqq",
		"\\leqslant",
		"≤",
		"⩽"
	],
	"\\geq": [
		"\\geq",
		"\\ge",
		"\\geqq",
		"\\geqslant",
		"≥",
		"⩾"
	],
	"\\approx": ["\\approx", "≈"],
	"\\equiv": ["\\equiv", "≡"],
	"\\perp": [
		"\\perp",
		"\\bot",
		"⊥"
	],
	"\\parallel": [
		"\\parallel",
		"\\|",
		"∥"
	],
	"\\ll": ["\\ll", "≪"],
	"\\gg": ["\\gg", "≫"],
	"\\in": ["\\in", "∈"],
	"\\notin": ["\\notin", "∉"],
	"\\ni": [
		"\\ni",
		"\\owns",
		"∋"
	],
	"\\subseteq": ["\\subseteq", "⊆"],
	"\\subset": [
		"\\subset",
		"\\subsetneq",
		"⊂",
		"⊊"
	],
	"\\supseteq": ["\\supseteq", "⊇"],
	"\\supset": [
		"\\supset",
		"\\supsetneq",
		"⊃",
		"⊋"
	],
	"\\nsubseteq": ["\\nsubseteq", "⊈"],
	"\\nsupseteq": ["\\nsupseteq", "⊉"],
	"\\sim": [
		"\\sim",
		"\\backsim",
		"∽",
		"∼",
		"~"
	],
	"\\cong": ["\\cong", "≅"],
	"\\to": [
		"\\to",
		"\\rightarrow",
		"→",
		"\\longrightarrow"
	],
	"\\mapsto": ["\\mapsto", "↦"],
	"\\Rightarrow": [
		"\\Rightarrow",
		"\\implies",
		"⇒"
	],
	"\\Leftrightarrow": [
		"\\Leftrightarrow",
		"\\iff",
		"⇔"
	],
	"\\propto": ["\\propto", "∝"],
	"\\gtrsim": ["\\gtrsim", "≳"],
	"\\lesssim": ["\\lesssim", "≲"],
	"\\nmid": ["\\nmid", "∤"],
	"\\vdash": ["\\vdash", "⊢"],
	"\\coloneqq": [
		"\\coloneqq",
		"≔",
		"\\coloneq",
		":="
	],
	"+": ["+"],
	"-": ["-", "−"],
	"\\times": [
		"\\times",
		"×",
		"*",
		"\\ast"
	],
	"\\cdot": [
		"\\cdot",
		"·",
		"⋅"
	],
	"\\div": [
		"\\div",
		"÷",
		"/"
	],
	"\\pm": ["\\pm", "±"],
	"\\mp": ["\\mp", "∓"],
	"\\cup": ["\\cup", "∪"],
	"\\cap": ["\\cap", "∩"],
	"\\setminus": [
		"\\setminus",
		"\\smallsetminus",
		"∖"
	],
	"\\sqcup": ["\\sqcup", "⊔"],
	"\\triangle": [
		"\\triangle",
		"△",
		"\\bigtriangleup"
	],
	"!": ["!"]
};
/** Each spelling with its canonical spelling, built once, because lowering looks up every symbol. */
const canonicalSpellings = new Map(Object.entries(symbolAliases).flatMap(([key, spellings]) => spellings.map((spelling) => [spelling, key])));
/** The canonical spelling of a symbol, for example `\\leq` for `≤`. Other symbols stay unchanged. */
function canonicalSymbol(value) {
	return canonicalSpellings.get(value) ?? value;
}
/** Maps every alias of a key, for example `\leq`, `\le`, `≤`, and `<=`, to one value. */
function aliases(entries) {
	const result = {};
	for (const [key, value] of Object.entries(entries)) for (const alias of symbolAliases[key] ?? [key]) result[alias] = value;
	return result;
}
/** Korean particles change with the last sound of the word before them. */
const finalConsonantLetters = new Set("lmnr".split(""));
const finalConsonantDigits = new Set("013678".split(""));
const hangulStart = 44032;
const hangulEnd = 55203;
function finalConsonant(word) {
	const last = word.trim().at(-1) ?? "";
	const code = last.codePointAt(0) ?? 0;
	if (code >= hangulStart && code <= hangulEnd) {
		const jong = (code - hangulStart) % 28;
		return jong === 0 ? "none" : jong === 8 ? "rieul" : "other";
	}
	if (/\d/.test(last)) {
		if (last === "1" || last === "7" || last === "8") return "rieul";
		return finalConsonantDigits.has(last) || /\d0$/.test(word.trim()) ? "other" : "none";
	}
	if (finalConsonantLetters.has(last.toLowerCase())) return last.toLowerCase() === "l" || last.toLowerCase() === "r" ? "rieul" : "other";
	return "none";
}
/** Appends the Korean particle that fits the word, for example 극한은 and 파이는. */
function josa(word, withConsonant, withVowel) {
	const sound = finalConsonant(word);
	if (withVowel === "로") return `${word}${sound === "other" ? withConsonant : withVowel}`;
	return `${word}${sound === "none" ? withVowel : withConsonant}`;
}
/** Names a Latin letter from a table. Other characters stay unchanged. */
function letterName(names, letter) {
	const index = letter.toUpperCase().charCodeAt(0) - 65;
	return letter.length === 1 && index >= 0 && index < 26 ? names[index] : letter;
}
/** Adds a power word to a denominator unit, for example 平方 before 秒. */
function unitPower(power, words) {
	return power === "2" ? words[2] : power === "3" ? words[3] : "";
}
//#endregion
//#region src/numbers.ts
/**
* Spells numbers as words, so a TTS voice cannot read a digit in another language.
*
* A voice of one language can read a bare digit in its own language. For example, a Chinese voice read the `1` of
* `1 over 2` as `yī`, which an English listener hears as "E". Words of the target language leave no such choice.
* Japanese uses kana, because a kanji numeral such as 五十 can still be read in Chinese.
*/
/** Integers with more digits than this are read digit by digit, as a code or an identifier is. */
const maxGroupedDigits = 12;
const enOnes = [
	"zero",
	"one",
	"two",
	"three",
	"four",
	"five",
	"six",
	"seven",
	"eight",
	"nine",
	"ten",
	"eleven",
	"twelve",
	"thirteen",
	"fourteen",
	"fifteen",
	"sixteen",
	"seventeen",
	"eighteen",
	"nineteen"
];
const enTens = [
	"",
	"",
	"twenty",
	"thirty",
	"forty",
	"fifty",
	"sixty",
	"seventy",
	"eighty",
	"ninety"
];
const enScales = [
	"",
	"thousand",
	"million",
	"billion"
];
function enBelowThousand(value) {
	const words = [];
	const hundreds = Math.floor(value / 100);
	const rest = value % 100;
	if (hundreds > 0) words.push(`${enOnes[hundreds]} hundred`);
	if (rest >= 20) words.push(rest % 10 === 0 ? enTens[Math.floor(rest / 10)] : `${enTens[Math.floor(rest / 10)]}-${enOnes[rest % 10]}`);
	else if (rest > 0) words.push(enOnes[rest]);
	return words.join(" ");
}
function enInteger(digits) {
	const value = Number(digits);
	if (value === 0) return "zero";
	const words = [];
	for (let scale = enScales.length - 1; scale >= 0; scale--) {
		const group = Math.floor(value / 1e3 ** scale) % 1e3;
		if (group > 0) words.push([enBelowThousand(group), enScales[scale]].filter(Boolean).join(" "));
	}
	return words.join(" ");
}
const jaDigits = [
	"ゼロ",
	"いち",
	"に",
	"さん",
	"よん",
	"ご",
	"ろく",
	"なな",
	"はち",
	"きゅう"
];
/** Rendaku and gemination of 百 and 千, for example さんびゃく and はっせん. */
const jaHundreds = [
	"",
	"ひゃく",
	"にひゃく",
	"さんびゃく",
	"よんひゃく",
	"ごひゃく",
	"ろっぴゃく",
	"ななひゃく",
	"はっぴゃく",
	"きゅうひゃく"
];
const jaThousands = [
	"",
	"せん",
	"にせん",
	"さんぜん",
	"よんせん",
	"ごせん",
	"ろくせん",
	"ななせん",
	"はっせん",
	"きゅうせん"
];
const jaScales = [
	"",
	"まん",
	"おく"
];
function jaBelowTenThousand(value) {
	const thousands = Math.floor(value / 1e3);
	const hundreds = Math.floor(value / 100) % 10;
	const tens = Math.floor(value / 10) % 10;
	const ones = value % 10;
	return [
		jaThousands[thousands],
		jaHundreds[hundreds],
		tens === 0 ? "" : tens === 1 ? "じゅう" : `${jaDigits[tens]}じゅう`,
		ones === 0 ? "" : jaDigits[ones]
	].join("");
}
function jaInteger(digits) {
	const value = Number(digits);
	if (value === 0) return jaDigits[0];
	let result = "";
	for (let scale = jaScales.length - 1; scale >= 0; scale--) {
		const group = Math.floor(value / 1e4 ** scale) % 1e4;
		if (group === 0) continue;
		const thousand = scale > 0 && Math.floor(group / 1e3) === 1 ? "いっ" : "";
		result += (scale > 0 && group === 1 ? "いち" : thousand + jaBelowTenThousand(group)) + jaScales[scale];
	}
	return result;
}
const koDigits = [
	"영",
	"일",
	"이",
	"삼",
	"사",
	"오",
	"육",
	"칠",
	"팔",
	"구"
];
const koScales = [
	"",
	"만",
	"억"
];
function koBelowTenThousand(value) {
	const prefix = [
		[Math.floor(value / 1e3), "천"],
		[Math.floor(value / 100) % 10, "백"],
		[Math.floor(value / 10) % 10, "십"]
	].map(([count, unit]) => count === 0 ? "" : `${count === 1 ? "" : koDigits[count]}${unit}`).join("");
	const ones = value % 10;
	return prefix + (ones === 0 ? "" : koDigits[ones]);
}
function koInteger(digits) {
	const value = Number(digits);
	if (value === 0) return koDigits[0];
	let result = "";
	for (let scale = koScales.length - 1; scale >= 0; scale--) {
		const group = Math.floor(value / 1e4 ** scale) % 1e4;
		if (group === 0) continue;
		result += (scale === 1 && group === 1 ? "" : koBelowTenThousand(group)) + koScales[scale];
	}
	return result;
}
const spellers = {
	en: {
		integer: enInteger,
		digit: enOnes.slice(0, 10),
		point: (i, f) => `${i} point ${f}`
	},
	ja: {
		integer: jaInteger,
		digit: jaDigits,
		point: (i, f) => `${i}てん${f}`
	},
	ko: {
		integer: koInteger,
		digit: koDigits,
		point: (i, f) => `${i} 점 ${f}`
	}
};
/**
* Spells a decimal number as words. Digits after the point are read one by one, as people read them.
* A number with grouping commas is read as its value. A very long integer is read digit by digit.
*
* @example
* spellNumber('1,200', 'en')
* // => 'one thousand two hundred'
* spellNumber('3.14', 'ja')
* // => 'さんてんいちよん'
* spellNumber('14', 'ko')
* // => '십사'
*/
function spellNumber(source, language) {
	const speller = spellers[language];
	const [integer = "", fraction] = source.replaceAll(",", "").split(".");
	const byDigit = (digits) => [...digits].map((digit) => speller.digit[Number(digit)]).join(language === "en" ? " " : "");
	const whole = integer.length > maxGroupedDigits || /^0\d/.test(integer) ? byDigit(integer) : speller.integer(integer || "0");
	return fraction === void 0 ? whole : speller.point(whole, byDigit(fraction));
}
//#endregion
//#region src/locales/en.ts
/** Ordinal words of a derivative order. Other orders add -th to the spelled number. */
const ordinals = {
	2: "second",
	3: "third"
};
/** Ordinal words of a root degree, after the number is spelled. */
const rootOrdinals = {
	four: "fourth",
	five: "fifth",
	six: "sixth",
	seven: "seventh",
	eight: "eighth",
	nine: "ninth",
	ten: "tenth"
};
const en = {
	language: "en",
	join: joinSpaced,
	number: (digits) => spellNumber(digits, "en"),
	letter: (letter) => letter,
	letterCase: (spoken, upper) => upper ? `capital ${spoken}` : spoken,
	clauses: (parts) => parts.join(", "),
	cases: (items) => items.map(({ value, condition }) => condition === void 0 ? `${value} otherwise` : `${value} if ${condition}`).join(", "),
	matrix: (rows, determinant) => `the ${determinant ? "determinant" : "matrix"} with ${rows.map((row, index) => `row ${spellNumber(String(index + 1), "en")}: ${row.join(", ")}`).join("; ")}`,
	list: (items) => items.join(", "),
	words: {
		...greek(greekNames.map((name) => name.replace(/^var/, ""))),
		"\\nabla": "nabla",
		"∇": "nabla",
		"\\varsigma": "final sigma",
		"M_\\odot": "solar masses",
		"L_\\odot": "solar luminosities",
		"R_\\odot": "solar radii",
		"\\checkmark": "check mark",
		"\\frown": "cap product",
		"\\ast": "star",
		"\\infty": "infinity",
		"∞": "infinity",
		"\\angle": "angle",
		"∠": "angle",
		"\\triangle": "triangle",
		"△": "triangle",
		"\\odot": "circle",
		"⊙": "circle",
		"\\circ": "degrees",
		"°": "degrees",
		"\\cdots": "and so on",
		"\\ldots": "and so on",
		"\\dots": "and so on",
		"…": "and so on",
		"\\emptyset": "the empty set",
		"\\varnothing": "the empty set",
		"∅": "the empty set",
		"\\forall": "for all",
		"\\exists": "there exists",
		"\\nexists": "there does not exist",
		"∄": "there does not exist",
		"\\aleph": "aleph",
		"ℵ": "aleph",
		"\\therefore": "therefore",
		"\\because": "because",
		"\\partial": "partial",
		"\\sin": "sine",
		"\\cos": "cosine",
		"\\tan": "tangent",
		"\\cot": "cotangent",
		"\\sec": "secant",
		"\\csc": "cosecant",
		"\\log": "log",
		"\\lg": "log",
		"\\ln": "natural log",
		"\\lim": "limit",
		"\\max": "max",
		"\\min": "min",
		"\\mid": "such that",
		"\\%": "percent",
		"%": "percent"
	},
	operators: aliases({
		"+": "plus",
		"-": "minus",
		"\\times": "times",
		"\\cdot": "times",
		"\\div": "divided by",
		"\\pm": "plus or minus",
		"\\mp": "minus or plus",
		"\\cup": "union",
		"\\cap": "intersection",
		"\\setminus": "minus",
		"\\sqcup": "disjoint union",
		"\\triangle": "symmetric difference",
		"\\circ": "composed with",
		"!": "factorial"
	}),
	negative: "negative",
	positive: "positive",
	relations: aliases({
		"=": (l, r) => `${l} equals ${r}`,
		"\\neq": (l, r) => `${l} is not equal to ${r}`,
		"<": (l, r) => `${l} is less than ${r}`,
		">": (l, r) => `${l} is greater than ${r}`,
		"\\ll": (l, r) => `${l} is much less than ${r}`,
		"\\gg": (l, r) => `${l} is much greater than ${r}`,
		"\\leq": (l, r) => `${l} is less than or equal to ${r}`,
		"\\geq": (l, r) => `${l} is greater than or equal to ${r}`,
		"\\approx": (l, r) => `${l} is approximately equal to ${r}`,
		"\\equiv": (l, r) => `${l} is equivalent to ${r}`,
		"\\perp": (l, r) => `${l} is perpendicular to ${r}`,
		"\\parallel": (l, r) => `${l} is parallel to ${r}`,
		"\\in": (l, r) => `${l} is an element of ${r}`,
		"\\notin": (l, r) => `${l} is not an element of ${r}`,
		"\\ni": (l, r) => `${l} contains ${r}`,
		"\\subseteq": (l, r) => `${l} is a subset of or equal to ${r}`,
		"\\subset": (l, r) => `${l} is a proper subset of ${r}`,
		"\\supseteq": (l, r) => `${l} is a superset of or equal to ${r}`,
		"\\supset": (l, r) => `${l} is a proper superset of ${r}`,
		"\\nsubseteq": (l, r) => `${l} is not a subset of ${r}`,
		"\\nsupseteq": (l, r) => `${l} is not a superset of ${r}`,
		"\\sim": (l, r) => `${l} is similar to ${r}`,
		"\\cong": (l, r) => `${l} is congruent to ${r}`,
		"\\to": (l, r) => `${l} approaches ${r}`,
		"\\mapsto": (l, r) => `${l} maps to ${r}`,
		"\\Rightarrow": (l, r) => `${l} implies ${r}`,
		"\\Leftrightarrow": (l, r) => `${l} if and only if ${r}`,
		"\\propto": (l, r) => `${l} is proportional to ${r}`,
		"\\gtrsim": (l, r) => `${l} is greater than or approximately ${r}`,
		"\\lesssim": (l, r) => `${l} is less than or approximately ${r}`,
		"\\mid": (l, r) => `${l} divides ${r}`,
		"\\nmid": (l, r) => `${l} does not divide ${r}`,
		"\\vdash": (l, r) => `${l} proves ${r}`,
		"\\coloneqq": (l, r) => `${l} is defined as ${r}`
	}),
	fraction: (n, d, shape) => shape.numerator === "compound" || shape.denominator === "compound" || shape.denominator === "scripted" ? `the fraction with numerator ${n} and denominator ${d}` : `${n} over ${d}`,
	derivative: (v, body, order) => `the ${order ? `${ordinals[order] ?? `${spellNumber(order, "en")}th`} ` : ""}derivative with respect to ${v} of ${body}`,
	power: (b, e) => `${b} to the power of ${e}`,
	squared: (b) => `${b} squared`,
	cubed: (b) => `${b} cubed`,
	degrees: (b) => `${b} degrees`,
	prime: (b) => `${b} prime`,
	superscript: (b, m) => `${b} ${m}`,
	marks: {
		"\\ast": "star",
		"\\dagger": "dagger",
		"\\vee": "dual"
	},
	apply: (f, args, grouped) => grouped && args.length === 1 ? `${f} of the quantity ${args[0]}` : `${f} of ${args.join(", ")}`,
	upTo: (x) => `up to ${x}`,
	placeholder: "dot",
	numberIndex: (b, i) => `${b} ${i}`,
	index: (b, i) => `${b} sub ${i}`,
	subscript: (b, s) => `${b} sub ${s}`,
	ordinal: (value) => `${value}-th`,
	given: (event, condition) => `${event} given ${condition}`,
	modulo: (m) => `modulo ${m}`,
	congruent: (l, r, m) => `${l} is congruent to ${r} modulo ${m}`,
	inverse: (name) => `${name} inverse`,
	root: (x, n) => {
		if (n === void 0) return `the square root of ${x}`;
		if (n === "three") return `the cube root of ${x}`;
		if (/^[a-z]$/i.test(n)) return `the ${n}th root of ${x}`;
		return rootOrdinals[n] ? `the ${rootOrdinals[n]} root of ${x}` : `the root of degree ${n} of ${x}`;
	},
	limit: (body, v, t, c, side) => {
		if (v !== void 0 && t !== void 0) return `the limit as ${v} approaches ${t}${side ? ` from the ${side}` : ""} of ${body}`;
		return c ? `the limit over ${c} of ${body}` : `the limit of ${body}`;
	},
	normDifference: (left, right) => `the difference between ${left} and ${right}`,
	norm: (x, index, squared) => `the ${squared ? "squared " : ""}${index ? `${index}-norm` : "norm"}${x ? ` of ${x}` : ""}`,
	statistic: (kind, body, condition) => {
		const noun = {
			Expectation: "the expected value",
			Probability: "the probability",
			Variance: "the variance",
			Covariance: "the covariance"
		}[kind];
		return condition ? `${noun}, over ${condition}, of ${body}` : `${noun} of ${body}`;
	},
	about: (x) => `about ${x}`,
	distributed: (x, d) => `${x} drawn from ${d}`,
	arrow: (l, r) => `${l} to ${r}`,
	ceil: (x) => `the ceiling of ${x}`,
	floor: (x) => `the floor of ${x}`,
	tuple: (items) => `${items.length === 2 ? "the pair" : "the tuple"} ${items.join(", ")}`,
	squareOf: (x) => `the square of ${x}`,
	absoluteSquared: (x) => `the squared absolute value of ${x}`,
	bracket: (x) => `open bracket ${x} close bracket`,
	mapping: (f, from, to) => `${f} is a function from ${from} to ${to}`,
	bigOperator: (kind, body, { variable, from, to, condition, improper }) => {
		const noun = {
			sum: "the sum",
			prod: "the product",
			int: improper ? "the improper integral" : "the integral",
			union: "the union",
			intersection: "the intersection"
		}[kind];
		if (kind === "int") return from !== void 0 || to !== void 0 ? `${noun} from ${from ?? ""} to ${to ?? ""} of ${body}` : `${noun} of ${body}`;
		if (variable !== void 0 && from !== void 0) return `${noun} from ${variable} equals ${from} to ${to ?? "infinity"} of ${body}`;
		return condition ? `${noun} over ${condition} of ${body}` : `${noun} of ${body}`;
	},
	absolute: (x) => `the absolute value of ${x}`,
	quantity: (x) => `the quantity ${x}`,
	set: (x, c) => c ? `the set of ${x} such that ${c}` : `the set ${x}`,
	interval: (a, b, { left, right }) => left === right ? `the ${left ? "closed" : "open"} interval from ${a} to ${b}` : `the interval from ${a} ${left ? "inclusive" : "exclusive"} to ${b} ${right ? "inclusive" : "exclusive"}`,
	complement: (set, universe) => universe ? `the complement of ${set} in ${universe}` : `the complement of ${set}`,
	powerSet: (set) => `the power set of ${set}`,
	cardinality: (set) => `the number of elements of ${set}`,
	percent: (n) => `${n} percent`,
	accent: {
		ket: (b) => `ket ${b}`,
		bra: (b) => `bra ${b}`,
		overline: (b) => `${b} bar`,
		bar: (b) => `${b} bar`,
		vec: (b) => `vector ${b}`,
		overrightarrow: (b) => `vector ${b}`,
		hat: (b) => `${b} hat`,
		widehat: (b) => `${b} hat`,
		tilde: (b) => `${b} tilde`,
		dot: (b) => `${b} dot`,
		overarc: (b) => `arc ${b}`,
		wideparen: (b) => `arc ${b}`
	},
	segment: (name) => `segment ${name}`,
	binomial: (n, k) => `${n} choose ${k}`,
	unitRatio: (n, d, power) => `${n} per ${d}${power === "2" ? " squared" : power === "3" ? " cubed" : ""}`,
	celsius: (value) => `${value} degrees Celsius`,
	numberSets: {
		"R": "the real numbers",
		"N": "the natural numbers",
		"Z": "the integers",
		"Q": "the rational numbers",
		"C": "the complex numbers",
		"N+": "the positive integers",
		"N*": "the positive integers",
		"Z+": "the positive integers",
		"Z-": "the negative integers",
		"Z*": "the nonzero integers",
		"R+": "the positive real numbers",
		"R-": "the negative real numbers",
		"R*": "the nonzero real numbers",
		"Q+": "the positive rational numbers"
	},
	units: {
		prefixes: {
			Q: "quetta",
			R: "ronna",
			Y: "yotta",
			Z: "zetta",
			E: "exa",
			P: "peta",
			T: "tera",
			G: "giga",
			M: "mega",
			k: "kilo",
			h: "hecto",
			da: "deca",
			d: "deci",
			c: "centi",
			m: "milli",
			µ: "micro",
			n: "nano",
			p: "pico",
			f: "femto",
			a: "atto",
			z: "zepto",
			y: "yocto",
			r: "ronto",
			q: "quecto"
		},
		units: {
			m: "meters",
			g: "grams",
			s: "seconds",
			A: "amperes",
			K: "kelvins",
			mol: "moles",
			cd: "candelas",
			Hz: "hertz",
			N: "newtons",
			Pa: "pascals",
			J: "joules",
			W: "watts",
			C: "coulombs",
			V: "volts",
			F: "farads",
			Ω: "ohms",
			S: "siemens",
			Wb: "webers",
			T: "teslas",
			H: "henries",
			lm: "lumens",
			lx: "lux",
			Bq: "becquerels",
			Gy: "grays",
			Sv: "sieverts",
			kat: "katals",
			L: "liters",
			l: "liters",
			t: "tonnes",
			eV: "electronvolts",
			Da: "daltons",
			bar: "bars",
			B: "bytes",
			bit: "bits",
			cal: "calories"
		},
		plain: {
			min: "minutes",
			h: "hours",
			d: "days",
			ha: "hectares",
			au: "astronomical units",
			Å: "angstroms",
			atm: "atmospheres",
			Rt: "right",
			dB: "decibels",
			ft: "feet",
			mi: "miles"
		},
		power: (words, power) => `${power === "2" ? "square" : "cubic"} ${words}`,
		singular: (words) => words === "feet" ? "foot" : words.endsWith("ies") ? `${words.slice(0, -3)}y` : /(?:hertz|siemens|lux)$/.test(words) || !words.endsWith("s") ? words : words.slice(0, -1)
	}
};
//#endregion
//#region src/locales/ja.ts
/** Latin letter names, A to Z. A Japanese listener names a Latin letter this way. */
const jaLetterNames = [
	"エー",
	"ビー",
	"シー",
	"ディー",
	"イー",
	"エフ",
	"ジー",
	"エイチ",
	"アイ",
	"ジェー",
	"ケー",
	"エル",
	"エム",
	"エヌ",
	"オー",
	"ピー",
	"キュー",
	"アール",
	"エス",
	"ティー",
	"ユー",
	"ブイ",
	"ダブリュー",
	"エックス",
	"ワイ",
	"ゼット"
];
const ja = {
	language: "ja",
	join: joinCompact,
	number: (digits) => spellNumber(digits, "ja"),
	letter: (letter) => letterName(jaLetterNames, letter),
	letterCase: (spoken, upper) => `${upper ? "大文字の" : "小文字の"}${spoken}`,
	clauses: (parts) => parts.join("、"),
	cases: (items) => items.map(({ value, condition }) => condition === void 0 ? `それ以外のとき${value}` : `${condition}のとき${value}`).join("、"),
	matrix: (rows, determinant) => `${determinant ? "行列式" : "行列"}、${rows.map((row, index) => `${spellNumber(String(index + 1), "ja")}行目 ${row.join("、")}`).join("、")}`,
	list: (items) => items.join("、"),
	words: {
		...greek([
			"アルファ",
			"ベータ",
			"ガンマ",
			"デルタ",
			"イプシロン",
			"イプシロン",
			"ゼータ",
			"イータ",
			"シータ",
			"シータ",
			"イオタ",
			"カッパ",
			"ラムダ",
			"ミュー",
			"ニュー",
			"クサイ",
			"オミクロン",
			"パイ",
			"ロー",
			"シグマ",
			"タウ",
			"ウプシロン",
			"ファイ",
			"ファイ",
			"カイ",
			"プサイ",
			"オメガ"
		]),
		"\\nabla": "ナブラ",
		"∇": "ナブラ",
		"\\varsigma": "シグマ",
		"M_\\odot": "太陽質量",
		"L_\\odot": "太陽光度",
		"R_\\odot": "太陽半径",
		"\\checkmark": "チェックマーク",
		"\\frown": "キャップ積",
		"\\ast": "アスタリスク",
		"\\infty": "無限大",
		"∞": "無限大",
		"\\angle": "角",
		"∠": "角",
		"\\triangle": "三角形",
		"△": "三角形",
		"\\odot": "円",
		"⊙": "円",
		"\\circ": "度",
		"°": "度",
		"\\cdots": "以下同様",
		"\\ldots": "以下同様",
		"\\dots": "以下同様",
		"…": "以下同様",
		"\\emptyset": "空集合",
		"\\varnothing": "空集合",
		"∅": "空集合",
		"\\forall": "任意の",
		"\\exists": "ある",
		"\\nexists": "存在しない",
		"∄": "存在しない",
		"\\aleph": "アレフ",
		"ℵ": "アレフ",
		"\\therefore": "ゆえに",
		"\\because": "なぜならば",
		"\\partial": "ラウンド",
		"\\sin": "サイン",
		"\\cos": "コサイン",
		"\\tan": "タンジェント",
		"\\cot": "コタンジェント",
		"\\sec": "セカント",
		"\\csc": "コセカント",
		"\\log": "ログ",
		"\\lg": "ログ",
		"\\ln": "エルエヌ",
		"\\lim": "極限",
		"\\max": "最大値",
		"\\min": "最小値",
		"\\mid": "ただし",
		"\\%": "パーセント",
		"%": "パーセント"
	},
	operators: aliases({
		"+": "プラス",
		"-": "マイナス",
		"\\times": "かける",
		"\\cdot": "かける",
		"\\div": "わる",
		"\\pm": "プラスマイナス",
		"\\mp": "マイナスプラス",
		"\\cup": "カップ",
		"\\cap": "キャップ",
		"\\setminus": "マイナス",
		"\\sqcup": "直和",
		"\\triangle": "対称差",
		"\\circ": "合成",
		"!": "の階乗"
	}),
	negative: "マイナス",
	positive: "プラス",
	relations: aliases({
		"=": (l, r) => `${l} イコール ${r}`,
		"\\neq": (l, r) => `${l} ノットイコール ${r}`,
		"<": (l, r) => `${l} 小なり ${r}`,
		">": (l, r) => `${l} 大なり ${r}`,
		"\\ll": (l, r) => `${l}は${r}よりずっと小さい`,
		"\\gg": (l, r) => `${l}は${r}よりずっと大きい`,
		"\\leq": (l, r) => `${l} 小なりイコール ${r}`,
		"\\geq": (l, r) => `${l} 大なりイコール ${r}`,
		"\\approx": (l, r) => `${l} ニアリーイコール ${r}`,
		"\\equiv": (l, r) => `${l}は${r}と恒等的に等しい`,
		"\\perp": (l, r) => `${l}と${r}は垂直`,
		"\\parallel": (l, r) => `${l}と${r}は平行`,
		"\\in": (l, r) => `${l}は${r}に属する`,
		"\\notin": (l, r) => `${l}は${r}に属さない`,
		"\\ni": (l, r) => `${l}は${r}を要素に持つ`,
		"\\subseteq": (l, r) => `${l}は${r}に含まれる`,
		"\\subset": (l, r) => `${l}は${r}に含まれる`,
		"\\supseteq": (l, r) => `${l}は${r}を含む`,
		"\\supset": (l, r) => `${l}は${r}を真に含む`,
		"\\nsubseteq": (l, r) => `${l}は${r}に含まれない`,
		"\\nsupseteq": (l, r) => `${l}は${r}を含まない`,
		"\\sim": (l, r) => `${l}と${r}は相似`,
		"\\cong": (l, r) => `${l}と${r}は合同`,
		"\\to": (l, r) => `${l}を${r}に近づける`,
		"\\mapsto": (l, r) => `${l}を${r}に写す`,
		"\\Rightarrow": (l, r) => `${l} ならば ${r}`,
		"\\Leftrightarrow": (l, r) => `${l} と ${r} は同値`,
		"\\propto": (l, r) => `${l}は${r}に比例する`,
		"\\gtrsim": (l, r) => `${l} 大なりニアリーイコール ${r}`,
		"\\lesssim": (l, r) => `${l} 小なりニアリーイコール ${r}`,
		"\\mid": (l, r) => `${l}は${r}を割り切る`,
		"\\nmid": (l, r) => `${l}は${r}を割り切らない`,
		"\\vdash": (l, r) => `${l}から${r}が導かれる`,
		"\\coloneqq": (l, r) => `${l}を${r}と定義する`
	}),
	fraction: (n, d, shape) => shape.numerator === "compound" || shape.denominator === "compound" || shape.numerator === "scripted" || shape.followsOperator ? `分子が${n}、分母が${d}の分数` : `${d}分の${n}`,
	derivative: (v, body, order) => `${body}を${v}で${order ? `${spellNumber(order, "ja")}回` : ""}微分したもの`,
	power: (b, e) => `${b}の${e}乗`,
	squared: (b) => `${b}の二乗`,
	cubed: (b) => `${b}の三乗`,
	degrees: (b) => `${b}度`,
	prime: (b) => `${b}プライム`,
	superscript: (b, m) => `${b}上付き${m}`,
	marks: {
		"\\ast": "スター",
		"\\dagger": "ダガー",
		"\\vee": "双対"
	},
	apply: (f, args, grouped, decorated) => grouped || decorated ? `${f}かっこ${args.join("、")}かっことじ` : joinCompact([f, ...args]),
	upTo: (x) => `${x}まで`,
	range: (from, to) => `${from}から${to}まで`,
	chain: (operands, relations) => {
		if (operands.includes(void 0) && relations.every((relation) => relation === relations[0])) return `${operands[0]}から${operands.at(-1)}まで、${relations[0]("前の値", "次の値")}`;
		return relations.reduce((left, relation, index) => relation(left, operands[index + 1] ?? ""), operands[0] ?? "");
	},
	placeholder: "ドット",
	numberIndex: (b, i) => `${b}${i}`,
	index: (b, i) => `${b}下付き${i}`,
	subscript: (b, s) => `${b}下付き${s}`,
	ordinal: (value) => `${value}番目`,
	given: (event, condition) => `${condition}のもとでの${event}`,
	modulo: (m) => `${m}を法として`,
	congruent: (l, r, m) => `${l}と${r}は${m}を法として合同`,
	inverse: (name) => `${name}の逆関数`,
	root: (x, n, compound) => n === void 0 ? compound ? `ルートかっこ${x}かっことじ` : `ルート${x}` : `${x}の${n}乗根`,
	limit: (body, v, t, c, side) => {
		if (v !== void 0 && t !== void 0) return `${v}を${side ? `${side === "right" ? "右" : "左"}から` : ""}${t}に近づけたときの${body}の極限`;
		return c ? `${c}のときの${body}の極限` : `${body}の極限`;
	},
	norm: (x, index, squared) => `${x ? `${x}の` : ""}${index ? `${index}` : ""}ノルム${squared ? "の二乗" : ""}`,
	statistic: (kind, body, condition) => {
		const noun = {
			Expectation: "期待値",
			Probability: "確率",
			Variance: "分散",
			Covariance: "共分散"
		}[kind];
		return condition ? `${condition}としたときの${body}の${noun}` : `${body}の${noun}`;
	},
	about: (x) => `約${x}`,
	distributed: (x, d) => `${x}が${d}に従う`,
	arrow: (l, r) => `${l}から${r}へ`,
	ceil: (x) => `${x}の切り上げ`,
	floor: (x) => `${x}の切り捨て`,
	tuple: (items) => `${items.join("、")}の組`,
	bracket: (x) => `大かっこ${x}大かっことじ`,
	mapping: (f, from, to) => `${f}は${from}から${to}への写像`,
	bigOperator: (kind, body, { variable, from, to, condition, improper }) => {
		const noun = {
			sum: "和",
			prod: "積",
			int: improper ? "広義積分" : "積分",
			union: "和集合",
			intersection: "共通部分"
		}[kind];
		if (kind === "int") return from !== void 0 || to !== void 0 ? `${from ?? ""}から${to ?? ""}までの${body}の${noun}` : `${body}の${noun}`;
		if (variable !== void 0 && from !== void 0) return `${variable}が${from}から${to ?? "無限大"}までの${body}の${noun}`;
		return condition ? `${condition}についての${body}の${noun}` : `${body}の${noun}`;
	},
	absolute: (x) => `${x}の絶対値`,
	quantity: (x) => `かっこ${x}かっことじ`,
	set: (x, c) => c ? `${c} を満たす${x}の集合` : `集合${x}`,
	interval: (a, b, { left, right }) => {
		if (left === right) return `${a}から${b}までの${left ? "閉" : "開"}区間`;
		return left ? `${a}以上${b}未満の区間` : `${a}より大きく${b}以下の区間`;
	},
	complement: (set, universe) => universe ? `${universe}における${set}の補集合` : `${set}の補集合`,
	powerSet: (set) => `${set}の冪集合`,
	cardinality: (set) => `${set}の要素の個数`,
	percent: (n) => `${n}パーセント`,
	accent: {
		ket: (b) => `ケット${b}`,
		bra: (b) => `ブラ${b}`,
		overline: (b) => `${b}バー`,
		bar: (b) => `${b}バー`,
		vec: (b) => `ベクトル${b}`,
		overrightarrow: (b) => `ベクトル${b}`,
		hat: (b) => `${b}ハット`,
		widehat: (b) => `${b}ハット`,
		tilde: (b) => `${b}チルダ`,
		dot: (b) => `${b}ドット`,
		overarc: (b) => `弧${b}`,
		wideparen: (b) => `弧${b}`
	},
	segment: (name) => `線分${name}`,
	binomial: (n, k) => `${n}個から${k}個選ぶ組み合わせ`,
	unitRatio: (n, d, power) => `${n}毎${unitPower(power, {
		2: "平方",
		3: "立方"
	})}${d}`,
	celsius: (value) => `摂氏${value}度`,
	numberSets: {
		"R": "実数全体の集合",
		"N": "自然数全体の集合",
		"Z": "整数全体の集合",
		"Q": "有理数全体の集合",
		"C": "複素数全体の集合",
		"N+": "正の整数全体の集合",
		"N*": "正の整数全体の集合",
		"Z+": "正の整数全体の集合",
		"Z-": "負の整数全体の集合",
		"Z*": "ゼロでない整数全体の集合",
		"R+": "正の実数全体の集合",
		"R-": "負の実数全体の集合",
		"R*": "ゼロでない実数全体の集合",
		"Q+": "正の有理数全体の集合"
	},
	units: {
		prefixes: {
			Q: "クエタ",
			R: "ロナ",
			Y: "ヨタ",
			Z: "ゼタ",
			E: "エクサ",
			P: "ペタ",
			T: "テラ",
			G: "ギガ",
			M: "メガ",
			k: "キロ",
			h: "ヘクト",
			da: "デカ",
			d: "デシ",
			c: "センチ",
			m: "ミリ",
			µ: "マイクロ",
			n: "ナノ",
			p: "ピコ",
			f: "フェムト",
			a: "アト",
			z: "ゼプト",
			y: "ヨクト",
			r: "ロント",
			q: "クエクト"
		},
		units: {
			m: "メートル",
			g: "グラム",
			s: "秒",
			A: "アンペア",
			K: "ケルビン",
			mol: "モル",
			cd: "カンデラ",
			Hz: "ヘルツ",
			N: "ニュートン",
			Pa: "パスカル",
			J: "ジュール",
			W: "ワット",
			C: "クーロン",
			V: "ボルト",
			F: "ファラド",
			Ω: "オーム",
			S: "ジーメンス",
			Wb: "ウェーバ",
			T: "テスラ",
			H: "ヘンリー",
			lm: "ルーメン",
			lx: "ルクス",
			Bq: "ベクレル",
			Gy: "グレイ",
			Sv: "シーベルト",
			kat: "カタール",
			L: "リットル",
			l: "リットル",
			t: "トン",
			eV: "電子ボルト",
			Da: "ダルトン",
			bar: "バール",
			B: "バイト",
			bit: "ビット",
			cal: "カロリー"
		},
		joinFactors: (words) => words.join(""),
		plain: {
			min: "分",
			h: "時間",
			d: "日",
			ha: "ヘクタール",
			au: "天文単位",
			Å: "オングストローム",
			atm: "気圧",
			Rt: "直角",
			dB: "デシベル",
			ft: "フィート",
			mi: "マイル"
		},
		denominators: { h: "時" },
		power: (words, power) => `${power === "2" ? "平方" : "立方"}${words}`
	}
};
//#endregion
//#region src/locales/ko.ts
/** Latin letter names, A to Z. A Korean listener names a Latin letter this way. */
const koLetterNames = [
	"에이",
	"비",
	"씨",
	"디",
	"이",
	"에프",
	"지",
	"에이치",
	"아이",
	"제이",
	"케이",
	"엘",
	"엠",
	"엔",
	"오",
	"피",
	"큐",
	"알",
	"에스",
	"티",
	"유",
	"브이",
	"더블유",
	"엑스",
	"와이",
	"제트"
];
/** Native Korean ordinals. 일행 for row one sounds like the number one, so a row is 첫째 행. */
const koreanOrdinals = [
	"첫째",
	"둘째",
	"셋째",
	"넷째",
	"다섯째",
	"여섯째",
	"일곱째",
	"여덟째",
	"아홉째",
	"열째"
];
const ko = {
	language: "ko",
	join: joinSpaced,
	number: (digits) => spellNumber(digits, "ko"),
	letter: (letter) => letter.toUpperCase() === "E" ? letter : letterName(koLetterNames, letter),
	letterCase: (spoken, upper) => `${upper ? "대문자" : "소문자"} ${spoken}`,
	clauses: (parts) => parts.join(", "),
	cases: (items) => items.map(({ value, condition }) => condition === void 0 ? `그 외의 경우 ${value}` : `${value}, 단 ${condition}`).join("; "),
	matrix: (rows, determinant) => `${determinant ? "행렬식" : "행렬"}, ${rows.map((row, index) => `${koreanOrdinals[index] ?? `${spellNumber(String(index + 1), "ko")}번째`} 행 ${row.join(", ")}`).join(", ")}`,
	list: (items) => items.join(", "),
	words: {
		...greek([
			"알파",
			"베타",
			"감마",
			"델타",
			"엡실론",
			"엡실론",
			"제타",
			"에타",
			"세타",
			"세타",
			"요타",
			"카파",
			"람다",
			"뮤",
			"뉴",
			"크사이",
			"오미크론",
			"파이",
			"로",
			"시그마",
			"타우",
			"입실론",
			"피",
			"피",
			"카이",
			"프사이",
			"오메가"
		]),
		"\\nabla": "나블라",
		"∇": "나블라",
		"\\varsigma": "시그마",
		"M_\\odot": "태양 질량",
		"L_\\odot": "태양 광도",
		"R_\\odot": "태양 반지름",
		"\\checkmark": "체크 표시",
		"\\frown": "캡곱",
		"\\ast": "별표",
		"\\infty": "무한대",
		"∞": "무한대",
		"\\angle": "각",
		"∠": "각",
		"\\triangle": "삼각형",
		"△": "삼각형",
		"\\odot": "원",
		"⊙": "원",
		"\\circ": "도",
		"°": "도",
		"\\cdots": "계속해서",
		"\\ldots": "계속해서",
		"\\dots": "계속해서",
		"…": "계속해서",
		"\\emptyset": "공집합",
		"\\varnothing": "공집합",
		"∅": "공집합",
		"\\forall": "모든",
		"\\exists": "어떤",
		"\\nexists": "존재하지 않는",
		"∄": "존재하지 않는",
		"\\aleph": "알레프",
		"ℵ": "알레프",
		"\\therefore": "따라서",
		"\\because": "왜냐하면",
		"\\partial": "라운드",
		"\\sin": "사인",
		"\\cos": "코사인",
		"\\tan": "탄젠트",
		"\\cot": "코탄젠트",
		"\\sec": "시컨트",
		"\\csc": "코시컨트",
		"\\log": "로그",
		"\\lg": "로그",
		"\\ln": "자연로그",
		"\\lim": "극한",
		"\\max": "최댓값",
		"\\min": "최솟값",
		"\\mid": "단",
		"\\%": "퍼센트",
		"%": "퍼센트"
	},
	operators: aliases({
		"+": "더하기",
		"-": "빼기",
		"\\times": "곱하기",
		"\\cdot": "곱하기",
		"\\div": "나누기",
		"\\pm": "플러스 마이너스",
		"\\mp": "마이너스 플러스",
		"\\cup": "합집합",
		"\\cap": "교집합",
		"\\setminus": "차집합",
		"\\sqcup": "서로소 합집합",
		"\\triangle": "대칭차",
		"\\circ": "합성",
		"!": "팩토리얼"
	}),
	negative: "마이너스",
	positive: "양의",
	relations: aliases({
		"=": (l, r) => `${josa(l, "은", "는")} ${r}`,
		"\\neq": (l, r) => `${josa(l, "은", "는")} ${josa(r, "과", "와")} 같지 않음`,
		"<": (l, r) => `${josa(l, "은", "는")} ${r}보다 작음`,
		">": (l, r) => `${josa(l, "은", "는")} ${r}보다 큼`,
		"\\ll": (l, r) => `${josa(l, "은", "는")} ${r}보다 훨씬 작음`,
		"\\gg": (l, r) => `${josa(l, "은", "는")} ${r}보다 훨씬 큼`,
		"\\leq": (l, r) => `${josa(l, "은", "는")} ${r}보다 작거나 같음`,
		"\\geq": (l, r) => `${josa(l, "은", "는")} ${r}보다 크거나 같음`,
		"\\approx": (l, r) => `${josa(l, "은", "는")} 약 ${r}`,
		"\\equiv": (l, r) => `${josa(l, "은", "는")} ${josa(r, "과", "와")} 항등적으로 같음`,
		"\\perp": (l, r) => `${josa(l, "은", "는")} ${r}에 수직`,
		"\\parallel": (l, r) => `${josa(l, "은", "는")} ${josa(r, "과", "와")} 평행`,
		"\\in": (l, r) => `${josa(l, "은", "는")} ${r}의 원소`,
		"\\notin": (l, r) => `${josa(l, "은", "는")} ${r}의 원소가 아님`,
		"\\ni": (l, r) => `${josa(l, "은", "는")} ${josa(r, "을", "를")} 원소로 가짐`,
		"\\subseteq": (l, r) => `${josa(l, "은", "는")} ${r}의 부분집합`,
		"\\subset": (l, r) => `${josa(l, "은", "는")} ${r}의 부분집합`,
		"\\supseteq": (l, r) => `${josa(l, "은", "는")} ${josa(r, "을", "를")} 포함`,
		"\\supset": (l, r) => `${josa(l, "은", "는")} ${josa(r, "을", "를")} 진포함`,
		"\\nsubseteq": (l, r) => `${josa(l, "은", "는")} ${r}의 부분집합이 아님`,
		"\\nsupseteq": (l, r) => `${josa(l, "은", "는")} ${josa(r, "을", "를")} 포함하지 않음`,
		"\\sim": (l, r) => `${josa(l, "과", "와")} ${josa(r, "은", "는")} 닮음`,
		"\\cong": (l, r) => `${josa(l, "과", "와")} ${josa(r, "은", "는")} 합동`,
		"\\to": (l, r) => `${josa(l, "이", "가")} ${josa(r, "으로", "로")} 감`,
		"\\mapsto": (l, r) => `${josa(l, "을", "를")} ${josa(r, "으로", "로")} 대응`,
		"\\Rightarrow": (l, r) => `${l} 이면 ${r}`,
		"\\Leftrightarrow": (l, r) => `${josa(l, "은", "는")} ${josa(r, "과", "와")} 동치`,
		"\\propto": (l, r) => `${josa(l, "은", "는")} ${r}에 비례`,
		"\\gtrsim": (l, r) => `${josa(l, "은", "는")} ${r}보다 크거나 비슷함`,
		"\\lesssim": (l, r) => `${josa(l, "은", "는")} ${r}보다 작거나 비슷함`,
		"\\mid": (l, r) => `${josa(l, "은", "는")} ${r}의 약수`,
		"\\nmid": (l, r) => `${josa(l, "은", "는")} ${r}의 약수가 아님`,
		"\\vdash": (l, r) => `${l}에서 ${josa(r, "이", "가")} 유도됨`,
		"\\coloneqq": (l, r) => `${josa(l, "은", "는")} ${josa(r, "으로", "로")} 정의됨`
	}),
	fraction: (n, d, shape) => shape.numerator === "compound" || shape.denominator === "compound" || shape.numerator === "scripted" || shape.followsOperator ? `분자가 ${n}, 분모가 ${d}인 분수` : `${d} 분의 ${n}`,
	derivative: (v, body, order) => `${josa(body, "을", "를")} ${v}에 대해 ${order ? `${spellNumber(order, "ko")}계 ` : ""}미분한 것`,
	power: (b, e) => `${b}의 ${e} 제곱`,
	squared: (b) => `${b} 제곱`,
	cubed: (b) => `${b} 세제곱`,
	degrees: (b) => `${b}도`,
	prime: (b) => `${b} 프라임`,
	superscript: (b, m) => `${b} 위첨자 ${m}`,
	marks: {
		"\\ast": "스타",
		"\\dagger": "대거",
		"\\vee": "쌍대"
	},
	apply: (f, args, grouped, decorated) => grouped || decorated ? `${f} 괄호 ${args.join(", ")} 괄호 닫고` : joinSpaced([f, ...args]),
	upTo: (x) => `${x}까지`,
	range: (from, to) => `${from}부터 ${to}까지`,
	chain: (operands, relations) => {
		if (operands.includes(void 0) && relations.every((relation) => relation === relations[0])) return `${operands[0]}부터 ${operands.at(-1)}까지, ${relations[0]("앞의 값", "다음 값")}`;
		return relations.map((relation, index) => relation(operands[index] ?? "", operands[index + 1] ?? "")).join(", 그리고 ");
	},
	placeholder: "점",
	numberIndex: (b, i) => `${b} 아래첨자 ${i}`,
	index: (b, i) => `${b} 아래첨자 ${i}`,
	subscript: (b, s) => `${b} 아래첨자 ${s}`,
	ordinal: (value) => `${value}번째`,
	given: (event, condition) => `${josa(condition, "이", "가")} 주어졌을 때 ${event}`,
	modulo: (m) => `법 ${m}`,
	congruent: (l, r, m) => `${josa(l, "과", "와")} ${josa(r, "은", "는")} 법 ${m}에 대해 합동`,
	inverse: (name) => `${name}의 역함수`,
	root: (x, n, compound) => n === void 0 ? compound ? `루트 괄호 ${x} 괄호 닫고` : `루트 ${x}` : n === "삼" ? `${x}의 세제곱근` : `${x}의 ${n} 제곱근`,
	limit: (body, v, t, c, side) => {
		if (v !== void 0 && t !== void 0) return `${josa(v, "이", "가")} ${side ? `${side === "right" ? "오른쪽" : "왼쪽"}에서 ` : ""}${josa(t, "으로", "로")} 갈 때 ${body}의 극한`;
		return c ? `${c}일 때 ${body}의 극한` : `${body}의 극한`;
	},
	norm: (x, index, squared) => `${x ? `${x}의 ` : ""}${index ? `${index} ` : ""}노름${squared ? "의 제곱" : ""}`,
	statistic: (kind, body, condition) => {
		const noun = {
			Expectation: "기댓값",
			Probability: "확률",
			Variance: "분산",
			Covariance: "공분산"
		}[kind];
		return condition ? `${condition}에 대한 ${body}의 ${noun}` : `${body}의 ${noun}`;
	},
	about: (x) => `약 ${x}`,
	distributed: (x, d) => `${josa(x, "이", "가")} ${josa(d, "을", "를")} 따름`,
	arrow: (l, r) => `${l}에서 ${josa(r, "으로", "로")}`,
	ceil: (x) => `${x}의 올림`,
	floor: (x) => `${x}의 내림`,
	tuple: (items) => `순서쌍 ${items.join(", ")}`,
	bracket: (x) => `대괄호 ${x} 대괄호 닫고`,
	mapping: (f, from, to) => `${josa(f, "은", "는")} ${from}에서 ${josa(to, "으로", "로")}의 함수`,
	bigOperator: (kind, body, { variable, from, to, condition, improper }) => {
		const noun = {
			sum: "합",
			prod: "곱",
			int: improper ? "이상적분" : "적분",
			union: "합집합",
			intersection: "교집합"
		}[kind];
		if (kind === "int") return from !== void 0 || to !== void 0 ? `${from ?? ""}부터 ${to ?? ""}까지 ${body}의 ${noun}` : `${body}의 ${noun}`;
		if (variable !== void 0 && from !== void 0) return `${josa(variable, "이", "가")} ${from}부터 ${to ?? "무한대"}까지 ${body}의 ${noun}`;
		return condition ? `${condition}에 대한 ${body}의 ${noun}` : `${body}의 ${noun}`;
	},
	absolute: (x) => `${x}의 절댓값`,
	quantity: (x) => `괄호 ${x} 괄호 닫고`,
	set: (x, c) => c ? `${x}의 집합 단 ${c}` : `집합 ${x}`,
	interval: (a, b, { left, right }) => {
		if (left === right) return `${a}부터 ${b}까지의 ${left ? "닫힌구간" : "열린구간"}`;
		return left ? `${a} 이상 ${b} 미만인 구간` : `${a} 초과 ${b} 이하인 구간`;
	},
	complement: (set, universe) => universe ? `${universe}에 대한 ${set}의 여집합` : `${set}의 여집합`,
	powerSet: (set) => `${set}의 멱집합`,
	cardinality: (set) => `${set}의 원소의 개수`,
	percent: (n) => `${n} 퍼센트`,
	accent: {
		ket: (b) => `켓 ${b}`,
		bra: (b) => `브라 ${b}`,
		overline: (b) => `${b} 바`,
		bar: (b) => `${b} 바`,
		vec: (b) => `벡터 ${b}`,
		overrightarrow: (b) => `벡터 ${b}`,
		hat: (b) => `${b} 햇`,
		widehat: (b) => `${b} 햇`,
		tilde: (b) => `${b} 틸데`,
		dot: (b) => `${b} 닷`,
		overarc: (b) => `호 ${b}`,
		wideparen: (b) => `호 ${b}`
	},
	segment: (name) => `선분 ${name}`,
	binomial: (n, k) => `${n} 개 중 ${k} 개를 고르는 조합`,
	unitRatio: (n, d, power) => `${n} 매 ${unitPower(power, {
		2: "제곱",
		3: "세제곱"
	})}${d}`,
	celsius: (value) => `섭씨 ${value}도`,
	numberSets: {
		"R": "실수 전체의 집합",
		"N": "자연수 전체의 집합",
		"Z": "정수 전체의 집합",
		"Q": "유리수 전체의 집합",
		"C": "복소수 전체의 집합",
		"N+": "양의 정수 전체의 집합",
		"N*": "양의 정수 전체의 집합",
		"Z+": "양의 정수 전체의 집합",
		"Z-": "음의 정수 전체의 집합",
		"Z*": "영이 아닌 정수 전체의 집합",
		"R+": "양의 실수 전체의 집합",
		"R-": "음의 실수 전체의 집합",
		"R*": "영이 아닌 실수 전체의 집합",
		"Q+": "양의 유리수 전체의 집합"
	},
	units: {
		prefixes: {
			Q: "퀘타",
			R: "론나",
			Y: "요타",
			Z: "제타",
			E: "엑사",
			P: "페타",
			T: "테라",
			G: "기가",
			M: "메가",
			k: "킬로",
			h: "헥토",
			da: "데카",
			d: "데시",
			c: "센티",
			m: "밀리",
			µ: "마이크로",
			n: "나노",
			p: "피코",
			f: "펨토",
			a: "아토",
			z: "젭토",
			y: "욕토",
			r: "론토",
			q: "퀙토"
		},
		units: {
			m: "미터",
			g: "그램",
			s: "초",
			A: "암페어",
			K: "켈빈",
			mol: "몰",
			cd: "칸델라",
			Hz: "헤르츠",
			N: "뉴턴",
			Pa: "파스칼",
			J: "줄",
			W: "와트",
			C: "쿨롬",
			V: "볼트",
			F: "패럿",
			Ω: "옴",
			S: "지멘스",
			Wb: "웨버",
			T: "테슬라",
			H: "헨리",
			lm: "루멘",
			lx: "럭스",
			Bq: "베크렐",
			Gy: "그레이",
			Sv: "시버트",
			kat: "카탈",
			L: "리터",
			l: "리터",
			t: "톤",
			eV: "전자볼트",
			Da: "돌턴",
			bar: "바",
			B: "바이트",
			bit: "비트",
			cal: "칼로리"
		},
		plain: {
			min: "분",
			h: "시간",
			d: "일",
			ha: "헥타르",
			au: "천문단위",
			Å: "옹스트롬",
			atm: "기압",
			Rt: "직각",
			dB: "데시벨",
			ft: "피트",
			mi: "마일"
		},
		power: (words, power) => `${power === "2" ? "제곱" : "세제곱"}${words}`
	}
};
//#endregion
//#region src/locales/zh.ts
const chineseOrders = {
	2: "二",
	3: "三",
	4: "四"
};
const zh = {
	language: "zh",
	join: joinCompact,
	number: (digits) => digits,
	letter: (letter) => letter,
	letterCase: (spoken, upper) => /^[a-z]$/i.test(spoken) ? `${upper ? "大" : "小"}${spoken}` : `${upper ? "大写" : "小写"}${spoken}`,
	clauses: (parts) => parts.join("，"),
	cases: (items) => items.map(({ value, condition }) => condition === void 0 ? `其他情况下为${value}` : `当${condition}时为${value}`).join("，"),
	matrix: (rows, determinant) => `${determinant ? "行列式" : "矩阵"}，${rows.map((row, index) => `第${index + 1}行是${row.join("、")}`).join("，")}`,
	list: (items) => items.join("、"),
	words: {
		...greek([
			"阿尔法",
			"贝塔",
			"伽马",
			"德尔塔",
			"艾普西隆",
			"艾普西隆",
			"泽塔",
			"伊塔",
			"西塔",
			"西塔",
			"约塔",
			"卡帕",
			"兰姆达",
			"缪",
			"纽",
			"克西",
			"欧米克戎",
			"派",
			"柔",
			"西格玛",
			"陶",
			"宇普西隆",
			"斐",
			"斐",
			"希",
			"普西",
			"欧米伽"
		]),
		"\\nabla": "那勃勒",
		"∇": "那勃勒",
		"\\varsigma": "西格玛",
		"M_\\odot": "太阳质量",
		"L_\\odot": "太阳光度",
		"R_\\odot": "太阳半径",
		"\\checkmark": "对勾",
		"\\frown": "卡积",
		"\\ast": "星号",
		"\\infty": "无穷大",
		"∞": "无穷大",
		"\\angle": "角",
		"∠": "角",
		"\\triangle": "三角形",
		"△": "三角形",
		"\\odot": "圆",
		"⊙": "圆",
		"\\circ": "度",
		"°": "度",
		"\\cdots": "依此类推",
		"\\ldots": "依此类推",
		"\\dots": "依此类推",
		"…": "依此类推",
		"\\emptyset": "空集",
		"\\varnothing": "空集",
		"∅": "空集",
		"\\forall": "对任意",
		"\\exists": "存在",
		"\\nexists": "不存在",
		"∄": "不存在",
		"\\aleph": "阿列夫",
		"ℵ": "阿列夫",
		"\\therefore": "所以",
		"\\because": "因为",
		"\\partial": "偏",
		"\\sin": "sine",
		"\\cos": "cosine",
		"\\tan": "tangent",
		"\\cot": "cotangent",
		"\\sec": "secant",
		"\\csc": "cosecant",
		"\\log": "log",
		"\\lg": "lg",
		"\\ln": "ln",
		"\\lim": "极限",
		"\\max": "最大值",
		"\\min": "最小值",
		"\\mid": "满足",
		"\\%": "百分号",
		"%": "百分号"
	},
	operators: aliases({
		"+": "加",
		"-": "减",
		"\\times": "乘",
		"\\cdot": "乘",
		"\\div": "除以",
		"\\pm": "正负",
		"\\mp": "负正",
		"\\cup": "并",
		"\\cap": "交",
		"\\setminus": "减",
		"\\sqcup": "不交并",
		"\\triangle": "对称差",
		"\\circ": "复合",
		"!": "的阶乘"
	}),
	negative: "负",
	positive: "正",
	relations: aliases({
		"=": (l, r) => `${l} 等于 ${r}`,
		"\\neq": (l, r) => `${l} 不等于 ${r}`,
		"<": (l, r) => `${l} 小于 ${r}`,
		">": (l, r) => `${l} 大于 ${r}`,
		"\\ll": (l, r) => `${l} 远小于 ${r}`,
		"\\gg": (l, r) => `${l} 远大于 ${r}`,
		"\\leq": (l, r) => `${l} 小于等于 ${r}`,
		"\\geq": (l, r) => `${l} 大于等于 ${r}`,
		"\\approx": (l, r) => `${l} 约等于 ${r}`,
		"\\equiv": (l, r) => `${l} 恒等于 ${r}`,
		"\\perp": (l, r) => `${l} 垂直于 ${r}`,
		"\\parallel": (l, r) => `${l} 平行于 ${r}`,
		"\\in": (l, r) => `${l} 属于 ${r}`,
		"\\notin": (l, r) => `${l} 不属于 ${r}`,
		"\\ni": (l, r) => `${l} 包含元素 ${r}`,
		"\\subseteq": (l, r) => `${l} 包含于 ${r}`,
		"\\subset": (l, r) => `${l} 真包含于 ${r}`,
		"\\supseteq": (l, r) => `${l} 包含 ${r}`,
		"\\supset": (l, r) => `${l} 真包含 ${r}`,
		"\\nsubseteq": (l, r) => `${l} 不包含于 ${r}`,
		"\\nsupseteq": (l, r) => `${l} 不包含 ${r}`,
		"\\sim": (l, r) => `${l} 相似于 ${r}`,
		"\\cong": (l, r) => `${l} 全等于 ${r}`,
		"\\to": (l, r) => `${l} 趋于 ${r}`,
		"\\mapsto": (l, r) => `${l} 映射到 ${r}`,
		"\\Rightarrow": (l, r) => `${l} 推出 ${r}`,
		"\\Leftrightarrow": (l, r) => `${l} 等价于 ${r}`,
		"\\propto": (l, r) => `${l} 正比于 ${r}`,
		"\\gtrsim": (l, r) => `${l} 大于或约等于 ${r}`,
		"\\lesssim": (l, r) => `${l} 小于或约等于 ${r}`,
		"\\mid": (l, r) => `${l} 整除 ${r}`,
		"\\nmid": (l, r) => `${l} 不整除 ${r}`,
		"\\vdash": (l, r) => `由 ${l} 可推出 ${r}`,
		"\\coloneqq": (l, r) => `${l} 定义为 ${r}`
	}),
	fraction: (n, d, shape) => shape.numerator === "compound" || shape.denominator === "compound" || shape.numerator === "scripted" || shape.followsOperator ? `分子是${n} 分母是${d}的分数` : `${d}分之${n}`,
	derivative: (v, body, order) => `${body}对${v}求${order ? `${chineseOrders[order] ?? order}阶` : ""}导`,
	power: (b, e) => `${b}的${e}次方`,
	squared: (b) => `${b}的平方`,
	cubed: (b) => `${b}的立方`,
	degrees: (b) => `${b}度`,
	prime: (b) => `${b}撇`,
	superscript: (b, m) => `${b}上标${m}`,
	marks: {
		"\\ast": "星",
		"\\dagger": "共轭转置",
		"\\vee": "对偶"
	},
	apply: (f, args, grouped, decorated) => {
		if (args.length > 1 && !/^[A-Z]$/.test(f)) return `${f}关于${args.join("和")}`;
		return grouped || decorated ? `${f}括号${args.join("，")}括号` : joinCompact([f, ...args]);
	},
	upTo: (x) => `直到${x}`,
	placeholder: "点",
	groupTimes: "乘以",
	numberIndex: (b, i) => `${b}${i}`,
	index: (b, i) => `${b}下标${i}`,
	subscript: (b, s) => `${b}下标${s}`,
	ordinal: (value) => `第${value}`,
	given: (event, condition) => `${condition}条件下的${event}`,
	modulo: (m) => `模${m}`,
	congruent: (l, r, m) => `${l} 与 ${r} 模 ${m} 同余`,
	inverse: (name) => `${name}的反函数`,
	root: (x, n, compound) => n === void 0 ? `根号${compound ? "下" : ""}${x}` : n === "3" ? `${x}的立方根` : `${x}的${n}次方根`,
	limit: (body, v, t, c, side) => {
		if (v !== void 0 && t !== void 0) return side ? `当${v}从${side === "right" ? "右" : "左"}侧趋于${t}时 ${body}的极限` : `当${v}趋于${t}时 ${body}的极限`;
		return c ? `${c}时 ${body}的极限` : `${body}的极限`;
	},
	norm: (x, index, squared) => `${x ? `${x}的` : ""}${index ?? ""}范数${squared ? "的平方" : ""}`,
	statistic: (kind, body, condition) => {
		const noun = {
			Expectation: "期望",
			Probability: "概率",
			Variance: "方差",
			Covariance: "协方差"
		}[kind];
		return condition ? `在${condition}下 ${body}的${noun}` : `${body}的${noun}`;
	},
	about: (x) => `约${x}`,
	distributed: (x, d) => `${x}服从${d}`,
	arrow: (l, r) => `${l} 到 ${r}`,
	ceil: (x) => `${x}向上取整`,
	floor: (x) => `${x}向下取整`,
	tuple: (items) => `${items.length === 2 ? "有序对" : `${items.length}元组`}${items.join("、")}`,
	bracket: (x) => `方括号${x}方括号`,
	mapping: (f, from, to) => `${f} 是从${from}到${to}的映射`,
	bigOperator: (kind, body, { variable, from, to, condition, improper }) => {
		const verb = {
			sum: "求和",
			prod: "求积",
			int: "积分",
			union: "求并集",
			intersection: "求交集"
		}[kind];
		if (kind === "int" && improper) return `从${from ?? ""}到${to ?? ""}对${body}的反常积分`;
		if (kind === "int") return from !== void 0 || to !== void 0 ? `从${from ?? ""}到${to ?? ""}对${body}积分` : `对${body}积分`;
		if (variable !== void 0 && from !== void 0) return `${variable}从${from}到${to ?? "无穷大"}对${body}${verb}`;
		return condition ? `${condition}时对${body}${verb}` : `对${body}${verb}`;
	},
	absolute: (x) => `${x}的绝对值`,
	quantity: (x) => `括号${x}括号`,
	groupOf: {
		sum: (a, b) => `${a}与${b}的和`,
		difference: (a, b) => `${a}与${b}的差`
	},
	set: (x, c) => c ? `满足${c}的${x}的集合` : `集合${x}`,
	interval: (a, b, { left, right }) => {
		if (left === right) return `${left ? "闭" : "开"}区间${a}到${b}`;
		return `${left ? "左闭右开" : "左开右闭"}区间${a}到${b}`;
	},
	complement: (set, universe) => universe ? `${set}在${universe}中的补集` : `${set}的补集`,
	powerSet: (set) => `${set}的幂集`,
	cardinality: (set) => `${set}的元素个数`,
	percent: (n) => `百分之${n}`,
	accent: {
		ket: (b) => `ket ${b}`,
		bra: (b) => `bra ${b}`,
		overline: (b) => `${b}拔`,
		bar: (b) => `${b}拔`,
		vec: (b) => `向量${b}`,
		overrightarrow: (b) => `向量${b}`,
		hat: (b) => `${b}帽`,
		widehat: (b) => `${b}帽`,
		tilde: (b) => `${b}波浪`,
		dot: (b) => `${b}点`,
		overarc: (b) => `弧${b}`,
		wideparen: (b) => `弧${b}`
	},
	segment: (name) => `线段${name}`,
	binomial: (n, k) => `从${n}中取${k}的组合数`,
	unitRatio: (n, d, power) => `${n}每${unitPower(power, {
		2: "平方",
		3: "立方"
	})}${d}`,
	celsius: (value) => `${value}摄氏度`,
	numberSets: {
		"R": "实数集",
		"N": "自然数集",
		"Z": "整数集",
		"Q": "有理数集",
		"C": "复数集",
		"N+": "正整数集",
		"N*": "正整数集",
		"Z+": "正整数集",
		"Z-": "负整数集",
		"Z*": "非零整数集",
		"R+": "正实数集",
		"R-": "负实数集",
		"R*": "非零实数集",
		"Q+": "正有理数集"
	},
	units: {
		prefixes: {
			Q: "昆它",
			R: "容那",
			Y: "尧它",
			Z: "泽它",
			E: "艾可萨",
			P: "拍它",
			T: "太",
			G: "吉",
			M: "兆",
			k: "千",
			h: "百",
			da: "十",
			d: "分",
			c: "厘",
			m: "毫",
			µ: "微",
			n: "纳",
			p: "皮",
			f: "飞",
			a: "阿",
			z: "仄",
			y: "幺",
			r: "柔",
			q: "亏"
		},
		units: {
			m: "米",
			g: "克",
			s: "秒",
			A: "安培",
			K: "开尔文",
			mol: "摩尔",
			cd: "坎德拉",
			Hz: "赫兹",
			N: "牛顿",
			Pa: "帕斯卡",
			J: "焦耳",
			W: "瓦特",
			C: "库仑",
			V: "伏特",
			F: "法拉",
			Ω: "欧姆",
			S: "西门子",
			Wb: "韦伯",
			T: "特斯拉",
			H: "亨利",
			lm: "流明",
			lx: "勒克斯",
			Bq: "贝可勒尔",
			Gy: "戈瑞",
			Sv: "希沃特",
			kat: "开特",
			L: "升",
			l: "升",
			t: "吨",
			eV: "电子伏特",
			Da: "道尔顿",
			bar: "巴",
			B: "字节",
			bit: "比特",
			cal: "卡"
		},
		joinFactors: (words) => words.join(""),
		plain: {
			min: "分钟",
			h: "小时",
			d: "天",
			ha: "公顷",
			au: "天文单位",
			Å: "埃",
			atm: "标准大气压",
			Rt: "直角",
			dB: "分贝",
			ft: "英尺",
			mi: "英里"
		},
		overrides: {
			kg: "公斤",
			hPa: "百帕"
		},
		power: (words, power) => `${power === "2" ? "平方" : "立方"}${words}`
	}
};
//#endregion
//#region src/lower.ts
const multiplicative = /* @__PURE__ */ new Set(["Multiply", "InlineDivide"]);
/** Signs that can start an operand, as in `-1` or `\pm b`. */
const unaryHeads = {
	"+": "Positive",
	"-": "Negate",
	"\\pm": "PlusMinus",
	"\\mp": "MinusPlus"
};
const smallSetOperators = {
	"\\cap": "BigIntersection",
	"∩": "BigIntersection",
	"\\cup": "BigUnion",
	"∪": "BigUnion"
};
const bigOperators = {
	"\\lim": "Limit",
	"\\sum": "Sum",
	"∑": "Sum",
	"\\prod": "Product",
	"∏": "Product",
	"\\int": "Integrate",
	"∫": "Integrate",
	"\\iint": "Integrate",
	"\\oint": "Integrate",
	"\\bigcup": "BigUnion",
	"⋃": "BigUnion",
	"\\bigcap": "BigIntersection",
	"⋂": "BigIntersection"
};
/** Symbols that only group or separate. Unpaired delimiters land here too. */
const silent$1 = /* @__PURE__ */ new Set([
	"(",
	")",
	"[",
	"]",
	"|",
	"\\{",
	"\\}",
	"\\lbrace",
	"\\rbrace",
	"\\langle",
	"\\rangle",
	"\\vert",
	"\\lvert",
	"\\rvert",
	"&",
	",",
	";",
	":",
	".",
	"\\colon"
]);
/** A separator starts a new operand, so a sign after it is unary, for example `-1` in `(0, -1)`. */
const separators = /* @__PURE__ */ new Set([
	",",
	";",
	"&"
]);
/**
* Separators that split operands into a list, as in `r, s \in \Sigma` or `f(x; \theta)`. The items of a list are read
* with a pause between them. Without the split, `r, s` would join as the product `r s`.
* `&` is not here: it aligns columns, and an aligned equation is not a list.
*/
const listSeparators = /* @__PURE__ */ new Set([",", ";"]);
/** Between two operands, a triangle is the symmetric difference of two sets. Before an operand, it is the shape. */
const triangles = /* @__PURE__ */ new Set([
	"\\triangle",
	"△",
	"\\bigtriangleup"
]);
const infinities$1 = /* @__PURE__ */ new Set(["\\infty", "∞"]);
const setRelations = /* @__PURE__ */ new Set([
	"\\in",
	"\\notin",
	"\\subseteq",
	"\\subset",
	"\\supseteq",
	"\\supset"
]);
const setOperators = /* @__PURE__ */ new Set([
	"\\cup",
	"\\cap",
	"\\setminus"
]);
const complements = /* @__PURE__ */ new Set(["\\complement", "∁"]);
const degreeMarks = /* @__PURE__ */ new Set(["\\circ", "°"]);
const derivativeMarks = /* @__PURE__ */ new Set([
	"d",
	"\\partial",
	"∂"
]);
const fractionCommands = /* @__PURE__ */ new Set([
	"frac",
	"dfrac",
	"tfrac",
	"cfrac"
]);
const binomialCommands = /* @__PURE__ */ new Set([
	"binom",
	"dbinom",
	"tbinom"
]);
const arrows = /* @__PURE__ */ new Set([
	"\\to",
	"\\rightarrow",
	"→",
	"\\longrightarrow"
]);
/** `A^c` is a complement only on a set name. On other bases, for example `x^c`, it is a power. */
const number = /^\d+(?:\.\d+)?$/;
const upperLetter = /^[A-Z]$/;
const latinLetter$1 = /^[a-z]$/i;
const digits = /^\d+$/;
/** Greek letter commands in both cases, for example `\phi` and `\Phi`. */
const greekCommands = new Set(greekNames.flatMap((name) => [`\\${name}`, `\\${name[0].toUpperCase()}${name.slice(1)}`]));
/**
* Letters that name a function by convention, so `f(x+1)` is a call although its parentheses hold a sum.
* Other letters before a sum in parentheses multiply it, as `n` in `n(n+1)`.
*/
const functionLetters = /* @__PURE__ */ new Set([
	"f",
	"g",
	"h",
	"p",
	"q",
	"u",
	"v",
	"w",
	"F",
	"G",
	"H",
	"L",
	"P",
	"Q",
	"\\phi",
	"\\varphi",
	"\\psi",
	"\\Phi",
	"\\Psi",
	"\\Gamma"
]);
/**
* Function commands of TeX, as `\ln` or `\gcd`. Parentheses after them hold arguments, also with a sum inside:
* `\ln(x+1)` is the log of x + 1, never `\ln` times x + 1.
*/
const functionCommands = /* @__PURE__ */ new Set([
	"\\sin",
	"\\cos",
	"\\tan",
	"\\cot",
	"\\sec",
	"\\csc",
	"\\arcsin",
	"\\arccos",
	"\\arctan",
	"\\sinh",
	"\\cosh",
	"\\tanh",
	"\\coth",
	"\\ln",
	"\\log",
	"\\lg",
	"\\exp",
	"\\det",
	"\\gcd",
	"\\max",
	"\\min",
	"\\sup",
	"\\inf",
	"\\deg",
	"\\dim",
	"\\ker",
	"\\arg",
	"\\hom"
]);
/** Letters that upright text writes for a constant or a differential: `\mathrm{d}x`, `\mathrm{e}^x`, `\mathrm{i}`. */
const uprightLetters = /* @__PURE__ */ new Set([
	"d",
	"e",
	"i"
]);
/** Superscripts that restrict a number set by sign, keyed to the suffix of the set name in `numberSets`. */
const signedSets = {
	"+": "+",
	"-": "-",
	"*": "*",
	"\\ast": "*"
};
/** Constants that are never called: `e^{i\theta}(\cos\theta + i\sin\theta)` multiplies. */
const constants = /* @__PURE__ */ new Set([
	"e",
	"i",
	"\\pi"
]);
/** Accents that keep a letter a name, for example `\bar{x}(t)` or `\hat{f}(\xi)`. */
const accentCommands = /* @__PURE__ */ new Set([
	"bar",
	"hat",
	"tilde",
	"vec",
	"dot",
	"ddot",
	"check",
	"breve",
	"overline",
	"widehat",
	"widetilde"
]);
/** A centered dot alone in an argument marks an empty slot, as in `p(\cdot)` or `\langle \cdot, \cdot \rangle`. */
const placeholderMarks = /* @__PURE__ */ new Set([
	"\\cdot",
	"\\bullet",
	"·",
	"∙"
]);
/** Delimiters of a norm, as in `\|x\|`. */
const normDelimiters = /* @__PURE__ */ new Set([
	"\\|",
	"\\Vert",
	"\\lVert",
	"‖"
]);
/** Font commands that keep a letter a name, so `\mathcal{L}(\theta)` is a call. `\mathbb` is not here: it names sets. */
const nameFonts = /* @__PURE__ */ new Set([
	"mathcal",
	"mathscr",
	"mathfrak",
	"mathbf",
	"boldsymbol",
	"bm"
]);
/** Calligraphic fonts. A distribution is often named with one, for example `\mathcal{N}` or `\mathcal{U}`. */
const calligraphicFonts = /* @__PURE__ */ new Set(["mathcal", "mathscr"]);
/** Fonts that make a letter bold. A bold letter is a variable. */
const boldFonts = /* @__PURE__ */ new Set([
	"bf",
	"mathbf",
	"textbf",
	"boldsymbol",
	"bm"
]);
const solarBases = /* @__PURE__ */ new Set([
	"M",
	"L",
	"R"
]);
const solarMarks = /* @__PURE__ */ new Set(["\\odot", "⊙"]);
/**
* Letters that name a probability density or a distribution, so `x \sim p_t` means x is drawn from it.
* Without one of these on the right, `\sim` keeps its meaning of similarity, as in `\triangle ABC \sim \triangle DEF`.
*/
const densityLetters = /* @__PURE__ */ new Set([
	"p",
	"q",
	"P",
	"Q",
	"\\pi"
]);
/** The operators of probability, keyed by the letter or the name that writes them. */
const statistics = {
	E: "Expectation",
	P: "Probability",
	Pr: "Probability",
	Var: "Variance",
	Cov: "Covariance"
};
/** Superscripts that mark a symbol instead of raising it to a power: `\mathbb{R}^{+}`, `x^{*}`. */
const superscriptMarks = {
	"+": "+",
	"-": "-",
	"*": "\\ast",
	"\\ast": "\\ast",
	"\\dagger": "\\dagger",
	"\\dag": "\\dagger",
	"†": "\\dagger",
	"\\top": "T",
	"\\intercal": "T",
	"\\vee": "\\vee",
	"\\wedge": "\\wedge"
};
function relationOf(node) {
	if (node.type !== "symbol") return void 0;
	const key = canonicalSymbol(node.value);
	return relationHeads[key] === void 0 ? void 0 : key;
}
function operatorOf(value) {
	const key = canonicalSymbol(value);
	return operatorHeads[key] === void 0 ? void 0 : key;
}
function containsSymbol(nodes, values) {
	return nodes?.some((node) => {
		switch (node.type) {
			case "symbol": return values.has(node.value);
			case "group":
			case "fence": return containsSymbol(node.children, values);
			case "scripts": return containsSymbol([node.base], values) || containsSymbol(node.sub, values) || containsSymbol(node.sup, values);
			case "command": return node.args.some((argument) => containsSymbol(argument, values));
			default: return false;
		}
	}) ?? false;
}
function containsOperator(nodes) {
	return nodes.some((node) => node.type === "symbol" && operatorOf(node.value) !== void 0 || (node.type === "group" || node.type === "fence") && containsOperator(node.children));
}
function isOnlySymbol(nodes, value) {
	return nodes?.length === 1 && nodes[0].type === "symbol" && nodes[0].value === value;
}
/** Splits `a, b` at its only comma. A list with more or fewer items is not a pair. */
function splitPair(nodes) {
	const commas = nodes.flatMap((node, index) => node.type === "symbol" && node.value === "," ? [index] : []);
	if (commas.length !== 1) return void 0;
	const left = nodes.slice(0, commas[0]);
	const right = nodes.slice(commas[0] + 1);
	return left.length > 0 && right.length > 0 ? [left, right] : void 0;
}
/** Splits a list at its top-level commas. Commas inside groups and delimiters stay. */
function splitClauses(nodes) {
	const clauses = [[]];
	for (const node of nodes) if (node.type === "symbol" && node.value === ",") clauses.push([]);
	else clauses.at(-1).push(node);
	return clauses;
}
/** A number keeps its digits. Other symbols keep their TeX token. */
function atom(value) {
	if (/^\.\d+$/.test(value)) return { num: `0${value}` };
	return number.test(value) ? { num: value } : value;
}
/**
* Lowers the syntax tree of a formula into MathJSON.
*
* This is the only place that decides what notation means, for example that `\frac{d}{dx}` is a derivative or that a
* pair after `\in` is an interval. It keeps what the writer wrote and never simplifies.
*/
function lowerMath(nodes) {
	return lowerList(nodes);
}
/** Lowers a list that may hold relations and comma-separated statements. */
function lowerList(nodes) {
	const clauses = splitClauses(nodes);
	if (clauses.filter((clause) => clause.some((node) => relationOf(node) !== void 0)).length >= 2) return ["Clauses", ...clauses.map(lowerClause)];
	return lowerClause(nodes);
}
/** Lowers one statement. Each relation joins the expression on its left with the operand on its right. */
function lowerClause(nodes) {
	const operands = [[]];
	const relations = [];
	for (const node of nodes) {
		let relation = relationOf(node);
		const last = operands.at(-1).at(-1);
		if (relation === "=" && last?.type === "symbol" && last.value === ":") {
			operands.at(-1).pop();
			relation = "\\coloneqq";
		}
		if (relation !== void 0) {
			relations.push(relation);
			operands.push([]);
		} else operands.at(-1).push(node);
	}
	const first = operands[0];
	const colon = first.findIndex((node) => node.type === "symbol" && (node.value === ":" || node.value === "\\colon"));
	let start = 0;
	let left;
	if (colon > 0 && relations[0] === "\\to") {
		left = [
			"Mapping",
			lowerTerms(first.slice(0, colon)),
			lowerTerms(first.slice(colon + 1)),
			lowerTerms(operands[1])
		];
		start = 1;
	} else left = lowerTerms(first);
	for (let index = start; index < relations.length; index++) {
		const right = lowerTerms(operands[index + 1], relations[index]);
		let head = relationHeads[relations[index]];
		if (relations[index] === "\\to" && isMapArrow(left, right)) head = "Arrow";
		else if (relations[index] === "\\sim" && isDistribution(right)) head = "Distributed";
		else if (relations[index] === "\\sim" && isQuantity(right)) head = left === nothing ? "About" : "Approx";
		else if (relations[index] === "\\approx" && left === nothing && isQuantity(right)) head = "About";
		left = head === "About" ? ["About", right] : [
			head,
			left,
			right
		];
	}
	return left;
}
/** Heads of objects that are sets, spaces, or other structures, not numbers, so nothing approaches them. */
const structureHeads = /* @__PURE__ */ new Set([
	"Apply",
	"NumberSet",
	"Name",
	"Set",
	"Sequence",
	"Bracket"
]);
/**
* True when an expression names a structure: a capital letter, a number set, or one of these with scripts.
* A call is a structure when its name is one, so `H_k(M)` is a group of homology but `f(x)` is a value.
*/
function isStructure(value) {
	if (typeof value === "string") return upperLetter.test(value) || greekCommands.has(value) && value[1] !== value[1].toLowerCase();
	const head = headOf(value);
	if (head === "Subscript" || head === "Superscript" || head === "Apply") return isStructure(argsOf(value)[0] ?? nothing);
	if (head === "Accent") return isStructure(argsOf(value)[1] ?? nothing);
	return head !== void 0 && structureHeads.has(head);
}
/**
* True when `left \to right` maps one structure to another, as in `H_k(M) \to H_k(M, N)` or `X \to Y`, so the arrow
* reads "to". Otherwise it is a limit, as in `n \to \infty` or `f(x) \to L`, and reads "approaches".
*
* A call on the right is a structure: nothing approaches `H_k(M, N)`. A capital letter on the right is a structure
* only when the left is one too, because `f(x) \to L` approaches the limit L.
*/
function isMapArrow(left, right) {
	const head = headOf(right);
	if (head !== void 0 && structureHeads.has(head)) return true;
	return isStructure(right) && isStructure(left);
}
/** Nests a flat list of operands and operators, with multiplicative operators first. Each level is left-associative. */
function nest(items) {
	const resolved = [];
	for (let index = 0; index < items.length; index++) {
		const item = items[index];
		if (item.kind !== "prefix") {
			resolved.push(item);
			continue;
		}
		const next = items[index + 1];
		if (next?.kind === "operand") {
			resolved.push({
				kind: "operand",
				value: [unaryHeads[item.key], next.value]
			});
			index++;
		} else resolved.push({
			kind: "operand",
			value: [unaryHeads[item.key]]
		});
	}
	const joined = [];
	for (const item of resolved) {
		const previous = joined.at(-1);
		if (item.kind === "operand" && previous?.kind === "operand") {
			const value = previous.value;
			previous.value = isFunction(value, "InvisibleOperator") ? [
				"InvisibleOperator",
				...argsOf(value),
				item.value
			] : [
				"InvisibleOperator",
				value,
				item.value
			];
			continue;
		}
		joined.push({ ...item });
	}
	function level(list, heads) {
		const result = [];
		for (let index = 0; index < list.length; index++) {
			const item = list[index];
			const left = result.at(-1);
			const right = list[index + 1];
			if (item.kind === "operator" && heads(operatorHeads[item.key]) && left?.kind === "operand" && right?.kind === "operand") {
				left.value = [
					operatorHeads[item.key],
					left.value,
					right.value
				];
				index++;
				continue;
			}
			result.push({ ...item });
		}
		return result;
	}
	const values = level(level(joined, (head) => multiplicative.has(head)), () => true).map((item) => item.kind === "operand" ? item.value : item.key);
	return values.length === 1 ? values[0] : values.length === 0 ? nothing : ["InvisibleOperator", ...values];
}
/**
* Nests each part of a list of terms. One part is an ordinary expression. More parts make `["Sequence", ...]`.
*
* The split comes before the nesting, so an operator never joins two items of a list: in `a, -b` the minus is the
* sign of `b`, not a subtraction from `a`. Empty parts, as in a trailing comma, are dropped.
*/
function nestList(items) {
	const parts = [[]];
	for (const item of items) if (item.kind === "separator") parts.push([]);
	else parts.at(-1).push(item);
	const filled = parts.filter((part) => part.length > 0);
	return filled.length > 1 ? ["Sequence", ...filled.map(nest)] : nest(filled[0] ?? []);
}
/** True when a node is a calligraphic letter, with or without scripts, for example `\mathcal{N}` or `\mathcal{L}_{FM}`. */
function isCalligraphic(node) {
	if (node.type === "scripts") return isCalligraphic(node.base);
	return node.type === "command" && calligraphicFonts.has(node.name);
}
/**
* Returns the operator of probability that a node writes, with its subscript, for example `\mathbb{E}_{x \sim p}`,
* `\operatorname{Var}`, or `\Pr`. The subscript holds the variables or the distributions that the operator averages
* over.
*/
function statisticOf(node) {
	if (node.type === "scripts" && !node.sup?.length) {
		const inner = statisticOf(node.base);
		return inner && {
			head: inner.head,
			sub: node.sub
		};
	}
	let name;
	if (node.type === "command" && (node.name === "mathbb" || node.name === "mathbf") && node.args[0]?.length === 1 && node.args[0][0].type === "symbol") name = node.args[0][0].value;
	else if (node.type === "text" && (node.name === "operatorname" || node.name === "mathrm")) name = node.value.trim();
	else if (node.type === "symbol" && node.value === "\\Pr") name = "Pr";
	const head = name === void 0 ? void 0 : statistics[name];
	return head && { head };
}
/** Number sets of school that read as sets with powers, as `\mathbb{R}^n`. Other blackboard letters name spaces. */
const schoolNumberSets = /* @__PURE__ */ new Set([
	"R",
	"Z",
	"Q",
	"C",
	"N"
]);
/** True when an expression is a blackboard letter that names a space, as `\mathbb{P}`, not a number set of school. */
function isSpaceName(value) {
	if (headOf(value) !== "NumberSet") return false;
	const letter = argsOf(value)[0];
	return typeof letter === "string" && !schoolNumberSets.has(letter);
}
/** Letters that name function spaces, as `L^p(\Omega)` or `H^1(\Omega)`. */
const spaceLetters = /* @__PURE__ */ new Set([
	"L",
	"H",
	"W",
	"C",
	"\\ell"
]);
/**
* The name of a called function space keeps its exponent as a label: `L^p(\Omega)` is L p of omega. A power of a
* letter is not called, so `L^p` before parentheses is a space.
*/
function spaceCallee(callee) {
	const [base = nothing, exponent = nothing] = argsOf(callee);
	if (headOf(callee) === "Unit" && exponent === nothing) return ["Text", base];
	return headOf(callee) === "Power" && typeof base === "string" && spaceLetters.has(base) ? [
		"Superscript",
		base,
		exponent
	] : callee;
}
/** True when an expression is a measured quantity: a number, possibly with a power, a percent, or a unit. */
function isQuantity(value) {
	if (isNumber(value)) return true;
	const head = headOf(value);
	if (head === "Power" || head === "Percent" || head === "Negate") return isQuantity(argsOf(value)[0] ?? nothing);
	if (head === "InvisibleOperator" || head === "Multiply") return isQuantity(argsOf(value)[0] ?? nothing) && argsOf(value).slice(1).every((item) => headOf(item) === "Unit" || isQuantity(item));
	return false;
}
/** True when the right side of `\sim` names a distribution or a density, see {@link densityLetters}. */
function isDistribution(value) {
	if (typeof value === "string") return densityLetters.has(value);
	const head = headOf(value);
	const [first = nothing, second = nothing] = argsOf(value);
	if (head === "Accent") return first === "'mathcal'" || first === "'mathscr'";
	if (head === "Subscript" || head === "Superscript" || head === "Apply") return isDistribution(first);
	return head === "Text" && second === nothing;
}
/** Operators that bind tighter than a sum, so a sum in parentheses after them keeps its brackets: `a - (b - c)`. */
const tightOperators = /* @__PURE__ */ new Set([
	"-",
	"\\times",
	"\\cdot",
	"\\div"
]);
/**
* True when parentheses with an operator inside must be read, because a neighbor binds to them.
*
* Silent brackets lose the grouping that they write. `v - (x - \epsilon)` read as "v minus x minus epsilon" means
* `v - x - \epsilon`, and `(1-t)\epsilon` read as "one minus t epsilon" means `1 - t\epsilon`. So the brackets are read
* when an operand comes right before them, as in `n(n+1)`, when an operand comes right after them, as in `(1-t)\epsilon`,
* when a minus, a times, or a division sign comes before them, or when a times or a division sign comes after them, as
* in `(x+1)/2`. After a plus or a relation, and before a plus, a minus, or a relation, they can stay silent.
*/
function isBound(afterOperand, previous, next) {
	if (afterOperand) return true;
	if (previous?.type === "symbol" && tightOperators.has(operatorOf(previous.value) ?? previous.value)) return true;
	if (next === void 0) return false;
	if (next.type !== "symbol") return true;
	const nextOperator = operatorOf(next.value);
	if (nextOperator !== void 0 && nextOperator !== "-" && tightOperators.has(nextOperator)) return true;
	return operatorOf(next.value) === void 0 && relationOf(next) === void 0 && !silent$1.has(next.value) && ![
		"!",
		"'",
		"\\prime",
		"%",
		"\\%"
	].includes(next.value);
}
/** True when the nodes are one centered dot, the mark of an empty argument slot. */
function isPlaceholder(nodes) {
	return nodes.length === 1 && nodes[0].type === "symbol" && placeholderMarks.has(nodes[0].value);
}
/**
* True when a node can name a function: a letter, a Greek letter, or one of them with scripts or an accent, for
* example `f`, `\phi`, `H_k`, `f^{-1}`, or `\bar{x}`.
*
* `before` is the node before `name`. A capital letter after another capital letter is the end of a name of geometry,
* as `B` in `AB`, so it does not name a function.
*/
function isCallee(name, before) {
	switch (name.type) {
		case "symbol":
			if (functionCommands.has(name.value)) return true;
			if (constants.has(name.value) || !latinLetter$1.test(name.value) && !greekCommands.has(name.value)) return false;
			return !upperLetter.test(name.value) || before?.type !== "symbol" || !upperLetter.test(before.value);
		case "scripts":
			if (name.base.type === "symbol" && functionCommands.has(name.base.value)) return true;
			if (!name.sub?.length && name.sup?.length && name.sup.every((item) => item.type === "symbol" && digits.test(item.value))) return false;
			return isCallee(name.base, void 0);
		case "text": return (name.name === "operatorname" || name.name === "mathrm") && /^[a-z]+$/i.test(name.value.trim());
		case "command":
			if (name.name === "mathbb" && name.args[0]?.length === 1 && name.args[0][0].type === "symbol" && !schoolNumberSets.has(name.args[0][0].value)) return true;
			if (nameFonts.has(name.name) && name.args[0] && name.args[0].length <= 3 && name.args[0].every((item) => item.type === "symbol" && latinLetter$1.test(item.value))) return true;
			return (accentCommands.has(name.name) || nameFonts.has(name.name)) && name.args[0]?.length === 1 && isCallee(name.args[0][0], void 0);
		default: return false;
	}
}
/**
* True when a name carries more than a letter: a subscript, a superscript that is not a number, or an accent. Such a
* name is usually a function or an operator of its field, for example `H_k` of homology or `f^{-1}`. A number
* superscript is a power, so `x^2(x+1)` stays a product.
*/
function isDecorated(name) {
	if (name.type === "command") return true;
	if (name.type !== "scripts") return false;
	const numberPower = name.sup !== void 0 && name.sup.every((node) => node.type === "symbol" && digits.test(node.value));
	return Boolean(name.sub?.length) || Boolean(name.sup?.length) && !numberPower;
}
/**
* Returns the arguments of `name(...)` when the parentheses are a function call, or undefined when they group a
* factor of a product.
*
* TeX writes `f(x)` and `n(n+1)` the same way: a letter, then parentheses. Speech must choose, because "f of x" and
* "n times the quantity n plus one" are different formulas for the listener. The rules, in order:
*
* 1. Only parentheses after a name can be a call, see {@link isCallee}.
* 2. A top-level comma means arguments, because a product has no comma: `H_k(M, M-N)`, `A_1(\Sigma, f)`. A pair with
*    an infinite bound is an interval instead, as in `(-\infty, 0)`.
* 3. One argument without an operator is a call: `x(t)`, `A_1(f)`, `p(\cdot)`. A writer multiplies letters as `xt`.
* 4. An argument with an operator is a call only after a decorated name or a function letter: `H_1(S-P)` and
*    `f(x+1)` are calls, but `n(n+1)` and `a(b+c)` are products.
*
* In Chinese, Japanese, and Korean a simple call reads as the product did, so these rules change only English words
* and the grouped readings, see `MathLocale.apply`.
*/
function callArguments(name, before, fence) {
	if (fence.open === "[" && isCalligraphic(name)) return [lowerFence({
		...fence,
		sub: void 0,
		sup: void 0
	}, true, false)];
	const namedList = name.type === "symbol" && upperLetter.test(name.value) && splitClauses(fence.children).length > 1;
	if (fence.open !== "(" || !isCallee(name, before) && !namedList) return void 0;
	const parts = splitClauses(fence.children);
	if (parts.length > 1 && containsSymbol(fence.children, infinities$1)) return void 0;
	if (!(parts.length > 1 || isPlaceholder(fence.children) || !containsOperator(fence.children) || isDecorated(name) || name.type === "text" || name.type === "symbol" && (functionLetters.has(name.value) || functionCommands.has(name.value)) || name.type === "scripts" && name.base.type === "symbol" && functionCommands.has(name.base.value))) return void 0;
	if (fence.children.length === 0) return [];
	return parts.map((part) => isPlaceholder(part) ? ["Placeholder"] : lowerArgument(part));
}
/**
* Lowers an argument of a call or of a statistic. A bar inside it is a condition, as `P(A \mid B)` or
* `p(x \mid \theta)`: the first part given the second. Outside arguments and sets, `a \mid b` is divides.
*/
function lowerArgument(nodes) {
	const bar = nodes.findIndex((node) => node.type === "symbol" && (node.value === "\\mid" || node.value === "|"));
	if (bar <= 0 || bar === nodes.length - 1) return lowerList(nodes);
	return [
		"Given",
		lowerList(nodes.slice(0, bar)),
		lowerList(nodes.slice(bar + 1))
	];
}
/**
* Lowers `\pmod{n}`. KaTeX writes it as parentheses around an upright mod and the modulus, which would read as a call.
*/
function modulusOf(node) {
	if (node.type !== "fence" || node.open !== "(") return void 0;
	const [wrapped, ...rest] = node.children;
	const first = wrapped?.type === "group" && wrapped.children.length === 1 ? wrapped.children[0] : wrapped;
	return first?.type === "text" && first.value.trim() === "mod" && rest.length > 0 ? ["Modulo", lowerList(rest)] : void 0;
}
/** `relation` is the relation before the terms, so `\in` can mark the interval after it. */
function lowerTerms(nodes, relation) {
	const items = [];
	let afterOperand = false;
	const push = (value) => {
		items.push({
			kind: "operand",
			value
		});
		afterOperand = true;
	};
	const replaceLast = (wrap) => {
		const last = items.at(-1);
		if (last?.kind === "operand") last.value = wrap(last.value);
		else push(wrap(nothing));
	};
	for (let index = 0; index < nodes.length; index++) {
		const node = nodes[index];
		const next = nodes[index + 1];
		const previous = nodes[index - 1];
		const statistic = statisticOf(node);
		const hasArgument = next?.type === "fence" || statistic?.sub !== void 0 && next !== void 0;
		if (statistic && hasArgument) {
			const condition = statistic.sub ? [lowerList(statistic.sub)] : [];
			if (next?.type === "fence" && (next.open === "[" || next.open === "(" || next.open === "\\{")) {
				push(lowerScripts([
					statistic.head,
					lowerArgument(next.children),
					...condition
				], next.sub, next.sup));
				index++;
				continue;
			}
			push([
				statistic.head,
				lowerTerms(nodes.slice(index + 1)),
				...condition
			]);
			break;
		}
		const big = bigOperator(node);
		if (big) {
			push(lowerBigOperator(big, lowerTerms(nodes.slice(index + 1))));
			break;
		}
		const derivative = derivativeOf(node);
		if (derivative) {
			if (derivative.body !== void 0) {
				push(derivative.order ? [
					"D",
					derivative.body,
					derivative.variable,
					{ num: derivative.order }
				] : [
					"D",
					derivative.body,
					derivative.variable
				]);
				continue;
			}
			const body = lowerTerms(nodes.slice(index + 1));
			push(derivative.order ? [
				"D",
				body,
				derivative.variable,
				{ num: derivative.order }
			] : [
				"D",
				body,
				derivative.variable
			]);
			break;
		}
		const prefixed = next === void 0 ? void 0 : lowerSetPrefix(node, next);
		if (prefixed !== void 0) {
			push(prefixed);
			index++;
			continue;
		}
		const modulus = modulusOf(node);
		if (modulus !== void 0) {
			push(modulus);
			continue;
		}
		if (node.type === "fence") {
			const args = afterOperand && previous !== void 0 ? callArguments(previous, nodes[index - 2], node) : void 0;
			if (args !== void 0) {
				replaceLast((callee) => lowerScripts([
					"Apply",
					spaceCallee(callee),
					...args
				], node.sub, node.sup));
				continue;
			}
			push(lowerFence(node, index === 0 ? relation !== void 0 && setRelations.has(relation) : previous?.type === "symbol" && setOperators.has(canonicalSymbol(previous.value)), isBound(afterOperand, previous, next)));
			continue;
		}
		if (node.type === "text" && node.value.trim() === "C" && previous?.type === "scripts" && previous.sup?.length === 1 && previous.sup[0].type === "symbol" && degreeMarks.has(previous.sup[0].value)) {
			replaceLast(() => ["Celsius", lowerNode(previous.base)]);
			continue;
		}
		if (node.type === "symbol" && upperLetter.test(node.value)) {
			let end = index;
			while (nodes[end + 1]?.type === "symbol" && upperLetter.test(nodes[end + 1].value)) end++;
			if (end > index) {
				push(["Name", ...nodes.slice(index, end + 1).map((item) => item.value)]);
				index = end;
				continue;
			}
		}
		if (node.type !== "symbol") {
			push(lowerNode(node));
			continue;
		}
		const value = node.value;
		if (silent$1.has(value)) {
			if (separators.has(value)) afterOperand = false;
			if (listSeparators.has(value)) items.push({ kind: "separator" });
			continue;
		}
		const rightTriangle = previous?.type === "text" && previous.value.trim() === "Rt";
		if (afterOperand && triangles.has(value) && !rightTriangle) {
			items.push({
				kind: "operator",
				key: "\\triangle"
			});
			afterOperand = false;
			continue;
		}
		const operator = operatorOf(value);
		if (operator !== void 0 && !triangles.has(value)) {
			items.push(afterOperand || unaryHeads[operator] === void 0 ? {
				kind: "operator",
				key: operator
			} : {
				kind: "prefix",
				key: operator
			});
			afterOperand = false;
			continue;
		}
		if (value === "!") {
			replaceLast((operand) => ["Factorial", operand]);
			continue;
		}
		if ((value === "%" || value === "\\%") && previous?.type === "symbol" && number.test(previous.value)) {
			replaceLast((operand) => ["Percent", operand]);
			continue;
		}
		if (value === "'" || value === "\\prime") {
			replaceLast((operand) => ["Prime", operand]);
			continue;
		}
		if ((value === "\\Omega" || value === "Ω") && afterOperand && isNumber(items.at(-1)?.kind === "operand" ? items.at(-1).value : void 0)) {
			push(["Unit", text("Ω")]);
			continue;
		}
		push(atom(value));
	}
	return nestList(items);
}
/** Lowers a prefix that takes the operand after it, for example `\complement_U A`, `\mathcal{P}(A)`, or `\#A`. */
function lowerSetPrefix(node, next) {
	if (node.type === "symbol" && complements.has(node.value)) return ["Complement", lowerNode(next)];
	if (node.type === "scripts" && node.base.type === "symbol" && complements.has(node.base.value) && !node.sup?.length) return node.sub ? [
		"Complement",
		lowerNode(next),
		lowerList(node.sub)
	] : ["Complement", lowerNode(next)];
	if (node.type === "symbol" && node.value === "#") return ["Cardinality", lowerNode(next)];
	if (next.type !== "fence" || next.open !== "(") return void 0;
	if (node.type === "command" && node.name === "mathcal" && isOnlySymbol(node.args[0], "P")) return ["PowerSet", lowerList(next.children)];
	if (node.type === "text" && node.value.trim() === "card") return ["Cardinality", lowerList(next.children)];
}
function bigOperator(node) {
	if (node.type === "symbol" && bigOperators[node.value]) return { head: bigOperators[node.value] };
	if (node.type === "scripts" && node.base.type === "symbol" && bigOperators[node.base.value]) return {
		head: bigOperators[node.base.value],
		sub: node.sub,
		sup: node.sup
	};
	if (node.type === "scripts" && node.base.type === "symbol" && (node.sub?.length || node.sup?.length) && smallSetOperators[node.base.value]) return {
		head: smallSetOperators[node.base.value],
		sub: node.sub,
		sup: node.sup
	};
}
/**
* Lowers a big operator with the body that it takes.
*
* - `["Limit", body, ["Bounds", variable, target, side]]`, where side is `1` from the right and `-1` from the left.
* - `["Sum" | "Product" | "Integrate", body, ["Bounds", variable, from, to]]`.
* - Any of them with `["Condition", condition, to]` when the subscript is not `variable = from`.
*
* `Nothing` fills a bound that the writer left out.
*/
function lowerBigOperator({ head, sub, sup }, body) {
	if (head === "Limit") {
		const arrow = sub?.findIndex((node) => node.type === "symbol" && arrows.has(node.value)) ?? -1;
		if (sub && arrow > 0) {
			const target = sub.slice(arrow + 1);
			const only = target.length === 1 ? target[0] : void 0;
			const sign = only?.type === "scripts" && !only.sub?.length && only.sup?.length === 1 && only.sup[0].type === "symbol" ? only.sup[0].value : void 0;
			if (only?.type === "scripts" && (sign === "+" || sign === "-")) return [
				"Limit",
				body,
				[
					"Bounds",
					lowerList(sub.slice(0, arrow)),
					lowerNode(only.base),
					{ num: sign === "+" ? "1" : "-1" }
				]
			];
			return [
				"Limit",
				body,
				[
					"Bounds",
					lowerList(sub.slice(0, arrow)),
					lowerList(target)
				]
			];
		}
		return sub ? [
			"Limit",
			body,
			["Condition", lowerList(sub)]
		] : ["Limit", body];
	}
	const to = sup ? lowerList(sup) : nothing;
	if (head === "Integrate") return sub || sup ? [
		"Integrate",
		body,
		[
			"Bounds",
			nothing,
			sub ? lowerList(sub) : nothing,
			to
		]
	] : ["Integrate", body];
	const equals = sub?.findIndex((node) => node.type === "symbol" && node.value === "=") ?? -1;
	if (sub && equals > 0) return [
		head,
		body,
		[
			"Bounds",
			lowerList(sub.slice(0, equals)),
			lowerList(sub.slice(equals + 1)),
			to
		]
	];
	if (sub) return [
		head,
		body,
		[
			"Condition",
			lowerList(sub),
			to
		]
	];
	return sup ? [
		head,
		body,
		[
			"Condition",
			nothing,
			to
		]
	] : [head, body];
}
/**
* Returns the variable and the body of `\frac{d}{dx}`, `\frac{dy}{dx}`, or `\frac{\partial f}{\partial x}`.
* `body` is undefined when the numerator holds only the mark, so the derivative applies to what follows.
*/
function derivativeOf(node) {
	if (node.type !== "command" || !fractionCommands.has(node.name)) return void 0;
	const [numerator = [], denominator = []] = node.args;
	const isMark = (item) => item?.type === "symbol" && derivativeMarks.has(item.value) || item?.type === "text" && item.value.trim() === "d";
	const first = numerator[0];
	const order = first?.type === "scripts" && isMark(first.base) && !first.sub?.length && first.sup?.length === 1 && first.sup[0].type === "symbol" && digits.test(first.sup[0].value) ? first.sup[0].value : void 0;
	if (!isMark(first) && order === void 0 || !isMark(denominator[0]) || denominator.length < 2) return void 0;
	const last = denominator.at(-1);
	return {
		variable: lowerList(order !== void 0 && last.type === "scripts" && !last.sub?.length ? [...denominator.slice(1, -1), last.base] : denominator.slice(1)),
		body: numerator.length > 1 ? lowerList(numerator.slice(1)) : void 0,
		order
	};
}
/**
* Lowers a delimited group.
*
* - A bracket or an infinite bound makes an interval. `(a, b)` alone is also a point or the arguments of a function,
*   so it needs a set symbol before it.
* - `|x|` is `Abs`, and `\{...\}` is a set, with a condition after `\mid`.
* - Other parentheses are `Delimiter`, which is silent, or `Group`, which is read as a quantity. A group is read when a
*   power applies to it, or when it holds an operator and `bound` is true: an operand or a tight operator touches it,
*   see {@link isBound}. Its brackets then decide the meaning, so they cannot go silent.
*/
function lowerFence(node, afterSetSymbol, bound) {
	let base;
	const pair = node.open === "(" || node.open === "[" ? splitPair(node.children) : void 0;
	const bracketed = node.open === "[" || node.close === "]";
	if (pair && (bracketed || afterSetSymbol || containsSymbol(node.children, infinities$1))) {
		const from = lowerList(pair[0]);
		const to = lowerList(pair[1]);
		base = [
			"Interval",
			node.open === "[" ? from : ["Open", from],
			node.close === "]" ? to : ["Open", to]
		];
	} else if (node.open === "\\lceil" || node.open === "⌈" || node.open === "\\lfloor" || node.open === "⌊") base = [node.open === "\\lceil" || node.open === "⌈" ? "Ceil" : "Floor", lowerList(node.children)];
	else if (normDelimiters.has(node.open)) {
		const inner = isPlaceholder(node.children) ? ["Placeholder"] : lowerList(node.children);
		return lowerScripts(node.sub?.length ? [
			"Norm",
			inner,
			lowerList(node.sub)
		] : ["Norm", inner], void 0, node.sup);
	} else if (node.open === "|" || node.open === "\\vert" || node.open === "\\lvert") base = ["Abs", lowerList(node.children)];
	else if (node.open === "\\{" || node.open === "\\lbrace") {
		const condition = node.children.findIndex((child) => child.type === "symbol" && (child.value === "\\mid" || child.value === "|" || child.value === ":"));
		base = condition > 0 ? [
			"Set",
			lowerList(node.children.slice(0, condition)),
			["Condition", lowerList(node.children.slice(condition + 1))]
		] : ["Set", lowerList(node.children)];
	} else {
		const inner = lowerList(node.children);
		const product = bound && node.open === "(" && containsOperator(node.children);
		if (node.open === "[") base = ["Bracket", inner];
		else if (node.open === "(" && headOf(inner) === "Sequence") base = ["Tuple", ...argsOf(inner)];
		else base = node.sup?.length || product ? ["Group", inner] : ["Delimiter", inner];
	}
	return lowerScripts(base, node.sub, node.sup);
}
/** Lowers the scripts of a base. `baseNode` is the TeX base, so `A^c` checks the letter, not a lowered expression. */
function lowerScripts(base, sub, sup, baseNode) {
	let result = base;
	const label = sub?.length === 1 && sub[0].type === "text" ? sub[0].value.replace(/[{}\\]/g, "").trim() : void 0;
	if (isNumber(result) && sub?.[0]?.type === "symbol" && (sub[0].value === "\\pm" || sub[0].value === "±") && sub.length > 1) result = [
		"PlusMinus",
		result,
		lowerList(sub.slice(1))
	];
	else if (label !== void 0) result = [
		"Subscript",
		result,
		["Text", text(label)]
	];
	else if (sub?.length) result = [
		"Subscript",
		result,
		lowerList(sub)
	];
	if (sup?.length) {
		const uprightMark = sup.length === 1 && sup[0].type === "text" && sup[0].name !== "text" ? sup[0].value.replace(/[{}\\]/g, "").trim() : void 0;
		const only = sup.length === 1 && sup[0].type === "symbol" ? sup[0].value : uprightMark === "T" ? "T" : void 0;
		const primes = sup.every((node) => node.type === "symbol" && (node.value === "\\prime" || node.value === "'"));
		const inverse = sup.length === 2 && sup[0].type === "symbol" && sup[0].value === "-" && sup[1].type === "symbol" && sup[1].value === "1" && baseNode?.type === "symbol" && (functionLetters.has(baseNode.value) || functionCommands.has(baseNode.value));
		const ordinal = sup.length === 1 && sup[0].type === "text" && /^(?:th|st|nd|rd)$/.test(sup[0].value.trim());
		if (inverse) result = ["Inverse", result];
		else if (ordinal) result = ["Ordinal", result];
		else if (primes && sup.length > 1) result = sup.reduce((value) => ["Prime", value], result);
		else if (only !== void 0 && degreeMarks.has(only)) result = ["Degrees", result];
		else if (only === "\\prime" || only === "'") result = ["Prime", result];
		else if (only !== void 0 && (complements.has(only) || only === "c" && baseNode?.type === "symbol" && upperLetter.test(baseNode.value))) result = ["Complement", result];
		else if (only !== void 0 && headOf(result) === "NumberSet" && signedSets[only] !== void 0 && typeof argsOf(result)[0] === "string") result = ["NumberSet", `${argsOf(result)[0]}${signedSets[only]}`];
		else if (only !== void 0 && superscriptMarks[only] !== void 0) result = [
			"Superscript",
			result,
			superscriptMarks[only]
		];
		else if (only === "1" && baseNode?.type !== "symbol" || only === "1" && baseNode?.type === "symbol" && !number.test(baseNode.value) || only === "T" && baseNode?.type !== "symbol" || only === "T" && baseNode?.type === "symbol" && latinLetter$1.test(baseNode.value) || isSpaceName(base) || result === nothing && only !== void 0 && number.test(only)) result = [
			"Superscript",
			result,
			uprightMark === "T" ? "T" : lowerList(sup)
		];
		else if (sup.length === 1 && sup[0].type === "fence" && sup[0].open === "(" && !sup[0].sub?.length && !sup[0].sup?.length) result = [
			"Superscript",
			result,
			["Delimiter", lowerList(sup[0].children)]
		];
		else result = [
			"Power",
			result,
			lowerList(sup)
		];
	}
	return result;
}
/** Splits a row of an array at its `&` cells. KaTeX wraps each cell in a group, which is unwrapped. */
function cellsOf(row) {
	const cells = [[]];
	for (const node of row) if (node.type === "symbol" && node.value === "&") cells.push([]);
	else if (node.type === "group") cells.at(-1).push(...node.children.filter((child) => child.type !== "group" || child.children.length > 0));
	else cells.at(-1).push(node);
	return cells;
}
/** Words that start the condition of a case, as `\text{if } x > 0`. The packs say their own word. */
const caseWords = /^\s*(?:if|for|when|,)\s*$/i;
/** Words that write the last case, as `\text{otherwise}`. */
const otherwiseWords = /^\s*(?:otherwise|else|其他|其它|それ以外|그 ?외)\s*$/i;
/**
* Lowers an array.
*
* - `cases` becomes `["Cases", ["Case", value, condition?], ...]`. A case without a condition, or with "otherwise",
*   is the last case.
* - A matrix or a determinant becomes `["Matrix", ["Row", ...cells], ...]` or `Determinant`, so each cell is heard.
* - `aligned` and other arrays are `Rows` of statements. Their `&` only aligns the columns.
*/
function lowerRows(node) {
	if (node.name === "cases") return ["Cases", ...node.rows.filter((row) => row.length > 0).map((row) => {
		const [value = [], ...rest] = cellsOf(row);
		const condition = rest.flat();
		while (condition[0]?.type === "text" && caseWords.test(condition[0].value)) condition.shift();
		return condition.length === 0 || condition.length === 1 && condition[0].type === "text" && otherwiseWords.test(condition[0].value) ? ["Case", lowerList(value)] : [
			"Case",
			lowerList(value),
			lowerList(condition)
		];
	})];
	if (node.name === "matrix" || node.name === "determinant") return [node.name === "matrix" ? "Matrix" : "Determinant", ...node.rows.filter((row) => row.length > 0).map((row) => ["Row", ...cellsOf(row).map(lowerList)])];
	const statements = [];
	for (const row of node.rows) {
		const tokens = cellsOf(row).flat();
		if (tokens.length === 0) continue;
		if (statements.length > 0 && relationOf(tokens[0]) !== void 0) statements.at(-1).push(...tokens);
		else statements.push(tokens);
	}
	return statements.length === 1 ? lowerList(statements[0]) : ["Rows", ...statements.map(lowerList)];
}
/** Lowers a unit in text, for example `m`, `km2`, `m/s`, or `m/s^2`. Other text stays text. */
function lowerText(name, value) {
	const content = value.replace(/\\mu\s*/g, "µ").replace(/\\Omega\s*/g, "Ω").replace(/\\cdot|·/g, " ").replace(/[{}\\]/g, "").replace(/\s+/g, " ").trim();
	if (name === "text" || name === "operatorname") return ["Text", text(value.trim())];
	if (uprightLetters.has(content)) return content;
	if (boldFonts.has(name) && /^[a-z]$/i.test(content)) return content;
	const ratio = /^([a-z]+\d?)\/([a-z]+)(?:\^(\d))?$/i.exec(content);
	if (ratio) return ratio[3] ? [
		"Unit",
		text(ratio[1]),
		text(ratio[2]),
		{ num: ratio[3] }
	] : [
		"Unit",
		text(ratio[1]),
		text(ratio[2])
	];
	return lowerUnitFactors(content) ?? ["Unit", text(content.replace(/\^?(\d)$/, "$1"))];
}
/**
* Lowers a unit written as factors with powers, as `kg m^2`, `mol L^-1`, or `J mol^-1 K^-1`. Factors with a negative
* power go after "per". Returns undefined for one factor with a positive power, which ./units reads alone.
*/
function lowerUnitFactors(content) {
	const factors = content.split(" ").map((factor) => /^([^\d^-]+)\^?(-?\d)?$/.exec(factor));
	if (factors.includes(null)) return void 0;
	const parsed = factors;
	const up = parsed.filter((factor) => !factor[2]?.startsWith("-"));
	const down = parsed.filter((factor) => factor[2]?.startsWith("-"));
	if (parsed.length === 1 && down.length === 0) return void 0;
	const numerator = text(up.map((factor) => factor[1] + (factor[2] ?? "")).join(" "));
	if (down.length === 0) return ["Unit", numerator];
	if (down.length === 1 && down[0][2] !== "-1") return [
		"Unit",
		numerator,
		text(down[0][1]),
		{ num: down[0][2].slice(1) }
	];
	if (down.some((factor) => factor[2] !== "-1")) return void 0;
	return [
		"Unit",
		numerator,
		text(down.map((factor) => factor[1]).join(" "))
	];
}
function lowerNode(node) {
	switch (node.type) {
		case "symbol": return silent$1.has(node.value) ? nothing : atom(node.value);
		case "group": return lowerList(node.children);
		case "text": return lowerText(node.name, node.value);
		case "raw": return [
			"Raw",
			text(node.command),
			text(node.value)
		];
		case "rows": return lowerRows(node);
		case "scripts":
			if (node.base.type === "symbol" && solarBases.has(node.base.value) && node.sub?.length === 1 && node.sub[0].type === "symbol" && solarMarks.has(node.sub[0].value) && !node.sup?.length) return `${node.base.value}_\\odot`;
			return lowerScripts(node.base.type === "symbol" && node.base.value === "" ? nothing : lowerNode(node.base), node.sub, node.sup, node.base);
		case "fence": return lowerFence(node, false, false);
		case "command": return lowerCommand(node);
	}
}
function lowerCommand(node) {
	const [first = [], second = []] = node.args;
	if (fractionCommands.has(node.name)) return [
		"Divide",
		lowerList(first),
		lowerList(second)
	];
	if (binomialCommands.has(node.name)) return [
		"Binomial",
		lowerList(first),
		lowerList(second)
	];
	switch (node.name) {
		case "sqrt": return node.option?.length ? [
			"Root",
			lowerList(first),
			lowerList(node.option)
		] : ["Sqrt", lowerList(first)];
		case "overset":
		case "stackrel": return isOnlySymbol(first, "\\frown") ? ["Arc", lowerList(second)] : lowerList(second);
		case "underset": return lowerList(second);
		case "mathbb": return ["NumberSet", lowerList(first)];
		case "overline": return first.length >= 2 && first.every((item) => item.type === "symbol" && upperLetter.test(item.value)) ? ["Segment", ...first.map((item) => item.value)] : [
			"Accent",
			text("overline"),
			lowerList(first)
		];
		default: return [
			"Accent",
			text(node.name),
			lowerList(first)
		];
	}
}
//#endregion
//#region src/tex.ts
const fences = {
	"(": ")",
	"[": "]",
	"\\{": "\\}",
	"\\lbrace": "\\rbrace",
	"\\langle": "\\rangle",
	"|": "|",
	"\\vert": "\\vert",
	"\\|": "\\|",
	"\\lvert": "\\rvert",
	"\\Vert": "\\Vert",
	"\\lVert": "\\rVert",
	"‖": "‖",
	"\\lceil": "\\rceil",
	"\\lfloor": "\\rfloor",
	"⌈": "⌉",
	"⌊": "⌋"
};
/** An interval mixes parentheses and brackets, for example `[0, 1)`, so either one closes the other. */
function closes(open, close) {
	if (fences[open] === close) return true;
	return (open === "(" || open === "[") && (close === ")" || close === "]");
}
/** Symbols after which a bar opens an absolute value or a norm, instead of closing one. */
const opensAfter = /* @__PURE__ */ new Set([
	"+",
	"-",
	"=",
	"<",
	">",
	",",
	"\\times",
	"\\pm",
	"\\leq",
	"\\geq",
	"\\neq",
	"\\approx",
	"/"
]);
/**
* Pairs delimiters into fence nodes, so `(a+b)^2` squares the whole group and `|x|` is one absolute value.
* A script on the closing delimiter moves to the fence.
*/
function fence(nodes) {
	const result = [];
	const stack = [];
	for (const node of nodes.map(deepFence)) {
		const value = node.type === "symbol" ? node.value : node.type === "scripts" && node.base.type === "symbol" ? node.base.value : void 0;
		const top = stack.at(-1);
		const before = result.at(-1);
		const opensInner = value !== void 0 && top !== void 0 && fences[value] === value && top.open === value && (result.length === top.start + 1 || before?.type === "symbol" && opensAfter.has(before.value));
		if (value !== void 0 && top && closes(top.open, value) && !opensInner) {
			stack.pop();
			const children = result.splice(top.start);
			children.shift();
			const fenced = {
				type: "fence",
				open: top.open,
				close: value,
				children
			};
			if (node.type === "scripts") {
				fenced.sub = node.sub;
				fenced.sup = node.sup;
			}
			result.push(fenced);
			continue;
		}
		if (node.type === "symbol" && fences[node.value] !== void 0) stack.push({
			open: node.value,
			start: result.length
		});
		result.push(node);
	}
	return result;
}
function deepFence(node) {
	switch (node.type) {
		case "group": return {
			...node,
			children: fence(node.children)
		};
		case "scripts": return {
			...node,
			base: deepFence(node.base),
			sub: node.sub && fence(node.sub),
			sup: node.sup && fence(node.sup)
		};
		case "command": return {
			...node,
			args: node.args.map(fence),
			option: node.option && fence(node.option)
		};
		case "rows": return {
			...node,
			rows: node.rows.map(fence)
		};
		default: return node;
	}
}
/** Lists the command names in a source, for example to check them against what a provider supports. */
function texCommands(source) {
	return [...source.matchAll(/\\([a-z]+|.)/gi)].map((match) => match[1]);
}
//#endregion
//#region src/parse.ts
const katexParse = Reflect.get(katex, "__parse");
/**
* Marks a placeholder of a raw command inside `\text{}`, see {@link liftRaw}. KaTeX rejects private-use characters in
* text, so the marker is an ASCII word that a reply does not write.
*/
const rawMarker = "airiraw";
/** `\not` before a relation: KaTeX writes it as a combining long solidus in the MathML branch. */
const notMark = "̸";
const negations = {
	"=": "\\neq",
	"\\in": "\\notin",
	"\\subseteq": "\\nsubseteq",
	"\\supseteq": "\\nsupseteq",
	"\\subset": "\\nsubseteq",
	"\\supset": "\\nsupseteq",
	"\\exists": "\\nexists"
};
/** Fonts that show plain text, so their content is read as written, for example a unit in `\mathrm{m/s}`. */
const textFonts = /* @__PURE__ */ new Set([
	"mathrm",
	"textrm",
	"mathit",
	"textit",
	"mathbf",
	"textbf",
	"mathsf",
	"mathtt",
	"rm",
	"it",
	"bf"
]);
/** Fonts that the reader handles as a command, for example `\mathbb{R}`. */
const commandFonts = /* @__PURE__ */ new Set([
	"mathbb",
	"mathcal",
	"mathfrak",
	"boldsymbol",
	"bm",
	"pmb"
]);
/** Nodes that change only spacing, size, or color. Their content, if any, is read. */
const transparent = /* @__PURE__ */ new Set([
	"styling",
	"sizing",
	"color",
	"smash",
	"lap",
	"internal"
]);
/** Nodes that have no sound. */
const silent = /* @__PURE__ */ new Set([
	"kern",
	"spacing",
	"vphantom",
	"phantom",
	"hphantom",
	"raw",
	"cr",
	"tag",
	"middle"
]);
const digit = /^\d$/;
/** KaTeX keeps the escape of these characters, but the reader matches the character, as in `\#A`. */
const escapedSpecials = {
	"\\#": "#",
	"\\$": "$",
	"\\&": "&",
	"\\_": "_"
};
/**
* Closes open braces and drops closing braces without a group, so KaTeX can parse a formula that a reply cut short.
*
* @example
* balanceBraces('\\frac{1}{')
* // => '\\frac{1}{}'
*/
function balanceBraces(source) {
	let depth = 0;
	let result = "";
	for (let index = 0; index < source.length; index++) {
		const char = source[index];
		if (char === "\\") {
			result += source.slice(index, index + 2);
			index++;
			continue;
		}
		if (char === "}" && depth === 0) continue;
		if (char === "{") depth++;
		if (char === "}") depth--;
		result += char;
	}
	return result + "}".repeat(depth);
}
/**
* Replaces each raw command, as `\ce{...}`, with a text placeholder. KaTeX does not know the commands of an extension,
* and the extension reads their source itself, so KaTeX must not parse it.
*/
function liftRaw(source, commands) {
	const raw = [];
	if (commands.length === 0) return {
		source,
		raw
	};
	const pattern = new RegExp(`\\\\(${commands.map((command) => command.replace(/\W/g, "")).join("|")})\\s*\\{`, "g");
	let result = "";
	let last = 0;
	for (const match of source.matchAll(pattern)) {
		if (match.index < last) continue;
		const open = match.index + match[0].length;
		let depth = 1;
		let end = open;
		for (; end < source.length && depth > 0; end++) {
			if (source[end] === "\\") {
				end++;
				continue;
			}
			if (source[end] === "{") depth++;
			if (source[end] === "}") depth--;
		}
		raw.push({
			command: match[1],
			value: source.slice(open, depth === 0 ? end - 1 : end)
		});
		result += `${source.slice(last, match.index)}\\text{${rawMarker}${raw.length - 1}}`;
		last = end;
	}
	return {
		source: result + source.slice(last),
		raw
	};
}
function asList(body) {
	if (body === void 0) return [];
	if (!Array.isArray(body)) return [body];
	return body.flat();
}
/** Writes the content of a text node back as source text, for example `m/s^2` from `\mathrm{m/s^2}`. */
function plainText(nodes) {
	return nodes.map((node) => {
		if (node.type === "supsub") return plainText(node.base ? [node.base] : []) + (node.sub ? `_${plainText([node.sub])}` : "") + (node.sup ? `^${plainText([node.sup])}` : "");
		if (node.type === "spacing" || node.type === "kern") return " ";
		if (node.text !== void 0) return node.text;
		return plainText(asList(node.body));
	}).join("");
}
/**
* Converts the KaTeX parse tree into the syntax tree of the reader.
*
* It joins what KaTeX splits for display: digits and a decimal point become one number, also when the last digit
* carries a script, as in `10^{8}`. It reads negations from the MathML branch, lifts `\ce{}` content, and drops nodes
* without sound. Delimiters are paired afterwards by {@link fence}.
*/
/**
* The kind of an array by its delimiters: `cases` in a left brace, a matrix in parentheses or brackets, and a
* determinant in bars.
*/
const arrayKinds = {
	"\\{.": "cases",
	"\\lbrace.": "cases",
	"()": "matrix",
	"[]": "matrix",
	"\\lbrack\\rbrack": "matrix",
	"||": "determinant",
	"\\vert\\vert": "determinant"
};
/**
* The rows of an array, with `&` between the cells. `aligned` and `align` hold statements, and other arrays hold
* cells. The kind of an array in delimiters is set by the caller.
*/
function rowsOf(node, context) {
	return {
		type: "rows",
		name: node.colSeparationType === "align" || node.colSeparationType === "alignat" ? "aligned" : "array",
		rows: (node.body ?? []).map((row) => row.flatMap((cell, column) => [...column > 0 ? [{
			type: "symbol",
			value: "&"
		}] : [], ...normalize([cell], context)]))
	};
}
/** Spacing that groups the digits of one number, as `1\,000`. Wider spacing, as `\quad`, separates two numbers. */
const thinSpaces = /* @__PURE__ */ new Set([
	"\\,",
	"\\!",
	"\\thinspace"
]);
function normalize(nodes, context) {
	const result = [];
	let gap = false;
	/**
	* Joins a digit node to the number before it, so `9` and `0^\circ` become `90^\circ`. `join` is false when the source
	* separates the digits, as `2 3` or `2 \quad 3`. KaTeX drops that space, so the reader checks the source.
	*/
	function pushDigits(digits, scripts, join = true) {
		let value = digits;
		for (let previous = join ? result.at(-1) : void 0; previous?.type === "symbol" && /^[\d.]+$/.test(previous.value); previous = result.at(-1)) {
			value = previous.value + value;
			result.pop();
		}
		result.push(scripts ? {
			type: "scripts",
			base: {
				type: "symbol",
				value
			},
			...scripts
		} : {
			type: "symbol",
			value
		});
	}
	/**
	* Normalizes an argument or a script. KaTeX wraps each one in a group for layout, but the reader needs the tokens,
	* for example `i`, `=`, and `1` of `\sum_{i=1}`.
	*/
	function argument(node) {
		if (!node) return [];
		return fence(normalize(node.type === "ordgroup" ? asList(node.body) : [node], context));
	}
	for (let index = 0; index < nodes.length; index++) {
		const node = nodes[index];
		switch (node.type) {
			case "mathord":
			case "textord": {
				const value = node.text ?? "";
				const previous = result.at(-1);
				const afterNumber = previous?.type === "symbol" && /^\d[\d.]*$/.test(previous.value);
				if (digit.test(value) || value === "." && afterNumber && digit.test(nodes[index + 1]?.text ?? "")) {
					pushDigits(value, void 0, !(gap || (node.loc ? /\s/.test(context.source[node.loc.start - 1] ?? "") : false)));
					gap = false;
					break;
				}
				if (value === notMark && nodes[index + 1]?.type === "atom") {
					const relation = nodes[index + 1].text ?? "";
					result.push({
						type: "symbol",
						value: negations[relation] ?? relation
					});
					index++;
					break;
				}
				result.push({
					type: "symbol",
					value: value === "\\@cdots" ? "\\cdots" : escapedSpecials[value] ?? value
				});
				break;
			}
			case "atom":
				result.push({
					type: "symbol",
					value: node.text === "\\@cdots" ? "\\cdots" : node.text ?? ""
				});
				break;
			case "op":
				if (node.name) result.push({
					type: "symbol",
					value: node.name
				});
				else result.push(...normalize(asList(node.body), context));
				break;
			case "supsub": {
				const sub = node.sub ? argument(node.sub) : void 0;
				const sup = node.sup ? argument(node.sup) : void 0;
				const base = argument(node.base);
				const scripts = {
					...sub?.length ? { sub } : {},
					...sup?.length ? { sup } : {}
				};
				if (base.length === 1 && base[0].type === "symbol" && /^\d+$/.test(base[0].value)) {
					pushDigits(base[0].value, scripts);
					break;
				}
				if (base.length === 1 && base[0].type === "fence") {
					result.push({
						...base[0],
						...scripts
					});
					break;
				}
				const only = base.length === 1 ? base[0] : base.length === 0 ? {
					type: "symbol",
					value: ""
				} : {
					type: "group",
					children: base
				};
				result.push({
					type: "scripts",
					base: only,
					...scripts
				});
				break;
			}
			case "genfrac":
				result.push({
					type: "command",
					name: node.hasBarLine ? "frac" : "binom",
					args: [argument(node.numer), argument(node.denom)]
				});
				break;
			case "sqrt":
				result.push({
					type: "command",
					name: "sqrt",
					args: [argument(node.body)],
					...node.index ? { option: argument(node.index) } : {}
				});
				break;
			case "ordgroup": {
				const children = normalize(asList(node.body), context);
				if (children.length === 1 && children[0].type === "symbol" && children[0].value === ":") result.push(children[0]);
				else result.push({
					type: "group",
					children
				});
				break;
			}
			case "leftright": {
				const [only] = asList(node.body);
				const kind = asList(node.body).length === 1 && only?.type === "array" ? arrayKinds[`${node.left}${node.right}`] : void 0;
				if (kind) {
					result.push({
						...rowsOf(only, context),
						name: kind
					});
					break;
				}
				if (node.left && node.left !== ".") result.push({
					type: "symbol",
					value: node.left
				});
				result.push(...normalize(asList(node.body), context));
				if (node.right && node.right !== ".") result.push({
					type: "symbol",
					value: node.right
				});
				break;
			}
			case "font": {
				const font = node.font ?? "";
				if (commandFonts.has(font)) result.push({
					type: "command",
					name: font,
					args: [argument(node.body)]
				});
				else if (textFonts.has(font)) result.push({
					type: "text",
					name: font,
					value: plainText(asList(node.body))
				});
				else result.push(...normalize(asList(node.body), context));
				break;
			}
			case "text": {
				const value = plainText(asList(node.body));
				if (value.startsWith(rawMarker)) {
					const lifted = context.raw[Number(value.slice(7))];
					result.push({
						type: "raw",
						command: lifted?.command ?? "",
						value: lifted?.value ?? ""
					});
					break;
				}
				result.push({
					type: "text",
					name: "text",
					value
				});
				break;
			}
			case "operatorname":
				result.push({
					type: "text",
					name: "operatorname",
					value: plainText(asList(node.body))
				});
				break;
			case "accent":
				result.push({
					type: "command",
					name: (node.label ?? "").replace(/^\\/, ""),
					args: [argument(node.base)]
				});
				break;
			case "overline":
			case "underline":
				result.push({
					type: "command",
					name: node.type,
					args: [argument(node.body)]
				});
				break;
			case "mclass": {
				const inner = asList(node.body);
				const scripts = inner.length === 1 && inner[0].type === "supsub" ? inner[0] : void 0;
				if (scripts?.base?.type === "op" && scripts.sup) {
					result.push({
						type: "command",
						name: "overset",
						args: [argument(scripts.sup), fence(normalize(asList(scripts.base.body), context))]
					});
					break;
				}
				result.push(...normalize(inner, context));
				break;
			}
			case "htmlmathml": {
				const mathml = node.mathml ?? [];
				const next = nodes[index + 1];
				if (mathml.length === 1 && mathml[0].text === notMark && next?.type === "atom") {
					result.push({
						type: "symbol",
						value: negations[next.text ?? ""] ?? next.text ?? ""
					});
					index++;
					break;
				}
				result.push(...normalize(mathml, context));
				break;
			}
			case "xArrow":
				result.push({
					type: "command",
					name: "xarrow",
					args: [
						[{
							type: "symbol",
							value: node.label ?? ""
						}],
						argument(node.body),
						argument(node.below)
					]
				});
				break;
			case "array":
				result.push(rowsOf(node, context));
				break;
			default:
				if (silent.has(node.type)) {
					if (node.type === "kern" || node.type === "spacing" && !thinSpaces.has(node.text ?? "")) gap = true;
					break;
				}
				if (transparent.has(node.type) || node.body !== void 0) result.push(...normalize(asList(node.body), context));
		}
	}
	return result;
}
/**
* Scientific notation as code writes it, `1e-3` or `2.5e10`, with nothing between the parts. `2e - 1` has spaces, and
* it is 2e minus 1 with Euler's number. KaTeX drops the spaces, so the rule reads the source.
*/
const scientific = /(?<![\w\\.^])(\d+(?:\.\d+)?)e([+-]?\d+)(?![\w.])/g;
/**
* Digits grouped by commas: `1,000,000` with two groups or more, or `1{,}000` with the brace that TeX needs. One plain
* comma group, as in `[1,100]`, is a list of two numbers.
*/
const groupedDigits = /(?<![\d.])([1-9]\d{0,2})((?:,\d{3}){2,})(?![\d.])/g;
const bracedGroups = /(\d)\{,\}(?=\d{3}(?!\d))/g;
/** Rewrites the numbers that TeX cannot tell apart from other notation by tokens alone, see {@link scientific}. */
function rewriteNumbers(source) {
	return source.replace(scientific, (_, mantissa, exponent) => `${mantissa}\\times 10^{${exponent}}`).replace(groupedDigits, (_, head, groups) => head + groups.replaceAll(",", "")).replace(bracedGroups, "$1");
}
/**
* Parses TeX math source into the syntax tree of the reader, with KaTeX.
*
* The parse is total. Unbalanced braces are balanced first. A formula that KaTeX still cannot parse becomes one text
* node with its source, so the speech keeps the writer's words instead of failing.
*
* `rawCommands` are the commands that extensions read from their source, as `ce` and `pu` of chemistry. They become
* `raw` nodes with their source, see ./extension.
*/
function parseMath(source, rawCommands = []) {
	const lifted = liftRaw(rewriteNumbers(balanceBraces(source)), rawCommands);
	let nodes;
	try {
		nodes = katexParse(lifted.source, {
			throwOnError: false,
			strict: false
		});
	} catch {
		return [{
			type: "text",
			name: "text",
			value: source.replace(/\\([a-z]+)/gi, "$1").replace(/[{}\\]/g, " ").replace(/\s+/g, " ").trim()
		}];
	}
	return fence(normalize(nodes, {
		raw: lifted.raw,
		source: lifted.source
	}));
}
//#endregion
//#region src/units.ts
/**
* Reads unit symbols with the SI rules of the SI brochure and NIST SP 811.
*
* A symbol is a prefix and a unit, for example `µm` is micro and meter. A locale pack names each prefix and unit once,
* and this module composes them, so a unit gets every prefix without one entry for each pair.
*/
/** `da` is the only prefix of two letters, so a symbol tries it before the prefixes of one letter. */
const prefixLengths = [2, 1];
/**
* Units that take only some prefixes. Without the limit, `ft` reads as femtotonnes and `pt` as picotonnes, and `dB`
* would be decibytes if decibel had no entry.
*/
const prefixLimits = {
	t: /* @__PURE__ */ new Set([
		"k",
		"M",
		"G"
	]),
	B: /* @__PURE__ */ new Set([
		"k",
		"M",
		"G",
		"T",
		"P",
		"E"
	])
};
/** Finds the words of a unit symbol without its power: an override or a whole unit first, then a prefix and a unit. */
function unitWords(symbol, locale) {
	const exact = locale.overrides?.[symbol] ?? locale.plain[symbol] ?? locale.units[symbol];
	if (exact !== void 0) return exact;
	for (const length of prefixLengths) {
		const prefix = locale.prefixes[symbol.slice(0, length)];
		const unit = locale.units[symbol.slice(length)];
		const limit = prefixLimits[symbol.slice(length)];
		if (prefix && unit && (!limit || limit.has(symbol.slice(0, length)))) return prefix + unit;
	}
}
/**
* Reads a unit symbol, for example `km`, `µs`, `MHz`, `cm^2`, or `m3`. Returns undefined for text that is not a unit.
* `µ`, `μ`, `\mu`, and a leading `u` all write micro.
*
* @example
* speakUnit('µm', en.units)
* // => 'micrometers'
* speakUnit('cm^2', zh.units)
* // => '平方厘米'
*/
function speakUnit(symbol, locale) {
	if (symbol.includes(" ")) {
		const words = symbol.split(/\s+/).filter(Boolean).map((factor) => speakUnit(factor, locale));
		if (words.includes(void 0)) return void 0;
		const spoken = words.map((word, index) => index < words.length - 1 ? locale.singular?.(word) ?? word : word);
		return locale.joinFactors?.(spoken) ?? spoken.join(" ");
	}
	const normalized = symbol.replace(/\\mu\s*|μ|^u(?=[a-z])/gi, "µ").replace(/\\Omega/g, "Ω").replace(/\\AA/g, "Å").trim();
	const power = /^(.+?)\^?([23])$/.exec(normalized);
	const words = unitWords(power ? power[1] : normalized, locale);
	if (words === void 0 || !power) return words;
	return locale.power(words, power[2]);
}
//#endregion
//#region src/render.ts
const relationKeys = Object.fromEntries(Object.entries(relationHeads).map(([key, head]) => [head, key]));
const operatorKeys = Object.fromEntries(Object.entries(operatorHeads).map(([key, head]) => [head, key]));
const unarySigns = {
	Negate: "-",
	Positive: "+",
	PlusMinus: "\\pm",
	MinusPlus: "\\mp"
};
const infinities = /* @__PURE__ */ new Set(["\\infty", "∞"]);
const latinLetter = /^[a-z]$/i;
/** A Greek letter command, for example `\omega` or `\Omega`. Its lowercase name is the key of its case pair. */
const greekCommand = /^\\([a-z]+)$/i;
/** The names of Greek letters. A subscript number under them reads without a subscript word, as `\\theta_0`. */
const greekLetters = new Set(greekNames);
const binaryHeads = new Set(Object.values(operatorHeads));
const bigOperatorKinds = {
	Sum: "sum",
	Product: "prod",
	Integrate: "int",
	BigUnion: "union",
	BigIntersection: "intersection"
};
const ellipses = /* @__PURE__ */ new Set([
	"\\cdots",
	"\\ldots",
	"\\dots",
	"…"
]);
/** The case-pair key of a letter: `n` for `n` and `N`, `omega` for `\omega` and `\Omega`. Other symbols have none. */
function caseKey(value) {
	if (latinLetter.test(value)) return value.toLowerCase();
	const greek = greekCommand.exec(value);
	return greek ? greek[1].toLowerCase() : void 0;
}
function isUpperCase(value) {
	const letter = value.startsWith("\\") ? value[1] : value;
	return letter !== letter.toLowerCase();
}
/** Every symbol of an expression, also the letters of a name. */
function symbolsOf(expression) {
	if (isSymbol(expression)) return [expression];
	if (!isFunction(expression)) return [];
	return argsOf(expression).flatMap(symbolsOf);
}
/** The letters that an expression uses in both cases, for example `n` in `N = n + 1`. Speech has no case, so only these say it. */
function mixedCaseKeys(expression) {
	const seen = /* @__PURE__ */ new Map();
	for (const value of symbolsOf(expression)) {
		const key = caseKey(value);
		if (key !== void 0) seen.set(key, (seen.get(key) ?? /* @__PURE__ */ new Set()).add(isUpperCase(value)));
	}
	return new Set([...seen].filter(([, cases]) => cases.size === 2).map(([key]) => key));
}
function contains(expression, test) {
	return test(expression) || isFunction(expression) && argsOf(expression).some((argument) => contains(argument, test));
}
/** True when an expression has a binary operator at any depth, as the sum in `n(n+1)`. */
function hasOperator(expression) {
	return contains(expression, (value) => binaryHeads.has(headOf(value) ?? "") && argsOf(value).length >= 2);
}
/** How hard a part of a fraction is to hear, see {@link FractionPart}. */
function fractionPart(expression) {
	const head = headOf(expression);
	if (head === void 0) return "simple";
	if (binaryHeads.has(head) && argsOf(expression).length >= 2 || relationKeys[head] !== void 0 || head === "Divide" || head === "Clauses") return "compound";
	if (head === "Negate" || head === "Positive") return fractionPart(argsOf(expression)[0] ?? nothing);
	if ((head === "Group" || head === "Delimiter") && hasOperator(expression)) return "compound";
	if (head === "Power" || head === "Subscript" || head === "Degrees" || head === "Prime" || head === "Complement") return "scripted";
	if (head === "InvisibleOperator") {
		const parts = argsOf(expression).map(fractionPart);
		if (parts.includes("compound")) return "compound";
		return parts.includes("scripted") ? "scripted" : "simple";
	}
	return "simple";
}
/** Splits `b (mod n)` into `b` and `n`, or returns undefined when the expression does not end with a modulus. */
function trailingModulus(value) {
	if (headOf(value) === "Modulo") return {
		rest: nothing,
		modulus: argsOf(value)[0] ?? nothing
	};
	if (headOf(value) !== "InvisibleOperator") return void 0;
	const args = argsOf(value);
	const last = args.at(-1);
	if (headOf(last) !== "Modulo") return void 0;
	const rest = args.slice(0, -1);
	return {
		rest: rest.length === 1 ? rest[0] : ["InvisibleOperator", ...rest],
		modulus: argsOf(last)[0] ?? nothing
	};
}
/**
* Reads lowered MathJSON aloud with one locale pack.
*
* It decides only the words: each head maps to an entry of the pack. What the notation means was decided by
* lowering, see ./lower.
*
* `handlers` read the heads of extensions, for example `Chemistry`. A handler wins over a built-in head.
*/
function renderMath(expression, lexicon, handlers = {}) {
	const mixedCase = mixedCaseKeys(expression);
	function word(value) {
		const known = lexicon.words[value];
		if (known === void 0 && operatorHeads[value] !== void 0) return lexicon.operators[value] ?? value;
		let spoken;
		if (known !== void 0) spoken = known;
		else if (latinLetter.test(value)) spoken = lexicon.letter(value);
		else spoken = value.startsWith("\\") ? value.slice(1) : value;
		const key = caseKey(value);
		if (key === void 0) return spoken;
		return mixedCase.has(key) ? lexicon.letterCase(spoken, isUpperCase(value)) : spoken;
	}
	/** Reads text, with any TeX command inside it as a word. */
	function plain(value) {
		return value.replace(/\\[a-z]+/gi, (match) => word(match)).replace(/[{}\\]/g, "").trim();
	}
	function optional(value) {
		return value === void 0 || value === nothing ? void 0 : render(value);
	}
	/** Reads a condition list, as in `t \sim U, x \sim p`, with the list joiner, even when its items are clauses. */
	function renderList(value) {
		const head = headOf(value);
		return head === "Clauses" || head === "Sequence" ? lexicon.list(argsOf(value).map((item) => render(item))) : render(value);
	}
	/**
	* Reads a group of two simple terms with the words of the pack, for example a 与 b 的和, or returns undefined. A
	* compound term inside, as in `(a+b+c)`, keeps the brackets: a 与 b 的和与 c 的和 is harder to hear than brackets.
	*/
	function groupWords(inner) {
		const head = headOf(inner);
		const words = head === "Add" ? lexicon.groupOf?.sum : head === "Subtract" ? lexicon.groupOf?.difference : void 0;
		const [left = nothing, right = nothing] = argsOf(inner);
		const compound = (term) => fractionPart(term) === "compound" && headOf(term) !== "Divide";
		if (!words || argsOf(inner).length !== 2 || compound(left) || compound(right)) return void 0;
		return words(render(left), render(right));
	}
	/** `\\|\\cdot\\|` names the norm itself, so its empty slot is not read: "the norm", not "the norm of dot". */
	function normArgument(inner) {
		if (headOf(inner) === "Subtract" && argsOf(inner).length === 2 && lexicon.normDifference) return lexicon.normDifference(render(argsOf(inner)[0]), render(argsOf(inner)[1], true));
		return headOf(inner) === "Placeholder" ? "" : render(inner);
	}
	/** Reads the items of a list or a tuple. `k = 1, \dots, d` ends at d: "one, and so on, up to d". */
	function renderItems(items) {
		const ellipsisBeforeLast = items.length >= 3 && ellipses.has(String(items.at(-2)));
		if (ellipsisBeforeLast && lexicon.range) return [...items.slice(0, -3).map((item) => render(item)), lexicon.range(render(items.at(-3)), render(items.at(-1)))];
		return items.map((item, position) => ellipsisBeforeLast && position === items.length - 1 ? lexicon.upTo(render(item)) : render(item));
	}
	/** `afterOperator` is true when an operator comes right before the expression, so a fraction can name its parts. */
	function render(value, afterOperator = false) {
		if (isNumber(value)) return lexicon.number(value.num);
		if (value === nothing) return "";
		if (isText(value)) return plain(textOf(value));
		if (typeof value === "string") return word(value);
		const [head, ...args] = value;
		const [first = nothing, second = nothing, third = nothing] = args;
		const handler = handlers[head];
		if (handler) return handler(value, {
			lexicon,
			render: (argument) => render(argument)
		});
		const relation = relationKeys[head];
		if (relation !== void 0 && lexicon.chain && relationKeys[headOf(first) ?? ""] !== void 0) {
			const operands = [];
			const relations = [];
			let link = value;
			while (relationKeys[headOf(link) ?? ""] !== void 0) {
				const [left = nothing, right = nothing] = argsOf(link);
				operands.unshift(right);
				relations.unshift(relationKeys[headOf(link)]);
				link = left;
			}
			operands.unshift(link);
			return lexicon.chain(operands.map((operand) => ellipses.has(String(operand)) ? void 0 : render(operand)), relations.map((key) => lexicon.relations[key])).trim();
		}
		const modulus = head === "Equivalent" ? trailingModulus(second) : void 0;
		if (modulus !== void 0) return lexicon.congruent(render(first), render(modulus.rest), render(modulus.modulus)).trim();
		if (relation !== void 0) return lexicon.relations[relation](render(first), render(second)).trim();
		const unary = unarySigns[head];
		if (unary !== void 0 && args.length === 1) {
			const sign = unary === "-" ? lexicon.negative : unary === "+" ? lexicon.positive : lexicon.operators[unary];
			return lexicon.join([sign, render(first, true)]);
		}
		if (unary !== void 0 && args.length === 0) return unary === "-" ? lexicon.negative : unary === "+" ? lexicon.positive : lexicon.operators[unary];
		const operator = operatorKeys[head];
		if (operator !== void 0 && args.length === 2) return lexicon.join([
			render(first),
			lexicon.operators[operator],
			render(second, true)
		]);
		switch (head) {
			case "Clauses": return lexicon.clauses(args.map((argument) => render(argument)));
			case "Mapping": return lexicon.mapping(render(first), render(second), render(third));
			case "InvisibleOperator": {
				const parts = args.map((argument) => render(argument));
				const isGroup = (value) => headOf(value) === "Group";
				const wordGroup = (value) => isGroup(value) && lexicon.groupOf !== void 0 && groupWords(argsOf(value)[0] ?? nothing) !== void 0;
				return lexicon.join(parts.flatMap((part, position) => {
					if (position === 0) return [part];
					const previous = args[position - 1];
					if (headOf(args[position]) === "Unit" && isNumber(previous) && previous.num === "1" && lexicon.units.singular) return [lexicon.units.singular(part)];
					return isGroup(previous) || headOf(previous) === "Divide" || wordGroup(args[position]) ? [lexicon.groupTimes ?? lexicon.operators["\\times"], part] : [part];
				}));
			}
			case "Name": return lexicon.join(args.map((argument) => render(argument)));
			case "Rows": return lexicon.clauses(args.map((argument) => render(argument)));
			case "Cases": return lexicon.cases(args.map((item) => {
				const [value = nothing, condition] = argsOf(item);
				return {
					value: render(value),
					condition: condition === void 0 ? void 0 : render(condition)
				};
			}));
			case "Matrix":
			case "Determinant": return lexicon.matrix(args.map((row) => argsOf(row).map((cell) => render(cell))), head === "Determinant");
			case "Sequence": return lexicon.list(renderItems(args));
			case "Apply": {
				const callArgs = args.slice(1);
				const grouped = callArgs.length > 1 || callArgs.length === 1 && fractionPart(callArgs[0]) === "compound";
				const decorated = headOf(first) === "Accent" || headOf(first) === "Name" || headOf(first) === "NumberSet" || headOf(first) === "Subscript" || headOf(first) === "Inverse";
				return lexicon.apply(render(first), callArgs.map((argument) => render(argument)), grouped, decorated);
			}
			case "Norm": return lexicon.norm(normArgument(first), optional(args[1]), false);
			case "Expectation":
			case "Probability":
			case "Variance":
			case "Covariance": return lexicon.statistic(head, render(first), args[1] === void 0 ? void 0 : renderList(args[1]));
			case "About": return lexicon.about(render(first));
			case "Distributed": return lexicon.distributed(render(first), render(second));
			case "Arrow": return lexicon.arrow(render(first), render(second));
			case "Ceil": return lexicon.ceil(render(first));
			case "Floor": return lexicon.floor(render(first));
			case "Bracket": return lexicon.bracket(render(first));
			case "Placeholder": return lexicon.placeholder;
			case "Superscript": {
				if (typeof second === "string" && lexicon.marks[second] !== void 0) return lexicon.join([render(first), lexicon.marks[second]]);
				const parenthesized = headOf(second) === "Delimiter";
				return lexicon.superscript(render(first), render(parenthesized ? argsOf(second)[0] ?? nothing : second), parenthesized);
			}
			case "Text": return plain(textOf(first));
			case "Unit": {
				const numerator = textOf(first);
				if (second === nothing) return speakUnit(numerator, lexicon.units) ?? plain(numerator);
				const top = numerator ? speakUnit(numerator, lexicon.units) : "";
				const units = lexicon.units;
				const bottomWords = textOf(second).split(" ").map((symbol) => units.denominators?.[symbol] ?? speakUnit(symbol, units));
				const bottom = bottomWords.every((word) => word !== void 0) ? (units.joinFactors ?? ((words) => words.join(" ")))(bottomWords.map((word) => units.singular?.(word) ?? word)) : void 0;
				if (top !== void 0 && bottom) return lexicon.unitRatio(top, bottom, isNumber(third) ? third.num : void 0).trim();
				return plain(`${numerator}/${textOf(second)}${isNumber(third) ? `^${third.num}` : ""}`);
			}
			case "Celsius": return lexicon.celsius(render(first));
			case "Raw": return plain(textOf(second));
			case "Divide": {
				const numericDenominator = isNumber(second);
				const shape = {
					numerator: fractionPart(first),
					denominator: fractionPart(second),
					followsOperator: afterOperator && !numericDenominator
				};
				return lexicon.fraction(render(first), render(second), shape);
			}
			case "D": return lexicon.derivative(render(second), render(first), isNumber(third) ? third.num : void 0);
			case "Binomial": return lexicon.binomial(render(first), render(second));
			case "Ordinal": return lexicon.ordinal(render(first));
			case "Given": return lexicon.given(render(first), render(second));
			case "Modulo": return lexicon.modulo(render(first));
			case "Inverse": return lexicon.inverse(render(first));
			case "Sqrt": return lexicon.root(render(first), void 0, fractionPart(first) === "compound");
			case "Root": return lexicon.root(render(first), render(second));
			case "Power": {
				if (headOf(first) === "Group" && isNumber(second) && second.num === "2" && lexicon.squareOf) return lexicon.squareOf(render(first));
				if (headOf(first) === "Abs" && isNumber(second) && second.num === "2" && lexicon.absoluteSquared) return lexicon.absoluteSquared(render(argsOf(first)[0] ?? nothing));
				if (headOf(first) === "Norm" && isNumber(second) && second.num === "2") {
					const [inner = nothing, index] = argsOf(first);
					return lexicon.norm(normArgument(inner), optional(index), true);
				}
				const base = render(first);
				if (isNumber(second) && second.num === "2") return lexicon.squared(base);
				if (isNumber(second) && second.num === "3") return lexicon.cubed(base);
				return lexicon.power(base, render(second));
			}
			case "Subscript": {
				const base = render(first);
				if (isNumber(second) && isSymbol(first) && (latinLetter.test(first) || greekLetters.has(first.slice(1).toLowerCase()))) return lexicon.numberIndex(base, render(second));
				return isSymbol(second) || isNumber(second) || headOf(second) === "Text" ? lexicon.index(base, render(second)) : lexicon.subscript(base, render(second));
			}
			case "Degrees": return lexicon.degrees(render(first));
			case "Prime": return lexicon.prime(render(first));
			case "Factorial": return lexicon.join([render(first), lexicon.operators["!"]]);
			case "Percent": return lexicon.percent(render(first));
			case "Complement": return lexicon.complement(render(first), optional(args[1]));
			case "PowerSet": return lexicon.powerSet(render(first));
			case "Cardinality": return lexicon.cardinality(render(first));
			case "Abs": return lexicon.absolute(render(first));
			case "Tuple": return lexicon.tuple(renderItems(args));
			case "Set": {
				const condition = headOf(second) === "Condition" ? argsOf(second)[0] : void 0;
				return condition === void 0 ? lexicon.set(render(first)) : lexicon.set(render(first), render(condition));
			}
			case "Interval": {
				const open = (bound) => headOf(bound) === "Open";
				const inner = (bound) => open(bound) ? argsOf(bound)[0] ?? nothing : bound;
				return lexicon.interval(render(inner(first)), render(inner(second)), {
					left: !open(first),
					right: !open(second)
				});
			}
			case "Group": return groupWords(first) ?? lexicon.quantity(render(first));
			case "Delimiter": return render(first);
			case "NumberSet": {
				const letter = isSymbol(first) ? first : void 0;
				return (letter && lexicon.numberSets[letter]) ?? render(first);
			}
			case "Segment": return lexicon.segment(lexicon.join(args.map((argument) => render(argument))));
			case "Arc": return lexicon.accent.overarc(render(first));
			case "Accent": {
				const accent = lexicon.accent[textOf(first)];
				const inner = render(second);
				return accent ? accent(inner) : inner;
			}
			case "Limit": {
				const bounds = second;
				if (headOf(bounds) === "Bounds") {
					const [variable = nothing, target = nothing, side] = argsOf(bounds);
					const direction = isNumber(side) ? side.num === "1" ? "right" : "left" : void 0;
					return lexicon.limit(render(first), render(variable), render(target), void 0, direction);
				}
				if (headOf(bounds) === "Condition") return lexicon.limit(render(first), void 0, void 0, render(argsOf(bounds)[0] ?? nothing));
				return lexicon.limit(render(first));
			}
			case "Sum":
			case "Product":
			case "Integrate":
			case "BigUnion":
			case "BigIntersection": {
				const kind = bigOperatorKinds[head];
				const bounds = second;
				const body = render(first);
				if (headOf(bounds) === "Bounds") {
					const [variable = nothing, from = nothing, to = nothing] = argsOf(bounds);
					const improper = kind === "int" && (contains(from, (item) => isSymbol(item) && infinities.has(item)) || contains(to, (item) => isSymbol(item) && infinities.has(item)));
					return lexicon.bigOperator(kind, body, {
						variable: optional(variable),
						from: optional(from),
						to: optional(to),
						improper
					});
				}
				if (headOf(bounds) === "Condition") {
					const [condition, to] = argsOf(bounds);
					return lexicon.bigOperator(kind, body, {
						condition: optional(condition),
						to: optional(to)
					});
				}
				return lexicon.bigOperator(kind, body, {});
			}
			default: return lexicon.join(args.map((argument) => render(argument)));
		}
	}
	return render(expression).replace(/\s+/g, " ").trim();
}
//#endregion
//#region src/speech.ts
/** The built-in locale packs: Chinese, English, Japanese, and Korean. */
const builtinLocales = [
	en,
	ja,
	ko,
	zh
];
/**
* The primary language subtag of a BCP 47 code: `zh` for `zh-CN`, `ko` for `ko_KR`. Chinese dialect codes are `zh`,
* because the readers have one Chinese pack.
*/
function primaryLanguage(code) {
	const primary = code.toLowerCase().split(/[-_]/)[0] ?? "";
	return primary === "cmn" || primary === "yue" ? "zh" : primary;
}
/**
* Reads TeX formulas as words, with a set of locale packs and extensions.
*
* Each instance owns its packs, so two projects, or two tests, can read differently in one process.
*
* Call stack of {@link MathSpeech.speak}:
*
* speak
*   -> {@link parseMath} (./parse): KaTeX parse tree to the syntax tree
*     -> {@link lowerMath} (./lower): syntax tree to MathJSON, the rules of meaning
*       -> extension `lower`: the source of raw commands, for example `\ce{}`, to MathJSON
*         -> {@link renderMath} (./render): MathJSON to the words of the language
*
* @example
* const speech = new MathSpeech()
* speech.speak('x^2', 'en')
* // => 'x squared'
*/
var MathSpeech = class {
	locales = /* @__PURE__ */ new Map();
	extensions;
	/** The TeX commands, without the backslash, whose source the extensions read, for example `ce`. */
	rawCommands;
	handlers;
	fallbackLanguage;
	constructor(options = {}) {
		for (const locale of options.locales ?? builtinLocales) this.locales.set(locale.language, locale);
		this.extensions = options.extensions ?? [];
		const commands = /* @__PURE__ */ new Map();
		const handlers = {};
		const owners = /* @__PURE__ */ new Map();
		for (const extension of this.extensions) {
			for (const command of extension.rawCommands ?? []) {
				const owner = commands.get(command);
				if (owner !== void 0) throw new Error(`Extensions ${owner} and ${extension.name} both read \\${command}.`);
				commands.set(command, extension.name);
			}
			for (const [head, handler] of Object.entries(extension.render ?? {})) {
				const owner = owners.get(head);
				if (owner !== void 0) throw new Error(`Extensions ${owner} and ${extension.name} both read the head ${head}.`);
				owners.set(head, extension.name);
				handlers[head] = handler;
			}
		}
		this.rawCommands = [...commands.keys()];
		this.handlers = handlers;
		this.fallbackLanguage = options.fallbackLanguage ?? "en";
	}
	/** Adds a locale pack, or replaces the pack of its language. Returns a function that restores the earlier pack. */
	register(locale) {
		const previous = this.locales.get(locale.language);
		this.locales.set(locale.language, locale);
		return () => {
			if (previous) this.locales.set(locale.language, previous);
			else this.locales.delete(locale.language);
		};
	}
	/** Finds the pack of a BCP 47 code, or undefined when no pack reads it. */
	findLocale(code) {
		return code === void 0 ? void 0 : this.locales.get(primaryLanguage(code));
	}
	/** Finds the pack of a BCP 47 code, or the fallback pack. */
	locale(code) {
		const locale = this.findLocale(code) ?? this.locales.get(this.fallbackLanguage);
		if (!locale) throw new Error(`No locale pack reads ${code ?? "an unknown language"}, and the fallback ${this.fallbackLanguage} has no pack.`);
		return locale;
	}
	/**
	* Lowers TeX math source into MathJSON, without reading it.
	* Tools that inspect the meaning of a formula use it, for example a comparison with Compute Engine.
	*/
	toMathJson(tex) {
		return this.lowerRaw(lowerMath(parseMath(tex, this.rawCommands)));
	}
	/** Reads TeX math source as words of one language. A language without a pack is read by the fallback pack. */
	speak(tex, language) {
		return renderMath(this.toMathJson(tex), this.locale(language), this.handlers);
	}
	/** Replaces each `Raw` node with the MathJSON of the extension that owns its command. */
	lowerRaw(expression) {
		if (!isFunction(expression)) return expression;
		if (headOf(expression) === "Raw") {
			const [command, source] = argsOf(expression).map(textOf);
			return this.extensions.find((item) => item.lower && item.rawCommands?.includes(command))?.lower?.(command, source) ?? expression;
		}
		return [expression[0], ...argsOf(expression).map((argument) => this.lowerRaw(argument))];
	}
};
//#endregion
export { MathSpeech, aliases, builtinLocales, canonicalSymbol, en, greek, greekNames, ja, joinCompact, joinSpaced, josa, ko, letterName, lowerMath, operatorHeads, parseMath, primaryLanguage, rawHead, relationHeads, renderMath, speakUnit, spellNumber, symbolAliases, texCommands, unitPower, zh };
