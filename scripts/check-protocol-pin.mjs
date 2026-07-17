import path from "node:path";
import { fileURLToPath } from "node:url";

import { verifyProtocolBundle } from "./protocol-bundle.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const result = await verifyProtocolBundle(root);

console.log(
  `Protocol bundle passed: ${result.schemaFiles} schemas, ${result.conformanceFiles} conformance files, ${result.bundleSha256}.`,
);
