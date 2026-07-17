import { canonicalJsonBytes } from "./canonical-json.js";
import type { JsonObject } from "./json-types.js";
import { isJsonObject } from "./json-types.js";
import { SchemaCatalog } from "./schema-catalog.js";
import { parseStrictJson } from "./strict-json.js";

export class FrameCodec {
  readonly #catalog: SchemaCatalog;

  public constructor(catalog = SchemaCatalog.load()) {
    this.#catalog = catalog;
  }

  public decode<TFrame extends JsonObject = JsonObject>(
    input: string | Uint8Array,
  ): TFrame {
    const frame = parseStrictJson(input);
    if (!isJsonObject(frame))
      throw new TypeError("A WebSocket frame must be a JSON object");
    this.#catalog.assertValid("websocket-frame.schema.json", frame);
    return frame as TFrame;
  }

  public encode<TFrame extends JsonObject>(frame: TFrame): Uint8Array {
    this.#catalog.assertValid("websocket-frame.schema.json", frame);
    return canonicalJsonBytes(frame);
  }
}
