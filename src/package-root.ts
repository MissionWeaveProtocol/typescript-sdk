import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function packageRoot(metaUrl = import.meta.url): string {
  let candidate = path.dirname(fileURLToPath(metaUrl));
  for (let depth = 0; depth < 4; depth += 1) {
    if (existsSync(path.join(candidate, "PROTOCOL_PIN.json"))) return candidate;
    const parent = path.dirname(candidate);
    if (parent === candidate) break;
    candidate = parent;
  }
  throw new Error(
    `Cannot locate the MissionWeaveProtocol bundle from ${metaUrl}`,
  );
}
