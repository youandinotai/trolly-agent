import { argsOf, headOf, isFunction, isNumber, nothing, text, textOf } from "@proj-airi/mathjson";
import { josa, parseMath, spellNumber } from "@proj-airi/speech-transformer-math";
import { mhchemParser } from "mhchemparser";
//#region src/chem.ts
/** The mhchem arrows that mhchemParser writes, mapped to the three readings that the lexicons have. */
const arrows = {
	"\\longrightarrow": "->",
	"\\rightarrow": "->",
	"\\xrightarrow": "->",
	"\\longleftarrow": "<-",
	"\\xleftarrow": "<-",
	"\\longrightleftharpoons": "<=>",
	"\\xrightleftharpoons": "<=>",
	"\\rightleftharpoons": "<=>",
	"\\longleftrightarrow": "<=>",
	"\\xleftrightarrow": "<=>",
	"\\longLeftrightharpoons": "<=>",
	"\\longRightleftharpoons": "<=>"
};
const gasMarks = /* @__PURE__ */ new Set(["\\uparrow", "↑"]);
const precipitateMarks = /* @__PURE__ */ new Set(["\\downarrow", "↓"]);
const states = /* @__PURE__ */ new Set([
	"s",
	"l",
	"g",
	"aq"
]);
const heat = /* @__PURE__ */ new Set(["\\Delta", "Δ"]);
/** Reads the characters of a script, for example `2` of `_{2}` or `3+` of `^{3+}`. */
function scriptText(nodes) {
	return (nodes ?? []).map((node) => node.type === "symbol" ? node.value : node.type === "group" ? scriptText(node.children) : "").join("");
}
/** Rebuilds the formula of tokens, for example `(OH)2` from a fence of `\mathrm{OH}` and its count. */
function formulaText(nodes) {
	return nodes.map((node) => {
		if (node.type === "text") return node.value;
		if (node.type === "fence") return `(${formulaText(node.children)})${scriptText(node.sub)}`;
		if (node.type === "scripts") return scriptText(node.sub);
		return "";
	}).join("");
}
function species(draft) {
	const formula = draft.charge ? `${draft.core}^${draft.charge}` : draft.core;
	return [
		"Species",
		text(formula),
		draft.coefficient ? { num: draft.coefficient } : nothing,
		draft.state ? text(draft.state) : nothing
	];
}
/**
* Lowers the content of `\ce{}` or `\pu{}` into a `Chemistry` expression.
*
* mhchemParser turns the mhchem source into TeX, and KaTeX parses that TeX, so this module only rebuilds species from
* the tokens. The shape is:
*
* - `["Chemistry", ["Reaction", arrow, ["Side", ...terms], ["Side", ...terms], condition]]` for an equation.
* - `["Chemistry", ["Side", ...terms]]` for formulas alone.
* - A term is `["Species", formula, coefficient, state]`, or `["Hydrate", ...species]`, wrapped in `Gas` or
*   `Precipitate` when mhchem marks it.
*/
function lowerChemistry(source) {
	let tex;
	try {
		tex = mhchemParser.toTex(source, "ce");
	} catch {
		return ["Chemistry", ["Side", ["Text", text(source)]]];
	}
	const tokens = parseMath(tex).flatMap((node) => node.type === "group" ? node.children : [node]);
	const sides = [[]];
	let arrow;
	let condition = nothing;
	let hydrate = [];
	let draft;
	let coefficient;
	const endSpecies = () => {
		if (draft) hydrate.push(species(draft));
		draft = void 0;
	};
	const endTerm = () => {
		endSpecies();
		if (hydrate.length === 1) sides.at(-1).push(hydrate[0]);
		else if (hydrate.length > 1) sides.at(-1).push(["Hydrate", ...hydrate]);
		hydrate = [];
	};
	const mark = (head) => {
		endTerm();
		const side = sides.at(-1);
		if (side.length > 0) side.push([head, side.pop()]);
	};
	const arrowOf = (token) => {
		if (token.type === "symbol" || token.type === "text") return token.value.trim();
		const label = token.type === "command" && token.name === "xarrow" ? token.args[0]?.[0] : void 0;
		return label?.type === "symbol" ? label.value : void 0;
	};
	for (const token of tokens) {
		if (token.type === "group" && token.children.length === 0) continue;
		const arrowName = arrowOf(token);
		if (arrowName !== void 0 && arrows[arrowName] !== void 0) {
			endTerm();
			arrow = arrows[arrowName];
			if (token.type === "command") {
				const label = token.args[1] ?? [];
				const only = label.length === 1 ? label[0] : void 0;
				const labelText = only?.type === "text" || only?.type === "symbol" ? only.value.trim() : void 0;
				if (labelText !== void 0 && heat.has(labelText)) condition = ["Heat"];
				else if (label.length > 0) condition = ["Text", text(formulaText(label) || scriptText(label))];
			}
			sides.push([]);
			continue;
		}
		if (token.type === "symbol" && token.value === "+") {
			endTerm();
			continue;
		}
		if (token.type === "symbol" && gasMarks.has(token.value)) {
			mark("Gas");
			continue;
		}
		if (token.type === "symbol" && precipitateMarks.has(token.value)) {
			mark("Precipitate");
			continue;
		}
		if (token.type === "group" && token.children.some((child) => child.type === "symbol" && child.value === "\\cdot")) {
			endSpecies();
			continue;
		}
		if (token.type === "symbol" && /^\d+(?:\/\d+)?$/.test(token.value) && !draft) {
			coefficient = token.value;
			continue;
		}
		const only = token.type === "fence" && token.children.length === 1 ? token.children[0] : void 0;
		if (draft && only?.type === "text" && states.has(only.value)) {
			draft.state = only.value;
			continue;
		}
		if (token.type === "scripts" && draft) {
			if (token.sub?.length) draft.core += scriptText(token.sub);
			if (token.sup?.length) draft.charge = scriptText(token.sup);
			continue;
		}
		if (token.type === "text" || token.type === "fence") {
			draft ??= {
				core: "",
				coefficient
			};
			coefficient = void 0;
			draft.core += formulaText([token]);
		}
	}
	endTerm();
	if (arrow === void 0) return ["Chemistry", ["Side", ...sides[0]]];
	return ["Chemistry", [
		"Reaction",
		text(arrow),
		["Side", ...sides[0]],
		["Side", ...sides[1] ?? []],
		condition
	]];
}
/**
* Reads a formula symbol by symbol: each element by its letters, each count as a number, and the parentheses of a
* group as words, for example `Ca(OH)2` as "C A open parenthesis O H close parenthesis two".
*/
function spellFormula(core, lexicon, chem) {
	const words = [];
	for (const match of core.matchAll(/([A-Z][a-z]?)(\d*)|\((?=[A-Z])|\)(\d*)/g)) {
		const [token, element, count, groupCount] = match;
		if (element !== void 0) {
			words.push(...[...element].map((letter) => lexicon.letter(letter.toUpperCase())));
			if (count) words.push(lexicon.number(count));
		} else if (token === "(") words.push(chem.open);
		else {
			words.push(chem.close);
			if (groupCount) words.push(lexicon.number(groupCount));
		}
	}
	return words.join(" ");
}
function chemSpecies(expression) {
	const [formula = nothing, coefficient = nothing, state = nothing] = argsOf(expression);
	const source = textOf(formula);
	const [core = "", charge] = source.split("^");
	return {
		formula: source,
		core,
		charge,
		coefficient: isNumber(coefficient) ? coefficient.num : void 0,
		state: textOf(state) || void 0
	};
}
/**
* Reads a `Chemistry` expression.
*
* A formula alone keeps its symbols, because the text around it usually names it already, as in "the formula of
* sulfuric acid is H2SO4". An equation reads each species by its name when the lexicon has one, and adds the
* coefficient 1 where the language reads it.
*/
function speakChemistry(expression, lexicon, chem) {
	function symbols(item) {
		return chem.spellsFormula ? spellFormula(item.core, lexicon, chem) : chem.formula({
			...item,
			formula: item.core
		});
	}
	function name(item) {
		return chem.names[item.formula] ?? symbols(item) + (item.charge ? ` ${chem.ion("", item.charge, true).trim()}` : "");
	}
	function alone(item) {
		const formula = symbols(item);
		return item.charge ? chem.ion(formula, item.charge, false) : formula;
	}
	function term(value, inEquation) {
		const head = headOf(value);
		if (head === "Gas" || head === "Precipitate") return lexicon.join([term(argsOf(value)[0] ?? nothing, inEquation), head === "Gas" ? chem.gas : chem.precipitate]);
		if (head === "Text") return textOf(argsOf(value)[0] ?? nothing);
		const parts = head === "Hydrate" ? argsOf(value) : [value];
		if (inEquation && parts.length > 1) {
			const species = parts.map(chemSpecies);
			const whole = chem.names[species.map((item, index) => index === 0 ? item.formula : `${item.coefficient ?? ""}${item.formula}`).join("*")];
			if (whole !== void 0) return chem.term(whole, species[0].coefficient && lexicon.number(species[0].coefficient));
		}
		return parts.map((part, index) => {
			const item = chemSpecies(part);
			const reading = inEquation ? name(item) : alone(item);
			const coefficient = item.coefficient && lexicon.number(item.coefficient);
			if (inEquation && index === 0) return chem.term(reading, coefficient);
			return coefficient ? lexicon.join([coefficient, reading]) : reading;
		}).join(` ${chem.hydrate} `);
	}
	function side(value, inEquation) {
		const terms = argsOf(value).map((item) => term(item, inEquation));
		if (terms.length === 0) return "";
		return terms.length > 2 && !chem.spellsFormula ? chem.and(lexicon.list(terms.slice(0, -1)), terms.at(-1)) : terms.reduce((left, right) => chem.and(left, right));
	}
	const content = argsOf(expression)[0] ?? nothing;
	if (!isFunction(content, "Reaction")) return side(content, false);
	const [arrow = nothing, left = nothing, right = nothing, condition = nothing] = argsOf(content);
	const equation = ((textOf(arrow) === "->" && argsOf(left).length === 1 && argsOf(right).length >= 2 ? chem.decompose : void 0) ?? chem.arrow[textOf(arrow)])(side(left, true), side(right, true));
	if (condition === nothing) return equation;
	const spokenCondition = headOf(condition) === "Heat" ? chem.heat : textOf(argsOf(condition)[0] ?? nothing);
	return chem.condition(spokenCondition, equation);
}
//#endregion
//#region src/locales/en.ts
/** The English words of chemistry. */
const en = {
	language: "en",
	names: {},
	formula: (species) => species.formula,
	ion: (formula, charge, inEquation) => `${formula} ${charge.slice(0, -1) ? spellNumber(charge.slice(0, -1), "en") : ""} ${charge.endsWith("+") ? "plus" : "minus"}${inEquation ? " ion" : ""}`.replace(/\s+/g, " ").trim(),
	term: (name, coefficient) => coefficient ? `${coefficient} ${name}` : name,
	and: (l, r) => `${l} plus ${r}`,
	arrow: {
		"->": (r, p) => `${r} yields ${p}`,
		"<=>": (r, p) => `${r} is in equilibrium with ${p}`,
		"<-": (r, p) => `${p} yields ${r}`
	},
	condition: (c, e) => `with ${c} ${e}`,
	gas: "gas",
	heat: "heat",
	precipitate: "precipitate",
	spellsFormula: true,
	open: "open parenthesis",
	close: "close parenthesis",
	hydrate: "dot"
};
//#endregion
//#region src/locales/ja.ts
/** The Japanese words of chemistry. */
const ja = {
	language: "ja",
	names: {
		"H2": "水素",
		"O2": "酸素",
		"N2": "窒素",
		"Cl2": "塩素",
		"O3": "オゾン",
		"I2": "ヨウ素",
		"Br2": "臭素",
		"He": "ヘリウム",
		"C": "炭素",
		"S": "硫黄",
		"P": "リン",
		"Si": "ケイ素",
		"Fe": "鉄",
		"Cu": "銅",
		"Zn": "亜鉛",
		"Mg": "マグネシウム",
		"Al": "アルミニウム",
		"Na": "ナトリウム",
		"K": "カリウム",
		"Ca": "カルシウム",
		"Ag": "銀",
		"Hg": "水銀",
		"H2O": "水",
		"H2O2": "過酸化水素",
		"CO": "一酸化炭素",
		"CO2": "二酸化炭素",
		"SO2": "二酸化硫黄",
		"SO3": "三酸化硫黄",
		"NO": "一酸化窒素",
		"NO2": "二酸化窒素",
		"P2O5": "五酸化二リン",
		"SiO2": "二酸化ケイ素",
		"CaO": "酸化カルシウム",
		"MgO": "酸化マグネシウム",
		"Al2O3": "酸化アルミニウム",
		"Fe2O3": "酸化第二鉄",
		"Fe3O4": "四酸化三鉄",
		"CuO": "酸化銅",
		"MnO2": "二酸化マンガン",
		"Na2O": "酸化ナトリウム",
		"ZnO": "酸化亜鉛",
		"HCl": "塩化水素",
		"H2SO4": "硫酸",
		"HNO3": "硝酸",
		"H2CO3": "炭酸",
		"H3PO4": "リン酸",
		"H2S": "硫化水素",
		"CH3COOH": "酢酸",
		"NaOH": "水酸化ナトリウム",
		"KOH": "水酸化カリウム",
		"Ca(OH)2": "水酸化カルシウム",
		"Ba(OH)2": "水酸化バリウム",
		"Mg(OH)2": "水酸化マグネシウム",
		"Al(OH)3": "水酸化アルミニウム",
		"Fe(OH)3": "水酸化第二鉄",
		"Cu(OH)2": "水酸化銅",
		"NH3": "アンモニア",
		"NaCl": "塩化ナトリウム",
		"KCl": "塩化カリウム",
		"CaCl2": "塩化カルシウム",
		"MgCl2": "塩化マグネシウム",
		"FeCl3": "塩化第二鉄",
		"FeCl2": "塩化第一鉄",
		"CuCl2": "塩化銅",
		"AlCl3": "塩化アルミニウム",
		"ZnCl2": "塩化亜鉛",
		"BaCl2": "塩化バリウム",
		"AgCl": "塩化銀",
		"NH4Cl": "塩化アンモニウム",
		"Na2CO3": "炭酸ナトリウム",
		"NaHCO3": "炭酸水素ナトリウム",
		"CaCO3": "炭酸カルシウム",
		"K2CO3": "炭酸カリウム",
		"BaCO3": "炭酸バリウム",
		"Na2SO4": "硫酸ナトリウム",
		"CuSO4": "硫酸銅",
		"BaSO4": "硫酸バリウム",
		"ZnSO4": "硫酸亜鉛",
		"FeSO4": "硫酸第一鉄",
		"(NH4)2SO4": "硫酸アンモニウム",
		"NaNO3": "硝酸ナトリウム",
		"KNO3": "硝酸カリウム",
		"AgNO3": "硝酸銀",
		"NH4NO3": "硝酸アンモニウム",
		"Cu(NO3)2": "硝酸銅",
		"KMnO4": "過マンガン酸カリウム",
		"K2MnO4": "マンガン酸カリウム",
		"KClO3": "塩素酸カリウム",
		"KI": "ヨウ化カリウム",
		"Na2S": "硫化ナトリウム",
		"CH4": "メタン",
		"C2H6": "エタン",
		"C2H4": "エチレン",
		"C2H2": "アセチレン",
		"C3H8": "プロパン",
		"C6H6": "ベンゼン",
		"CH3OH": "メタノール",
		"C2H5OH": "エタノール",
		"HCHO": "ホルムアルデヒド",
		"C6H12O6": "グルコース",
		"C12H22O11": "スクロース",
		"CH3COOC2H5": "酢酸エチル",
		"CO(NH2)2": "尿素",
		"H^+": "水素イオン",
		"OH^-": "水酸化物イオン",
		"Na^+": "ナトリウムイオン",
		"K^+": "カリウムイオン",
		"Ca^2+": "カルシウムイオン",
		"Mg^2+": "マグネシウムイオン",
		"Al^3+": "アルミニウムイオン",
		"Fe^2+": "二価の鉄イオン",
		"Fe^3+": "三価の鉄イオン",
		"Cu^2+": "銅イオン",
		"Zn^2+": "亜鉛イオン",
		"Ag^+": "銀イオン",
		"Ba^2+": "バリウムイオン",
		"NH4^+": "アンモニウムイオン",
		"Cl^-": "塩化物イオン",
		"SO4^2-": "硫酸イオン",
		"CO3^2-": "炭酸イオン",
		"NO3^-": "硝酸イオン",
		"HCO3^-": "炭酸水素イオン",
		"S^2-": "硫化物イオン",
		"MnO4^-": "過マンガン酸イオン",
		"CuSO4*5H2O": "硫酸銅五水和物",
		"Na2CO3*10H2O": "炭酸ナトリウム十水和物"
	},
	formula: (species) => species.formula,
	ion: (formula, charge) => `${formula} ${spellNumber(charge.slice(0, -1) || "1", "ja")}価の${charge.endsWith("+") ? "陽" : "陰"}イオン`,
	term: (name) => name,
	and: (l, r) => `${l}と${r}`,
	arrow: {
		"->": (r, p) => `${r}が反応して ${p}ができる`,
		"<=>": (r, p) => `${r}が可逆的に反応して ${p}ができる`,
		"<-": (r, p) => `${p}が反応して ${r}ができる`
	},
	decompose: (r, p) => `${r}が分解して ${p}ができる`,
	condition: (c, e) => `${c}の条件で ${e}`,
	gas: "気体",
	heat: "加熱",
	precipitate: "沈殿",
	spellsFormula: true,
	open: "かっこ",
	close: "かっことじ",
	hydrate: "ドット"
};
//#endregion
//#region src/locales/ko.ts
/** The Korean words of chemistry. */
const ko = {
	language: "ko",
	names: {
		"H2": "수소",
		"O2": "산소",
		"N2": "질소",
		"Cl2": "염소",
		"O3": "오존",
		"I2": "아이오딘",
		"Br2": "브로민",
		"He": "헬륨",
		"C": "탄소",
		"S": "황",
		"P": "인",
		"Si": "규소",
		"Fe": "철",
		"Cu": "구리",
		"Zn": "아연",
		"Mg": "마그네슘",
		"Al": "알루미늄",
		"Na": "나트륨",
		"K": "칼륨",
		"Ca": "칼슘",
		"Ag": "은",
		"Hg": "수은",
		"H2O": "물",
		"H2O2": "과산화 수소",
		"CO": "일산화 탄소",
		"CO2": "이산화 탄소",
		"SO2": "이산화 황",
		"SO3": "삼산화 황",
		"NO": "일산화 질소",
		"NO2": "이산화 질소",
		"P2O5": "오산화 이인",
		"SiO2": "이산화 규소",
		"CaO": "산화 칼슘",
		"MgO": "산화 마그네슘",
		"Al2O3": "산화 알루미늄",
		"Fe2O3": "산화 제이철",
		"Fe3O4": "사산화 삼철",
		"CuO": "산화 구리",
		"MnO2": "이산화 망가니즈",
		"Na2O": "산화 나트륨",
		"ZnO": "산화 아연",
		"HCl": "염화 수소",
		"H2SO4": "황산",
		"HNO3": "질산",
		"H2CO3": "탄산",
		"H3PO4": "인산",
		"H2S": "황화 수소",
		"CH3COOH": "아세트산",
		"NaOH": "수산화 나트륨",
		"KOH": "수산화 칼륨",
		"Ca(OH)2": "수산화 칼슘",
		"Ba(OH)2": "수산화 바륨",
		"Mg(OH)2": "수산화 마그네슘",
		"Al(OH)3": "수산화 알루미늄",
		"Fe(OH)3": "수산화 제이철",
		"Cu(OH)2": "수산화 구리",
		"NH3": "암모니아",
		"NaCl": "염화 나트륨",
		"KCl": "염화 칼륨",
		"CaCl2": "염화 칼슘",
		"MgCl2": "염화 마그네슘",
		"FeCl3": "염화 제이철",
		"FeCl2": "염화 제일철",
		"CuCl2": "염화 구리",
		"AlCl3": "염화 알루미늄",
		"ZnCl2": "염화 아연",
		"BaCl2": "염화 바륨",
		"AgCl": "염화 은",
		"NH4Cl": "염화 암모늄",
		"Na2CO3": "탄산 나트륨",
		"NaHCO3": "탄산수소 나트륨",
		"CaCO3": "탄산 칼슘",
		"K2CO3": "탄산 칼륨",
		"BaCO3": "탄산 바륨",
		"Na2SO4": "황산 나트륨",
		"CuSO4": "황산 구리",
		"BaSO4": "황산 바륨",
		"ZnSO4": "황산 아연",
		"FeSO4": "황산 제일철",
		"(NH4)2SO4": "황산 암모늄",
		"NaNO3": "질산 나트륨",
		"KNO3": "질산 칼륨",
		"AgNO3": "질산 은",
		"NH4NO3": "질산 암모늄",
		"Cu(NO3)2": "질산 구리",
		"KMnO4": "과망가니즈산 칼륨",
		"K2MnO4": "망가니즈산 칼륨",
		"KClO3": "염소산 칼륨",
		"KI": "아이오딘화 칼륨",
		"Na2S": "황화 나트륨",
		"CH4": "메테인",
		"C2H6": "에테인",
		"C2H4": "에틸렌",
		"C2H2": "아세틸렌",
		"C3H8": "프로페인",
		"C6H6": "벤젠",
		"CH3OH": "메탄올",
		"C2H5OH": "에탄올",
		"HCHO": "폼알데하이드",
		"C6H12O6": "포도당",
		"C12H22O11": "수크로스",
		"CH3COOC2H5": "아세트산 에틸",
		"CO(NH2)2": "요소",
		"H^+": "수소 이온",
		"OH^-": "수산화 이온",
		"Na^+": "나트륨 이온",
		"K^+": "칼륨 이온",
		"Ca^2+": "칼슘 이온",
		"Mg^2+": "마그네슘 이온",
		"Al^3+": "알루미늄 이온",
		"Fe^2+": "철 이가 이온",
		"Fe^3+": "철 삼가 이온",
		"Cu^2+": "구리 이온",
		"Zn^2+": "아연 이온",
		"Ag^+": "은 이온",
		"Ba^2+": "바륨 이온",
		"NH4^+": "암모늄 이온",
		"Cl^-": "염화 이온",
		"SO4^2-": "황산 이온",
		"CO3^2-": "탄산 이온",
		"NO3^-": "질산 이온",
		"HCO3^-": "탄산수소 이온",
		"S^2-": "황화 이온",
		"MnO4^-": "과망가니즈산 이온",
		"CuSO4*5H2O": "황산 구리 오수화물",
		"Na2CO3*10H2O": "탄산 나트륨 십수화물"
	},
	formula: (species) => species.formula,
	ion: (formula, charge) => `${formula} ${spellNumber(charge.slice(0, -1) || "1", "ko")}가 ${charge.endsWith("+") ? "양" : "음"}이온`,
	term: (name) => name,
	and: (l, r) => `${josa(l, "과", "와")} ${r}`,
	arrow: {
		"->": (r, p) => `${josa(r, "이", "가")} 반응하여 ${josa(p, "이", "가")} 생성된다`,
		"<=>": (r, p) => `${josa(r, "이", "가")} 가역적으로 반응하여 ${josa(p, "이", "가")} 생성된다`,
		"<-": (r, p) => `${josa(p, "이", "가")} 반응하여 ${josa(r, "이", "가")} 생성된다`
	},
	decompose: (r, p) => `${josa(r, "이", "가")} 분해되어 ${josa(p, "이", "가")} 생성된다`,
	condition: (c, e) => `${c} 조건에서 ${e}`,
	gas: "기체",
	heat: "가열",
	precipitate: "침전",
	spellsFormula: true,
	open: "괄호 열고",
	close: "괄호 닫고",
	hydrate: "점"
};
//#endregion
//#region src/locales/zh.ts
/** The Chinese words of chemistry. */
const zh = {
	language: "zh",
	names: {
		"H2": "氢气",
		"O2": "氧气",
		"N2": "氮气",
		"Cl2": "氯气",
		"O3": "臭氧",
		"I2": "碘",
		"Br2": "溴",
		"He": "氦气",
		"C": "碳",
		"S": "硫",
		"P": "磷",
		"Si": "硅",
		"Fe": "铁",
		"Cu": "铜",
		"Zn": "锌",
		"Mg": "镁",
		"Al": "铝",
		"Na": "钠",
		"K": "钾",
		"Ca": "钙",
		"Ag": "银",
		"Hg": "汞",
		"H2O": "水",
		"H2O2": "过氧化氢",
		"CO": "一氧化碳",
		"CO2": "二氧化碳",
		"SO2": "二氧化硫",
		"SO3": "三氧化硫",
		"NO": "一氧化氮",
		"NO2": "二氧化氮",
		"P2O5": "五氧化二磷",
		"SiO2": "二氧化硅",
		"CaO": "氧化钙",
		"MgO": "氧化镁",
		"Al2O3": "氧化铝",
		"Fe2O3": "氧化铁",
		"Fe3O4": "四氧化三铁",
		"CuO": "氧化铜",
		"MnO2": "二氧化锰",
		"Na2O": "氧化钠",
		"ZnO": "氧化锌",
		"HCl": "氯化氢",
		"H2SO4": "硫酸",
		"HNO3": "硝酸",
		"H2CO3": "碳酸",
		"H3PO4": "磷酸",
		"H2S": "硫化氢",
		"CH3COOH": "乙酸",
		"NaOH": "氢氧化钠",
		"KOH": "氢氧化钾",
		"Ca(OH)2": "氢氧化钙",
		"Ba(OH)2": "氢氧化钡",
		"Mg(OH)2": "氢氧化镁",
		"Al(OH)3": "氢氧化铝",
		"Fe(OH)3": "氢氧化铁",
		"Cu(OH)2": "氢氧化铜",
		"NH3": "氨气",
		"NaCl": "氯化钠",
		"KCl": "氯化钾",
		"CaCl2": "氯化钙",
		"MgCl2": "氯化镁",
		"FeCl3": "氯化铁",
		"FeCl2": "氯化亚铁",
		"CuCl2": "氯化铜",
		"AlCl3": "氯化铝",
		"ZnCl2": "氯化锌",
		"BaCl2": "氯化钡",
		"AgCl": "氯化银",
		"NH4Cl": "氯化铵",
		"Na2CO3": "碳酸钠",
		"NaHCO3": "碳酸氢钠",
		"CaCO3": "碳酸钙",
		"K2CO3": "碳酸钾",
		"BaCO3": "碳酸钡",
		"Na2SO4": "硫酸钠",
		"CuSO4": "硫酸铜",
		"BaSO4": "硫酸钡",
		"ZnSO4": "硫酸锌",
		"FeSO4": "硫酸亚铁",
		"(NH4)2SO4": "硫酸铵",
		"NaNO3": "硝酸钠",
		"KNO3": "硝酸钾",
		"AgNO3": "硝酸银",
		"NH4NO3": "硝酸铵",
		"Cu(NO3)2": "硝酸铜",
		"KMnO4": "高锰酸钾",
		"K2MnO4": "锰酸钾",
		"KClO3": "氯酸钾",
		"KI": "碘化钾",
		"Na2S": "硫化钠",
		"CH4": "甲烷",
		"C2H6": "乙烷",
		"C2H4": "乙烯",
		"C2H2": "乙炔",
		"C3H8": "丙烷",
		"C6H6": "苯",
		"CH3OH": "甲醇",
		"C2H5OH": "乙醇",
		"HCHO": "甲醛",
		"C6H12O6": "葡萄糖",
		"C12H22O11": "蔗糖",
		"CH3COOC2H5": "乙酸乙酯",
		"CO(NH2)2": "尿素",
		"H^+": "氢离子",
		"OH^-": "氢氧根离子",
		"Na^+": "钠离子",
		"K^+": "钾离子",
		"Ca^2+": "钙离子",
		"Mg^2+": "镁离子",
		"Al^3+": "铝离子",
		"Fe^2+": "亚铁离子",
		"Fe^3+": "三价铁离子",
		"Cu^2+": "铜离子",
		"Zn^2+": "锌离子",
		"Ag^+": "银离子",
		"Ba^2+": "钡离子",
		"NH4^+": "铵根离子",
		"Cl^-": "氯离子",
		"SO4^2-": "硫酸根离子",
		"CO3^2-": "碳酸根离子",
		"NO3^-": "硝酸根离子",
		"HCO3^-": "碳酸氢根离子",
		"S^2-": "硫离子",
		"MnO4^-": "高锰酸根离子",
		"CuSO4*5H2O": "五水合硫酸铜",
		"Na2CO3*10H2O": "十水合碳酸钠"
	},
	formula: (species) => species.formula,
	ion: (formula, charge) => `${formula} ${charge.slice(0, -1) || "1"}价${charge.endsWith("+") ? "正" : "负"}离子`,
	term: (name) => name,
	and: (l, r) => `${l} 和 ${r}`,
	arrow: {
		"->": (r, p) => `${r} 反应生成 ${p}`,
		"<=>": (r, p) => `${r} 可逆反应生成 ${p}`,
		"<-": (r, p) => `${p} 反应生成 ${r}`
	},
	decompose: (r, p) => `${r} 分解生成 ${p}`,
	condition: (c, e) => `在${c}条件下 ${e}`,
	gas: "气体",
	heat: "加热",
	precipitate: "沉淀",
	spellsFormula: false,
	open: "左括号",
	close: "右括号",
	hydrate: "点"
};
//#endregion
//#region src/index.ts
/** The built-in chemistry locales: Chinese, English, Japanese, and Korean. */
const builtinChemLocales = [
	en,
	ja,
	ko,
	zh
];
/**
* Reads mhchem `\ce{}` and `\pu{}` as chemistry, as an extension of `MathSpeech`.
*
* @example
* const speech = new MathSpeech({ extensions: [chemistry()] })
* speech.speak(String.raw`\ce{2H2 + O2 -> 2H2O}`, 'zh')
* // => '氢气 和 氧气 反应生成 水'
*/
function chemistry(options = {}) {
	const locales = new Map((options.locales ?? builtinChemLocales).map((locale) => [locale.language, locale]));
	const fallback = options.fallbackLanguage ?? "en";
	return {
		name: "chemistry",
		rawCommands: ["ce", "pu"],
		lower: (_, source) => lowerChemistry(source),
		render: { Chemistry: (expression, { lexicon }) => {
			const locale = locales.get(lexicon.language) ?? locales.get(fallback);
			if (!locale) throw new Error(`No chemistry locale reads ${lexicon.language}, and the fallback ${fallback} has none.`);
			return speakChemistry(expression, lexicon, locale);
		} }
	};
}
//#endregion
export { builtinChemLocales, chemistry, en as enChem, ja as jaChem, ko as koChem, lowerChemistry, speakChemistry, zh as zhChem };
