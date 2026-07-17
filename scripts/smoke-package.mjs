import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

import { verifyProtocolBundle } from "./protocol-bundle.mjs";

const execute = promisify(execFile);
const workspace = await mkdtemp(
  path.join(tmpdir(), "missionweaveprotocol-ts-pack-"),
);

try {
  const { stdout } = await execute(
    "npm",
    ["pack", "--json", "--ignore-scripts", "--pack-destination", workspace],
    { cwd: process.cwd(), maxBuffer: 10 * 1024 * 1024 },
  );
  const packResult = JSON.parse(stdout);
  const tarball = path.join(workspace, packResult[0].filename);
  const consumer = path.join(workspace, "consumer");

  await execute("npm", ["init", "--yes"], { cwd: workspace });
  await execute(
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--prefix",
      consumer,
      tarball,
    ],
    { cwd: workspace, maxBuffer: 10 * 1024 * 1024 },
  );

  const installedRoot = path.join(
    consumer,
    "node_modules",
    "@missionweaveprotocol",
    "sdk",
  );
  const imported = await import(
    pathToFileURL(path.join(installedRoot, "dist", "index.js")).href
  );
  const required = createRequire(import.meta.url)(
    path.join(installedRoot, "dist", "index.cjs"),
  );
  if (
    imported.protocolVersion !== "0.1" ||
    required.protocolVersion !== "0.1"
  ) {
    throw new Error("packed ESM or CommonJS entry point failed");
  }
  const commonJsReport = required.runConformance(installedRoot);
  if (commonJsReport.passed !== 43 || commonJsReport.failed !== 0) {
    throw new Error("packed CommonJS conformance runner failed");
  }

  const packageDocument = JSON.parse(
    await readFile(path.join(installedRoot, "package.json"), "utf8"),
  );
  if (packageDocument.name !== "@missionweaveprotocol/sdk") {
    throw new Error("installed package has an unexpected name");
  }

  const bundle = await verifyProtocolBundle(installedRoot);
  const executable = path.join(
    consumer,
    "node_modules",
    ".bin",
    process.platform === "win32"
      ? "missionweaveprotocol-conformance.cmd"
      : "missionweaveprotocol-conformance",
  );
  const conformance = await execute(executable, [], {
    cwd: consumer,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (!conformance.stdout.includes("43/43 conformance vectors passed")) {
    throw new Error("installed conformance executable failed");
  }
  console.log(
    `Package smoke test passed for ${packResult[0].filename}: ${bundle.schemaFiles} schemas, ${bundle.conformanceFiles} conformance files, and the installed CLI.`,
  );
} finally {
  await rm(workspace, { force: true, recursive: true });
}
