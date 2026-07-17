import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const root = process.cwd();
const readmeNames = [
  "README.md",
  "README.zh-CN.md",
  "README.zh-TW.md",
  "README.ja.md",
  "README.es.md",
  "README.fr.md",
  "README.de.md",
];
const switcher =
  "[English](README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md)";
const requiredTechnicalLiterals = [
  "@missionweaveprotocol/sdk",
  "Node.js 20",
  "MissionWeaveProtocol",
  "ESM",
  "CommonJS",
  "parseStrictJson",
  "SchemaCatalog",
  "FrameCodec",
  "JCS",
  "Ed25519",
  "npx --package @missionweaveprotocol/sdk missionweaveprotocol-conformance",
  "schemas/",
  "conformance/",
  "PROTOCOL_PIN.json",
];
const conformanceClaims = new Map([
  ["README.md", "schema-and-vector conformance only"],
  ["README.zh-CN.md", "schema-and-vector conformance only"],
  ["README.zh-TW.md", "schema-and-vector conformance only"],
  ["README.ja.md", "schema-and-vector conformance only"],
  ["README.es.md", "conformidad con esquemas y vectores de prueba"],
  ["README.fr.md", "conformité limitée aux schémas et aux vecteurs de test"],
  ["README.de.md", "Schema- und Testvektorkonformität"],
]);
const failures = [];
const readmes = new Map();

for (const name of readmeNames) {
  const file = path.join(root, name);
  if (!existsSync(file)) {
    failures.push(`${name}: missing localized README`);
    continue;
  }
  const content = readFileSync(file, "utf8");
  readmes.set(name, content);
  const normalized = content.replace(/^>\s?/gmu, "").replace(/\s+/gu, " ");
  if (!normalized.includes(switcher)) {
    failures.push(`${name}: missing the canonical language switcher`);
  }
  for (const literal of requiredTechnicalLiterals) {
    if (!normalized.includes(literal)) {
      failures.push(`${name}: missing technical literal ${literal}`);
    }
  }
  const conformanceClaim = conformanceClaims.get(name);
  if (
    conformanceClaim === undefined ||
    !normalized.includes(conformanceClaim)
  ) {
    failures.push(`${name}: missing its localized conformance claim`);
  }
  if (!/(?:`0\.1`|<code>0\.1<\/code>)/u.test(content)) {
    failures.push(`${name}: missing the protocol version literal 0.1`);
  }
  for (const count of ["21", "43", "22"]) {
    if (!content.includes(count))
      failures.push(`${name}: missing count ${count}`);
  }
  validateRelativeLinks(name, content);
}

const english = readFileSync(path.join(root, "README.md"), "utf8");
const examples = readdirSync(path.join(root, "examples"))
  .filter((name) => name.endsWith(".ts"))
  .sort();
for (const name of examples) {
  const logicalPath = `examples/${name}`;
  const expected = readFileSync(path.join(root, logicalPath), "utf8").trimEnd();
  const escaped = escapeRegExp(logicalPath);
  const pattern = new RegExp(
    "<!-- example: " + escaped + " -->\\n\\s*```ts\\n([\\s\\S]*?)\\n```",
    "gu",
  );
  const matches = [...english.matchAll(pattern)];
  if (matches.length !== 1) {
    failures.push(
      `README.md: expected one synchronized block for ${logicalPath}, found ${matches.length}`,
    );
  } else if (matches[0][1] !== expected) {
    failures.push(`README.md: code block differs from ${logicalPath}`);
  }
}

const annotatedBlocks = [
  ...english.matchAll(/<!-- example: (examples\/[a-z0-9-]+\.ts) -->/gu),
]
  .map((match) => match[1])
  .sort();
if (
  annotatedBlocks.length !== examples.length ||
  annotatedBlocks.some((name, index) => name !== `examples/${examples[index]}`)
) {
  failures.push("README.md: annotated example set is incomplete or duplicated");
}

const protocolPin = JSON.parse(
  readFileSync(path.join(root, "PROTOCOL_PIN.json"), "utf8"),
);
if (!english.includes(protocolPin.commit)) {
  failures.push("README.md: protocol pin commit is stale or absent");
}

const schemaCount = readdirSync(path.join(root, "schemas")).filter((name) =>
  name.endsWith(".json"),
).length;
const manifest = JSON.parse(
  readFileSync(path.join(root, "conformance", "manifest.json"), "utf8"),
);
const validCount = manifest.filter((entry) => entry.valid === true).length;
const invalidCount = manifest.filter((entry) => entry.valid === false).length;
if (
  schemaCount !== 21 ||
  manifest.length !== 43 ||
  validCount !== 22 ||
  invalidCount !== 21
) {
  failures.push(
    `documentation counts changed: ${schemaCount} schemas, ${manifest.length} vectors, ${validCount} valid, ${invalidCount} invalid`,
  );
}

const packageDocument = JSON.parse(
  readFileSync(path.join(root, "package.json"), "utf8"),
);
for (const packagedPath of ["README*.md", "examples"]) {
  if (!packageDocument.files.includes(packagedPath)) {
    failures.push(`package.json: files does not include ${packagedPath}`);
  }
}

const checkedCodeBlocks = validateCodeBlocks();

if (failures.length > 0) {
  console.error("Documentation verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `Documentation verified: ${readmeNames.length} READMEs, ${checkedCodeBlocks} source blocks, ${examples.length} synchronized examples, ${schemaCount} schemas, and ${manifest.length} vectors.`,
);

function validateCodeBlocks() {
  const workspace = mkdtempSync(
    path.join(tmpdir(), "missionweaveprotocol-ts-docs-"),
  );
  const typeScriptFiles = [];
  let checked = 0;
  try {
    writeFileSync(
      path.join(workspace, "package.json"),
      `${JSON.stringify({ private: true, type: "module" }, undefined, 2)}\n`,
    );

    for (const [readmeName, content] of readmes) {
      let index = 0;
      for (const match of content.matchAll(
        /```(ts|typescript|js|javascript)\n([\s\S]*?)\n```/gu,
      )) {
        index += 1;
        checked += 1;
        const language = match[1];
        const source = match[2];
        const stem = `${readmeName.replace(/[^A-Za-z0-9]+/gu, "-")}-${index}`;
        if (language === "ts" || language === "typescript") {
          const file = `${stem}.ts`;
          writeFileSync(path.join(workspace, file), `${source}\n`);
          typeScriptFiles.push(file);
        } else {
          const extension = source.includes("require(") ? "cjs" : "mjs";
          const file = path.join(workspace, `${stem}.${extension}`);
          writeFileSync(file, `${source}\n`);
          try {
            execFileSync(process.execPath, ["--check", file], {
              encoding: "utf8",
              stdio: "pipe",
            });
          } catch (error) {
            failures.push(
              `${readmeName}: JavaScript block ${index} does not parse: ${commandError(error)}`,
            );
          }
        }
      }
    }

    if (typeScriptFiles.length > 0) {
      const config = {
        extends: path.join(root, "tsconfig.json"),
        compilerOptions: {
          baseUrl: root,
          noEmit: true,
          paths: {
            "@missionweaveprotocol/sdk": ["./src/index.ts"],
          },
          typeRoots: [path.join(root, "node_modules", "@types")],
          types: ["node"],
        },
        include: ["./*.ts"],
      };
      const configPath = path.join(workspace, "tsconfig.json");
      writeFileSync(configPath, `${JSON.stringify(config, undefined, 2)}\n`);
      try {
        execFileSync(
          process.execPath,
          [
            path.join(root, "node_modules", "typescript", "bin", "tsc"),
            "-p",
            configPath,
          ],
          { encoding: "utf8", stdio: "pipe" },
        );
      } catch (error) {
        failures.push(
          `README TypeScript blocks do not compile: ${commandError(error)}`,
        );
      }
    }
  } finally {
    rmSync(workspace, { force: true, recursive: true });
  }
  return checked;
}

function validateRelativeLinks(sourceName, content) {
  for (const match of content.matchAll(/\[[^\]]*\]\(([^)]+)\)/gu)) {
    const target = match[1];
    if (target.startsWith("#") || /^[a-z][a-z0-9+.-]*:/iu.test(target)) {
      continue;
    }
    const pathname = decodeURIComponent(target.split("#", 1)[0]);
    if (!pathname) continue;
    if (!existsSync(path.resolve(root, path.dirname(sourceName), pathname))) {
      failures.push(`${sourceName}: broken relative link ${target}`);
    }
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function commandError(error) {
  if (typeof error !== "object" || error === null) return String(error);
  const output = `${error.stdout ?? ""}${error.stderr ?? ""}`.trim();
  return output || String(error);
}
