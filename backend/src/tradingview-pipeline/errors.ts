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
