import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

export async function collectJsonFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectJsonFiles(candidate)));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(candidate);
    }
  }

  return files;
}

export async function treeDigest(root, files) {
  const digest = createHash("sha256");
  const ordered = [...files].sort((left, right) =>
    logicalPath(root, left).localeCompare(logicalPath(root, right)),
  );

  for (const file of ordered) {
    digest.update(logicalPath(root, file));
    digest.update(Buffer.from([0]));
    digest.update(await readFile(file));
    digest.update(Buffer.from([0]));
  }

  return digest.digest("hex");
}

export async function verifyProtocolBundle(root) {
  const pinPath = path.join(root, "PROTOCOL_PIN.json");
  const pin = JSON.parse(await readFile(pinPath, "utf8"));

  if (
    pin.repository !==
      "https://github.com/missionweaveprotocol/missionweaveprotocol" ||
    pin.commit !== "6f10987627d62fb296e3490ceceb5539b1e94b70" ||
    pin.protocolVersion !== "0.1" ||
    pin.wireNamespace !== "missionweaveprotocol"
  ) {
    throw new Error("PROTOCOL_PIN.json has unexpected protocol identity");
  }

  const allFiles = [];
  for (const name of ["schemas", "conformance"]) {
    const artifact = pin.artifacts?.[name];
    if (!artifact || artifact.path !== name) {
      throw new Error(`PROTOCOL_PIN.json has an invalid ${name} artifact`);
    }

    const directory = path.join(root, artifact.path);
    if (!(await stat(directory)).isDirectory()) {
      throw new Error(`${artifact.path} is not a directory`);
    }
    const files = await collectJsonFiles(directory);
    if (files.length !== artifact.files) {
      throw new Error(
        `${name} expected ${artifact.files} JSON files, found ${files.length}`,
      );
    }

    const actualDigest = await treeDigest(root, files);
    if (actualDigest !== artifact.sha256) {
      throw new Error(
        `${name} digest mismatch: expected ${artifact.sha256}, got ${actualDigest}`,
      );
    }
    allFiles.push(...files);
  }

  const bundleDigest = await treeDigest(root, allFiles);
  if (bundleDigest !== pin.bundleSha256) {
    throw new Error(
      `bundle digest mismatch: expected ${pin.bundleSha256}, got ${bundleDigest}`,
    );
  }

  return {
    bundleSha256: bundleDigest,
    conformanceFiles: pin.artifacts.conformance.files,
    protocolCommit: pin.commit,
    protocolVersion: pin.protocolVersion,
    schemaFiles: pin.artifacts.schemas.files,
  };
}

function logicalPath(root, file) {
  return path.relative(root, file).split(path.sep).join("/");
}
