import type { Diagnostic } from "@codemirror/lint";
import type { CssFinding } from "@/services/css-support/types";

export function cssLintDiagnostics(
  findings: readonly CssFinding[],
  translate: (key: string, params: Record<string, string>) => string,
): Diagnostic[] {
  return findings.map(({ from, to, severity, code, params }) => ({
    from,
    to,
    severity,
    message: translate(`cssSupport.${code}`, params),
  }));
}
