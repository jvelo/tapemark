/*
 * SPDX-License-Identifier: MPL-2.0
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

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
