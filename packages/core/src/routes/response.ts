import type { TapemarkResponse } from "../types";

export function redirect(url: string, status = 302): TapemarkResponse {
  return { status, headers: { location: url }, redirect: url };
}
