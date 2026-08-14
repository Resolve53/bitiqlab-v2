export class PineAuthorityError extends Error {
  readonly code: string;
  constructor(message: string, code = "PINE_AUTHORITY_ERROR") {
    super(message);
    this.name = "PineAuthorityError";
    this.code = code;
  }
}

export class UnsupportedRuleError extends PineAuthorityError {
  constructor(message: string) {
    super(message, "UNSUPPORTED_RULE");
    this.name = "UnsupportedRuleError";
  }
}

export class SnapshotHashMismatchError extends PineAuthorityError {
  constructor(message: string) {
    super(message, "SNAPSHOT_HASH_MISMATCH");
    this.name = "SnapshotHashMismatchError";
  }
}

export class CandidateValidationError extends Error {
  readonly code: string;
  readonly statusCode: number;
  constructor(message: string, code: string, statusCode = 400) {
    super(message);
    this.name = "CandidateValidationError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class TradingViewPipelinePersistenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TradingViewPipelinePersistenceError";
  }
}

export class McpDeployError extends Error {
  readonly code: string;
  constructor(message: string, code = "MCP_DEPLOY_FAILED") {
    super(message);
    this.name = "McpDeployError";
    this.code = code;
  }
}

/** Precise MCP / browser / TradingView failure classes (Stage 1C). */
export const MCP_RUNTIME_ERROR_CLASSES = {
  MCP_HTTP_UNREACHABLE: "MCP_HTTP_UNREACHABLE",
  BROWSER_NOT_RUNNING: "BROWSER_NOT_RUNNING",
  CDP_UNREACHABLE: "CDP_UNREACHABLE",
  TRADINGVIEW_PAGE_NOT_READY: "TRADINGVIEW_PAGE_NOT_READY",
  TRADINGVIEW_AUTH_REQUIRED: "TRADINGVIEW_AUTH_REQUIRED",
  TRADINGVIEW_SELECTOR_NOT_FOUND: "TRADINGVIEW_SELECTOR_NOT_FOUND",
  PINE_EDITOR_NOT_FOUND: "PINE_EDITOR_NOT_FOUND",
  PINE_EDITOR_SETUP_REQUIRED: "PINE_EDITOR_SETUP_REQUIRED",
  COMPILE_FAILED: "COMPILE_FAILED",
} as const;

export type McpRuntimeErrorClass =
  (typeof MCP_RUNTIME_ERROR_CLASSES)[keyof typeof MCP_RUNTIME_ERROR_CLASSES];
