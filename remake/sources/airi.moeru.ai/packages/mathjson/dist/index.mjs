//#region src/index.ts
/** The placeholder of an argument that the writer left out, for example the upper bound of `\sum_{i}`. */
const nothing = "Nothing";
/** Wraps literal text as a MathJSON string, which MathJSON quotes with apostrophes: `'card'`. */
function text(value) {
	return `'${value}'`;
}
function isText(value) {
	return typeof value === "string" && value.length >= 2 && value.startsWith("'") && value.endsWith("'");
}
/** Reads the content of a MathJSON string. */
function textOf(value) {
	return isText(value) ? value.slice(1, -1) : "";
}
function isNumber(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value) && "num" in value;
}
function isFunction(value, head) {
	return Array.isArray(value) && (head === void 0 || value[0] === head);
}
function isSymbol(value) {
	return typeof value === "string" && !isText(value) && value !== "Nothing";
}
function headOf(value) {
	return isFunction(value) ? value[0] : void 0;
}
function argsOf(value) {
	return isFunction(value) ? value.slice(1) : [];
}
//#endregion
export { argsOf, headOf, isFunction, isNumber, isSymbol, isText, nothing, text, textOf };
