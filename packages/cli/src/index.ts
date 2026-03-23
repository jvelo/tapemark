#!/usr/bin/env node
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
