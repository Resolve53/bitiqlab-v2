export class EnrichmentError extends Error {
  readonly code: string;
  readonly statusCode: number;
  constructor(message: string, code: string, statusCode = 400) {
    super(message);
    this.name = "EnrichmentError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class EnrichmentPersistenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnrichmentPersistenceError";
  }
}
