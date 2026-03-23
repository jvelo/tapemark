/**
 * Base error class for all tapemark errors.
 * Carries an HTTP status code and optional detail for logging.
 */
export class TapemarkError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly detail?: string,
  ) {
    super(message);
    this.name = "TapemarkError";
  }
}

export class NotFoundError extends TapemarkError {
  constructor(message: string, detail?: string) {
    super(404, message, detail);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends TapemarkError {
  constructor(message: string, detail?: string) {
    super(400, message, detail);
    this.name = "ValidationError";
  }
}
