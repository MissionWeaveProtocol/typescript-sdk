[English](README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md)
| [日本語](README.ja.md) | [Español](README.es.md) | [Français](README.fr.md) |
**Deutsch**

# MissionWeaveProtocol TypeScript SDK

Offizielles TypeScript-SDK für MissionWeaveProtocol. Das npm-Paket wird als
<code>@missionweaveprotocol/sdk</code> veröffentlicht. Es validiert,
kanonisiert, signiert und testet MissionWeaveProtocol-0.1-Daten.

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
| Protokoll-Commit         | [`33e47ad8a7318f942de77fb72dbb054d85881b40`][protocol-commit] |
| Schemas                  | 21                                                            |
| Konformitätstestvektoren | 56 (26 gültig, 30 ungültig)                                   |

[protocol-commit]:
  https://github.com/missionweaveprotocol/missionweaveprotocol/commit/33e47ad8a7318f942de77fb72dbb054d85881b40

Die vollständige Herkunft, Dateianzahlen und SHA-256-Prüfsummen stehen in
[`PROTOCOL_PIN.json`](PROTOCOL_PIN.json). Das SDK prüft die festgelegten
Artefakte während der Build-Prüfungen; zur Laufzeit lädt es keine Schemas aus
dem Netzwerk.

## Striktes JSON und Schemavalidierung

<code>parseStrictJson</code> und <code>parseStrictJsonObject</code> akzeptieren
einen <code>string</code> oder <code>Uint8Array</code>. Vor der
Schemavalidierung verwirft der Parser doppelte Membernamen, ungültiges UTF-8,
eine UTF-8-BOM, nachgestellte Inhalte, ungültige oder nicht darstellbare Zahlen,
ungepaarte Unicode-Surrogate und eine Verschachtelung von mehr als 512 Ebenen.

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
- <code>signBytes</code> und <code>verifyBytes</code> zum Signieren und Prüfen
  von Bytes;
- <code>signDocument</code>, <code>signatureInput</code> und
  <code>verifyDocumentSignature</code>;
- <code>SignedDocumentCodec</code> zum sechsstufigen Signieren und Prüfen der
  neun fest definierten Signed-Document-Typen.

<code>SignedDocumentCodec.verify</code> erhält die rohen UTF-8-Bytes und einen
<code>KeyResolver</code>. Das Ergebnis enthält kanonische Signaturbytes und
-Hash, den Hash des vollständigen Dokuments, die exakte geschützte Zeit sowie
Nachweise zum aufgelösten Schlüssel und Principal. Es belegt nur die
kryptografische Verifikation; First-Admission Record, Command-Aktualität und
Autorisierung bleiben getrennte Prüfungen.

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

## Konformitätsrunner

Die enthaltenen Vektoren lassen sich auch programmgesteuert ausführen:

```ts
import { runConformance } from "@missionweaveprotocol/sdk";

const report = runConformance();
console.log(
  `${report.passed}/${report.total} vectors passed ` +
    `(${report.validCases} valid, ${report.invalidCases} invalid)`,
);

if (report.failed > 0) process.exitCode = 1;
```

Die installierte ausführbare Datei verarbeitet die im Paket enthaltenen Schemas
und Testvektoren:

```bash
npx --package @missionweaveprotocol/sdk missionweaveprotocol-conformance
```

Die standardmäßige menschenlesbare Ausgabe lautet:

```text
56/56 conformance vectors passed (26 valid, 30 invalid).
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
- <code>examples/</code>: die oben gezeigten typgeprüften Beispiele;
- <code>dist/</code>: ESM, CommonJS, Deklarationen, Source Maps und die CLI;
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
- Ein bereits erstelltes JavaScript-Objekt enthält die ursprünglichen Bytes
  nicht mehr. Bei direkter Übergabe an <code>SchemaCatalog</code> sind doppelte
  JSON-Schlüssel oder ungültige Bytes aus einem früheren Parse-Vorgang nicht
  mehr erkennbar.
- Dieses SDK bietet keinen Transport, keine Agent Registry,
  Identitätsausstellung, Schlüsselverteilung, Gruppenverwaltung, Ablaufplanung,
  Persistenz, Wiederholungsversuche oder Konsensfindung.
- Eine gültige Signatur beweist weder, dass der Unterzeichner vertrauenswürdig
  ist, noch dass ein Befehl aktuell ist oder nicht erneut abgespielt wurde.
- Die Signaturhilfen liefern keine Richtlinien für Schlüsselerzeugung,
  Schlüsselspeicherung oder Schlüsselerkennung, keine Vertrauensentscheidung,
  keinen Widerruf, keine Zeitstempelrichtlinie, keinen Replay-Schutz und kein
  Session-/Membership-/Lease-Fencing.
- JCS-Funktionen akzeptieren nur JSON-kompatible Daten und verwerfen nicht
  endliche Zahlen, Zyklen, dünn besetzte Arrays, <code>undefined</code> und
  ungepaarte Unicode-Surrogate.
- <code>SchemaCatalog.load()</code> und der Konformitätsrunner lesen lokale
  Dateien synchron. Sie sind nicht als asynchrone E/A im kritischen Anfragepfad
  zu behandeln.
- Nicht vertrauenswürdige signierte Daten sollten zuerst strikt geparst und
  gegen das Schema validiert werden. Danach folgen die Signaturprüfung sowie die
  Autorisierungs-, Richtlinien- und Zustandsprüfungen der eigenen Organisation.
  Parse-, Base64url-Dekodier- oder Verifikationsfehler bedeuten stets eine
  Ablehnung.
- Ein erfolgreicher CLI-Lauf zeigt nur, dass die enthaltenen Artefakte die
  erwarteten Schemaergebnisse liefern. Der Geltungsbereich bleibt auf die
  **Schema- und Testvektorkonformität** beschränkt.

## Entwicklung

```bash
npm ci
npm run check
npm audit --audit-level=low
```

<code>npm run check</code> prüft Namensrichtlinie, Protokoll-Pin, Dokumentation,
Formatierung, Linting, alle Beispiele, Tests, Build-Ausgaben, Paketmetadaten und
eine Installation des gepackten Pakets mit ESM, CommonJS, Ressourcen und CLI.

## Lizenz

Apache-2.0. Siehe [LICENSE](LICENSE).
