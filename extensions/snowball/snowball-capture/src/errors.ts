export const ErrorCode = [
  "INVALID_INPUT",
  "NOT_AN_APPROVAL",
  "NOT_IN_GIT_REPO",
  "WRITE_FAILED",
  "INTERNAL",
] as const;

export type ErrorCode = (typeof ErrorCode)[number];

export type ToolResult<T> = { ok: true; data: T } | { ok: false; error: string; code: ErrorCode };

export function err(code: ErrorCode, message: string): ToolResult<never> {
  return { ok: false, error: message, code };
}

export function ok<T>(data: T): ToolResult<T> {
  return { ok: true, data };
}
