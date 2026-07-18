import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  verifyCryptographyBundle,
  verifyProtocolBundle,
} from "./protocol-bundle.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [protocol, cryptography] = await Promise.all([
  verifyProtocolBundle(root),
  verifyCryptographyBundle(root),
]);

console.log(
  `Protocol bundle passed: ${protocol.schemaFiles} schemas, ${protocol.conformanceFiles} conformance files, ${protocol.bundleSha256}.`,
);
console.log(
  `Cryptography bundle passed: ${cryptography.artifactCount} artifacts, ${cryptography.caseCount} cases, ${cryptography.evaluationCount} evaluations, ${cryptography.artifactDigest}.`,
);
