import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const retiredShortName = ["a", "wgp"].join("");
const retiredExpandedName = new RegExp(
  ["agent", "[ _-]+", "workgroup", "[ _-]+", "protocol"].join(""),
  "iu",
);
const displayFragment = ["Mission", "Weave"].join("");
const machineFragment = ["mission", "weave"].join("");
const environmentFragment = ["MISSION", "WEAVE"].join("");
const retiredDecisionRecord = ["a", "dr"].join("");
const forbidden = [
  ["retired acronym", new RegExp(retiredShortName, "giu")],
  ["retired expanded name", new RegExp(retiredExpandedName.source, "giu")],
  [
    "incomplete display identity",
    new RegExp(`${displayFragment}(?!Protocol)`, "gu"),
  ],
  [
    "incomplete machine identity",
    new RegExp(`${machineFragment}(?!protocol)`, "gu"),
  ],
  [
    "incomplete environment identity",
    new RegExp(`${environmentFragment}(?!PROTOCOL)`, "gu"),
  ],
  [
    "retired documentation reference",
    new RegExp(`\\b${retiredDecisionRecord}s?\\b`, "giu"),
  ],
];
const skippedFiles = new Set(["package-lock.json"]);
const listed = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard"],
  { encoding: "utf8" },
)
  .split("\n")
  .filter(Boolean)
  .sort();
const violations = [];

for (const path of listed) {
  if (skippedFiles.has(path)) continue;

  for (const [label, pattern] of forbidden) {
    pattern.lastIndex = 0;
    const match = pattern.exec(path);
    if (match) violations.push(`path: ${path}: ${label}: ${match[0]}`);
  }

  let content;
  try {
    content = new TextDecoder("utf-8", { fatal: true }).decode(
      readFileSync(path),
    );
  } catch {
    continue;
  }

  for (const [label, pattern] of forbidden) {
    pattern.lastIndex = 0;
    for (const match of content.matchAll(pattern)) {
      const line = content.slice(0, match.index).split("\n").length;
      violations.push(`content: ${path}:${line}: ${label}: ${match[0]}`);
    }
  }
}

if (violations.length > 0) {
  console.error("Repository policy violations:");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log(`Repository policy passed for ${listed.length} files.`);
