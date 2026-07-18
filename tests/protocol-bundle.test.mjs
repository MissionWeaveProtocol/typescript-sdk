import {
  cp,
  mkdtemp,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { verifyCryptographyBundle } from "../scripts/protocol-bundle.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const temporaryRoots = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) =>
      rm(root, {
        force: true,
        recursive: true,
      }),
    ),
  );
});

describe("verifyCryptographyBundle", () => {
  it("verifies the pinned cryptography bundle", async () => {
    await expect(verifyCryptographyBundle(repositoryRoot)).resolves.toEqual({
      artifactCount: 94,
      artifactDigest:
        "sha256:487e18c1ea7053432953f28d1496ae4fdb8e9d42c2eeb8e94f9b21f8cc2596a2",
      caseCount: 22,
      evaluationCount: 58,
      manifestVersion: 1,
      profileId: "missionweaveprotocol.signed-document-verification.v0.1",
      protocolVersion: "0.1",
      sourceCommit: "235aee85ba88934641822e1639e08efd2c9e29b6",
    });
  });

  it("rejects duplicate decoded manifest members", async () => {
    const root = await copyBundleFixture();
    const manifestPath = path.join(root, "cryptography", "manifest.json");
    const manifest = await readFile(manifestPath, "utf8");
    const duplicated = manifest.replace(
      '"manifestVersion": 1,',
      '"manifestVersion": 1,\n  "\\u006danifestVersion": 1,',
    );
    expect(duplicated).not.toBe(manifest);
    await writeFile(manifestPath, duplicated);

    await expect(verifyCryptographyBundle(root)).rejects.toThrow(
      /Duplicate object member "manifestVersion"/u,
    );
  });

  it.each([
    [
      "UTF-8 BOM",
      (bytes) => Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), bytes]),
      /UTF-8 BOM is not permitted/u,
    ],
    [
      "invalid UTF-8",
      (bytes) => Buffer.concat([Buffer.from([0xff]), bytes]),
      /Input is not valid UTF-8/u,
    ],
    [
      "trailing content",
      (bytes) => Buffer.concat([bytes, Buffer.from("\ntrue")]),
      /Unexpected trailing content/u,
    ],
  ])("rejects manifest %s", async (_description, transform, expectedError) => {
    const root = await copyBundleFixture();
    const manifestPath = path.join(root, "cryptography", "manifest.json");
    await writeFile(manifestPath, transform(await readFile(manifestPath)));

    await expect(verifyCryptographyBundle(root)).rejects.toThrow(expectedError);
  });

  it("rejects artifact byte tampering", async () => {
    const root = await copyBundleFixture();
    const artifactPath = path.join(
      root,
      "cryptography",
      "vectors",
      "canonicalization",
      "command.signing.jcs",
    );
    const bytes = await readFile(artifactPath);
    bytes[0] ^= 0x01;
    await writeFile(artifactPath, bytes);

    await expect(verifyCryptographyBundle(root)).rejects.toThrow(
      /command\.signing\.jcs digest mismatch/u,
    );
  });

  it("rejects a semantic manifest mutation", async () => {
    const root = await copyBundleFixture();
    await mutateManifest(root, (manifest) => {
      manifest.semanticStages.push("mutated");
    });

    await expect(verifyCryptographyBundle(root)).rejects.toThrow(
      /cryptography manifest digest mismatch/u,
    );
  });

  it("rejects artifact path traversal", async () => {
    const root = await copyBundleFixture();
    await mutateManifest(root, (manifest) => {
      manifest.artifacts[0].path = "cryptography/../PROTOCOL_PIN.json";
    });

    await expect(verifyCryptographyBundle(root)).rejects.toThrow(
      /unsafe cryptography artifact path/u,
    );
  });

  it("rejects the cryptography README as a digest artifact", async () => {
    const root = await copyBundleFixture();
    await mutateManifest(root, (manifest) => {
      manifest.artifacts[0].path = "cryptography/README.md";
    });

    await expect(verifyCryptographyBundle(root)).rejects.toThrow(
      /README\.md must not be a digest artifact/u,
    );
  });

  it("rejects the cryptography manifest as a digest artifact", async () => {
    const root = await copyBundleFixture();
    await mutateManifest(root, (manifest) => {
      manifest.artifacts[0].path = "cryptography/manifest.json";
    });

    await expect(verifyCryptographyBundle(root)).rejects.toThrow(
      /cryptography\/manifest\.json must not be a digest artifact/u,
    );
  });

  it("rejects symlinked artifacts", async () => {
    const root = await copyBundleFixture();
    const artifactPath = path.join(
      root,
      "cryptography",
      "vectors",
      "canonicalization",
      "command.signing.jcs",
    );
    const realPath = `${artifactPath}.real`;
    await rename(artifactPath, realPath);
    await symlink(path.basename(realPath), artifactPath);

    await expect(verifyCryptographyBundle(root)).rejects.toThrow(
      /must not use symlinks/u,
    );
  });

  it("rejects cryptography pin drift", async () => {
    const root = await copyBundleFixture();
    const pinPath = path.join(root, "PROTOCOL_PIN.json");
    const pin = JSON.parse(await readFile(pinPath, "utf8"));
    pin.cryptography.artifactCount -= 1;
    await writeFile(pinPath, `${JSON.stringify(pin, null, 2)}\n`);

    await expect(verifyCryptographyBundle(root)).rejects.toThrow(
      /unexpected cryptography pin/u,
    );
  });
});

async function copyBundleFixture() {
  const root = await mkdtemp(
    path.join(tmpdir(), "missionweaveprotocol-ts-cryptography-"),
  );
  temporaryRoots.push(root);
  await Promise.all([
    cp(
      path.join(repositoryRoot, "cryptography"),
      path.join(root, "cryptography"),
      {
        recursive: true,
      },
    ),
    cp(path.join(repositoryRoot, "schemas"), path.join(root, "schemas"), {
      recursive: true,
    }),
    cp(
      path.join(repositoryRoot, "PROTOCOL_PIN.json"),
      path.join(root, "PROTOCOL_PIN.json"),
    ),
  ]);
  return root;
}

async function mutateManifest(root, mutate) {
  const manifestPath = path.join(root, "cryptography", "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  mutate(manifest);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}
