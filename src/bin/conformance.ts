#!/usr/bin/env node

import path from "node:path";

import { runConformance } from "../conformance.js";
import { packageRoot } from "../package-root.js";

const options = parseArguments(process.argv.slice(2));

try {
  const report = runConformance(options.root);
  if (options.json) {
    console.log(JSON.stringify(report, undefined, 2));
  } else {
    console.log(
      `${report.passed}/${report.total} conformance vectors passed (${report.validCases} valid, ${report.invalidCases} invalid).`,
    );
    for (const result of report.cases.filter((item) => !item.passed)) {
      console.error(
        `${result.name}: expected ${result.expectedValid ? "valid" : "invalid"}, got ${result.actualValid ? "valid" : "invalid"}`,
      );
    }
  }
  if (report.failed > 0) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function parseArguments(arguments_: readonly string[]): {
  readonly json: boolean;
  readonly root: string;
} {
  let json = false;
  let root = packageRoot(import.meta.url);
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--json") {
      json = true;
    } else if (argument === "--root") {
      const value = arguments_[index + 1];
      if (!value) throw new Error("--root requires a directory");
      root = path.resolve(value);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return { json, root };
}
