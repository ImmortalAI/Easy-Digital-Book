export type DiagnosticSeverity = "warning" | "error";
export interface DiagnosticPosition {
  line: number;
  column: number;
}
export interface Diagnostic {
  severity: DiagnosticSeverity;
  message: string;
  position?: DiagnosticPosition;
}
export interface AppWarning {
  code: string;
  message: string;
  chapterId?: string;
}

export type WarningSelection =
  | { chapterId?: string; position?: DiagnosticPosition }
  | { kind: "css"; from: number; to: number };
