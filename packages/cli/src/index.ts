#!/usr/bin/env node

/*
 * SPDX-License-Identifier: MPL-2.0
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { defineCommand, runMain } from "citty";
import { serveCommand } from "./serve.js";
import { inspectCommand } from "./inspect.js";

const main = defineCommand({
  meta: {
    name: "tapemark",
    description: "SQLite admin panel — browse, edit, sync",
  },
  subCommands: {
    serve: serveCommand,
    inspect: inspectCommand,
  },
});

runMain(main);
