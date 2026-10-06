export type Support = "supported" | "partial" | "unsupported";
export interface PropertyRule {
  property: string;
  support: Support;
  values?: Record<string, Support>;
  note: string;
  source: string;
}
export interface SelectorRule {
  pattern: "pseudo-class" | "pseudo-element" | "combinator" | "attribute";
  name: string;
  support: Support;
  note: string;
  source: string;
}
export interface AtRule {
  name: string;
  support: Support;
  note: string;
  source: string;
}
export interface UnitRule {
  name: string;
  support: Support;
  note: string;
  source: string;
}
export interface KindleSupportTable {
  properties: readonly PropertyRule[];
  selectors: readonly SelectorRule[];
  atRules: readonly AtRule[];
  units: readonly UnitRule[];
}
export interface CssFinding {
  from: number;
  to: number;
  severity: "warning" | "info";
  code: string;
  params: Record<string, string>;
}
