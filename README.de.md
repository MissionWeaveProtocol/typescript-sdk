[English](README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md)
| [日本語](README.ja.md) | [Español](README.es.md) | [Français](README.fr.md) |
**Deutsch**

# MissionWeaveProtocol TypeScript SDK

Offizielles TypeScript-SDK für MissionWeaveProtocol. Das npm-Paket wird als
<code>@missionweaveprotocol/sdk</code> veröffentlicht.

> Dieses SDK beansprucht ausschließlich **Schema- und Testvektorkonformität**.
> Es beansprucht weder Transportinteroperabilität noch gleiches
> Laufzeitverhalten oder eine durchgängige Protokollkonformität.

## Installation

```bash
npm install @missionweaveprotocol/sdk
```

Erfordert Node.js 20 oder neuer.

Das SDK verwendet die Dateisystem- und Kryptografie-APIs von Node.js; es
beansprucht keine Unterstützung für Browser oder Deno.

## Modulunterstützung

Das Paket stellt ESM- und CommonJS-Einstiegspunkte sowie die zugehörigen
TypeScript-Typdeklarationen bereit.

ESM:

```ts
import {
  SchemaCatalog,
  parseStrictJsonObject,
} from "@missionweaveprotocol/sdk";
```

CommonJS:

```js
const {
  SchemaCatalog,
  parseStrictJsonObject,
} = require("@missionweaveprotocol/sdk");
```

## Protokollkompatibilität

Diese Version ist auf die folgenden MissionWeaveProtocol-Artefakte festgelegt:

| Element                  | Festgelegter Wert                                             |
| ------------------------ | ------------------------------------------------------------- |
| npm-Paket                | <code>@missionweaveprotocol/sdk@0.1.0</code>                  |
| Protokollversion         | <code>0.1</code>                                              |
| Wire namespace           | <code>missionweaveprotocol</code>                             |
| Protokoll-Commit         | [`6f10987627d62fb296e3490ceceb5539b1e94b70`][protocol-commit] |
| Schemas                  | 21                                                            |
| Konformitätstestvektoren | 52 (25 gültig, 27 ungültig)                                   |

[protocol-commit]:
  https://github.com/missionweaveprotocol/missionweaveprotocol/commit/6f10987627d62fb296e3490ceceb5539b1e94b70

Die vollständige Herkunft, Dateianzahlen und SHA-256-Prüfsummen stehen in
[`PROTOCOL_PIN.json`](PROTOCOL_PIN.json). Das SDK prüft die festgelegten
Artefakte während der Build-Prüfungen; zur Laufzeit lädt es keine Schemas aus
dem Netzwerk.

## Striktes JSON und Schemavalidierung

<code>parseStrictJson</code> und <code>parseStrictJsonObject</code> akzeptieren
einen <code>string</code> oder <code>Uint8Array</code>. Vor der
Schemavalidierung verwirft der Parser doppelte Membernamen, ungültiges UTF-8,
eine UTF-8-BOM, nachgestellte Inhalte, ungültige oder nicht darstellbare Zahlen,
ungepaarte Unicode-Surrogate und eine zu tiefe Verschachtelung.

<code>SchemaCatalog</code> erstellt offline Ajv-Draft-2020-12-Validatoren aus
den 21 im Paket festgelegten JSON Schemas:

```ts
import { readFileSync } from "node:fs";

import {
  SchemaCatalog,
  parseStrictJsonObject,
} from "@missionweaveprotocol/sdk";

const command = parseStrictJsonObject(readFileSync("./command.json"));
const catalog = SchemaCatalog.load();

const result = catalog.validate("command.schema.json", command);
if (!result.valid) {
  console.error(result.errors);
}

catalog.assertValid("command.schema.json", command);
```

<code>validate</code> gibt <code>{ valid, errors }</code> zurück.
<code>assertValid</code> löst bei einem Fehler eine
<code>SchemaValidationError</code> mit Ajv-Fehlerdetails aus.

## WebSocket FrameCodec

<code>FrameCodec</code> dekodiert striktes JSON, validiert Frames mit
<code>websocket-frame.schema.json</code> und kodiert sie als kanonische
RFC-8785-JCS-Bytes:

```ts
import { readFileSync } from "node:fs";

import { FrameCodec } from "@missionweaveprotocol/sdk";

const codec = new FrameCodec();
const frame = codec.decode(readFileSync("./frame.json"));
const canonicalBytes = codec.encode(frame);
```

Der Codec verarbeitet nur vollständige JSON-Frames. Netzwerkverbindungen,
Wiederverbindungen, Abonnementzustand oder partielle Streaming-Frames
implementiert er nicht.

## JCS, SHA-256 und Ed25519

Das SDK bietet:

- <code>canonicalizeJson</code> und <code>canonicalJsonBytes</code> für
  RFC-8785-JCS-Ausgaben;
- <code>sha256Hex</code> und <code>sha256Identifier</code>;
- strikte Base64url-Kodierung und -Dekodierung ohne Padding;
- Ed25519-Signierung und -Verifikation mit Node.js-Schlüsseln;
- <code>signDocument</code>, <code>signatureInput</code> und
  <code>verifyDocumentSignature</code>.

```ts
import { readFileSync } from "node:fs";

import {
  canonicalizeJson,
  parseStrictJsonObject,
  signDocument,
  verifyDocumentSignature,
} from "@missionweaveprotocol/sdk";

const command = parseStrictJsonObject(readFileSync("./unsigned-command.json"));
const signedCommand = signDocument(
  command,
  readFileSync("./ed25519-private.pem"),
  {
    createdAt: "2026-07-17T00:00:00Z",
    keyId: "urn:missionweaveprotocol:key:coordinator",
  },
);

const verified = verifyDocumentSignature(
  signedCommand,
  readFileSync("./ed25519-public.pem"),
);

console.log(verified, canonicalizeJson(signedCommand));
```

Die Signaturdaten bestehen aus den JCS-Bytes nach dem Entfernen des
<code>signature</code>-Members auf oberster Ebene.
<code>verifyDocumentSignature</code> führt nur die kryptografische Verifikation
aus. Die Anwendung muss Schema, Schlüsselidentität, Vertrauen, Widerruf,
Aktualität und Replay-Schutz separat prüfen.

## Konformitäts-CLI

Die installierte ausführbare Datei verarbeitet die im Paket enthaltenen Schemas
und Testvektoren:

```bash
npx --package @missionweaveprotocol/sdk missionweaveprotocol-conformance
```

Die standardmäßige menschenlesbare Ausgabe lautet:

```text
52/52 conformance vectors passed (25 valid, 27 invalid).
```

JSON-Ausgabe:

```bash
npx --package @missionweaveprotocol/sdk missionweaveprotocol-conformance --json
```

Einen anderen lokalen Artefaktstamm validieren:

```bash
npx --package @missionweaveprotocol/sdk missionweaveprotocol-conformance --root /path/to/bundle
```

Das mit <code>--root</code> angegebene Verzeichnis muss kompatible
<code>schemas/</code>, eine <code>conformance/manifest.json</code> und
Testvektoren enthalten. Ein Fehler oder eine ungültige Konfiguration erzeugt
einen Exit-Code ungleich null.

## Paketressourcen

Der Stamm des veröffentlichten Pakets enthält:

- <code>schemas/</code>: die 21 festgelegten normativen Schemas;
- <code>conformance/manifest.json</code> und <code>conformance/vectors/</code>:
  die festgelegten Testvektoren;
- <code>PROTOCOL_PIN.json</code>: den Upstream-Commit und die
  Artefaktprüfsummen;
- <code>LICENSE</code> und die lokalisierten README-Dateien.

Mit <code>packageRoot()</code> lassen sich diese Dateien ermitteln:

```ts
import path from "node:path";

import { packageRoot } from "@missionweaveprotocol/sdk";

const schemasDirectory = path.join(packageRoot(), "schemas");
```

Diese Ressourcen sind Dateisystemartefakte und keine JavaScript-Unterpfade in
<code>exports</code>.

## Sicherheits- und Verhaltensgrenzen

- Die Schemavalidierung bestätigt die JSON-Struktur, nicht Autorisierung,
  Geschäftssemantik, Zustandsübergänge oder die Sicherheit einer Operation.
- Dieses SDK bietet keinen Transport, keine Agent Registry,
  Identitätsausstellung, Schlüsselverteilung, Gruppenverwaltung, Ablaufplanung,
  Persistenz, Wiederholungsversuche oder Konsensfindung.
- Eine gültige Signatur beweist weder, dass der Unterzeichner vertrauenswürdig
  ist, noch dass ein Befehl aktuell ist oder nicht erneut abgespielt wurde.
- JCS-Funktionen akzeptieren nur JSON-kompatible Daten und verwerfen nicht
  endliche Zahlen, Zyklen, dünn besetzte Arrays, <code>undefined</code> und
  ungepaarte Unicode-Surrogate.
- <code>SchemaCatalog.load()</code> und der Konformitätsrunner lesen lokale
  Dateien synchron. Sie sind nicht als asynchrone E/A im kritischen Anfragepfad
  zu behandeln.
- Nicht vertrauenswürdige Daten sollten zuerst strikt als JSON geparst, dann
  gegen das Schema validiert und anschließend durch die Autorisierungs-,
  Richtlinien- und Zustandsprüfungen der eigenen Organisation verarbeitet
  werden.
- Ein erfolgreicher CLI-Lauf zeigt nur, dass die enthaltenen Artefakte die
  erwarteten Schemaergebnisse liefern. Der Geltungsbereich bleibt auf die
  **Schema- und Testvektorkonformität** beschränkt.

## Entwicklung

```bash
npm ci
npm run check
```

## Lizenz

Apache-2.0. Siehe [LICENSE](LICENSE).
