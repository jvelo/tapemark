/*
 * SPDX-License-Identifier: MPL-2.0
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

interface FlashProps {
  type?: string;
  message?: string;
}

export function Flash({ type, message }: FlashProps) {
  if (!message) return null;
  let cls: string;
  let prefix: string;
  if (type === "error") {
    cls = "tm-flash tm-flash-error";
    prefix = "✗ ";
  } else if (type === "warning") {
    cls = "tm-flash tm-flash-warning";
    prefix = "⚠ ";
  } else {
    cls = "tm-flash tm-flash-success";
    prefix = "→ ";
  }
  return (
    <div class={cls} id="tm-flash">
      {prefix}
      {message}
    </div>
  );
}
