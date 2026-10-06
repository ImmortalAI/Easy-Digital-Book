declare module "css-tree/utils" {
  export { ident, string, url } from "css-tree";
}
declare module "css-tree/parser" {
  export { parse as default } from "css-tree";
}
declare module "css-tree/walker" {
  export { walk as default } from "css-tree";
}
declare module "css-tree/tokenizer" {
  export { tokenize, tokenTypes } from "css-tree";
}
