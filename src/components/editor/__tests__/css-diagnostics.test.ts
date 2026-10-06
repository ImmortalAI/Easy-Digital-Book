import { EditorState } from "@codemirror/state";
import { diagnosticCount, forEachDiagnostic, setDiagnostics } from "@codemirror/lint";
import { expect, it } from "vitest";
import { cssLintDiagnostics } from "../css-diagnostics";
it("uses CodeMirror diagnostics for translation, severity, ranges and clearing", () => {
  const translate = (key: string, params: Record<string, string>) =>
    `${key}:${params.property ?? ""}`;
  const result = cssLintDiagnostics(
    [
      { from: 0, to: 1, severity: "warning", code: "unknownProperty", params: { property: "x" } },
      { from: 2, to: 3, severity: "info", code: "syntax", params: {} },
    ],
    translate,
  );
  expect(result).toEqual([
    { from: 0, to: 1, severity: "warning", message: "cssSupport.unknownProperty:x" },
    { from: 2, to: 3, severity: "info", message: "cssSupport.syntax:" },
  ]);
  let state = EditorState.create({ doc: "x y" });
  state = state.update(setDiagnostics(state, result)).state;
  expect(diagnosticCount(state)).toBe(2);
  const severities: string[] = [];
  forEachDiagnostic(state, (item) => severities.push(item.severity));
  expect(severities).toEqual(["warning", "info"]);
  state = state.update(setDiagnostics(state, [])).state;
  expect(diagnosticCount(state)).toBe(0);
});
