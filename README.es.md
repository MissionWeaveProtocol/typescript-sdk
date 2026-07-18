[English](README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md)
| [日本語](README.ja.md) | [Español](README.es.md) | [Français](README.fr.md) |
[Deutsch](README.de.md)

# SDK de TypeScript de MissionWeaveProtocol

SDK oficial de TypeScript para MissionWeaveProtocol. El paquete npm se publica
como <code>@missionweaveprotocol/sdk</code>.

> Este SDK declara únicamente **conformidad con esquemas y vectores de prueba**.
> No declara interoperabilidad del transporte, equivalencia del comportamiento
> en ejecución ni conformidad integral del protocolo.

## Instalación

```bash
npm install @missionweaveprotocol/sdk
```

Requiere Node.js 20 o una versión posterior.

## Compatibilidad de módulos

El paquete incluye puntos de entrada ESM y CommonJS, junto con sus declaraciones
de tipos de TypeScript.

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

## Compatibilidad del protocolo

Esta versión está fijada a los siguientes artefactos de MissionWeaveProtocol:

| Elemento                | Valor fijado                                          |
| ----------------------- | ----------------------------------------------------- |
| Paquete npm             | <code>@missionweaveprotocol/sdk@0.1.0</code>          |
| Versión del protocolo   | <code>0.1</code>                                      |
| Wire namespace          | <code>missionweaveprotocol</code>                     |
| Commit del protocolo    | <code>6f10987627d62fb296e3490ceceb5539b1e94b70</code> |
| Esquemas                | 21                                                    |
| Vectores de conformidad | 52 (25 válidos y 27 no válidos)                       |

La procedencia completa, los recuentos de archivos y los resúmenes SHA-256 están
registrados en <code>PROTOCOL_PIN.json</code>. El SDK verifica los artefactos
fijados durante las comprobaciones de compilación; no descarga esquemas de la
red durante la ejecución.

## JSON estricto y validación de esquemas

<code>parseStrictJson</code> y <code>parseStrictJsonObject</code> aceptan un
<code>string</code> o un <code>Uint8Array</code>. Antes de validar el esquema,
el analizador rechaza nombres de miembros duplicados, UTF-8 no válido, un BOM
UTF-8, contenido adicional, números no válidos o no representables, sustitutos
Unicode sin pareja y un anidamiento excesivo.

<code>SchemaCatalog</code> crea validadores Ajv Draft 2020-12 sin conexión a
partir de los 21 JSON Schema fijados en el paquete:

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

<code>validate</code> devuelve <code>{ valid, errors }</code>.
<code>assertValid</code> lanza <code>SchemaValidationError</code> con los
detalles de Ajv cuando la validación falla.

## WebSocket FrameCodec

<code>FrameCodec</code> decodifica JSON estricto, valida cada frame con
<code>websocket-frame.schema.json</code> y lo codifica como bytes canónicos RFC
8785 JCS:

```ts
import { readFileSync } from "node:fs";

import { FrameCodec } from "@missionweaveprotocol/sdk";

const codec = new FrameCodec();
const frame = codec.decode(readFileSync("./frame.json"));
const canonicalBytes = codec.encode(frame);
```

El códec procesa únicamente frames JSON completos. No implementa conexiones de
red, reconexión, estado de suscripciones ni frames de streaming parciales.

## JCS, SHA-256 y Ed25519

El SDK proporciona:

- <code>canonicalizeJson</code> y <code>canonicalJsonBytes</code> para producir
  RFC 8785 JCS;
- <code>sha256Hex</code> y <code>sha256Identifier</code>;
- codificación y decodificación base64url estricta y sin relleno;
- firma y verificación Ed25519 con claves de Node.js;
- <code>signDocument</code>, <code>signatureInput</code> y
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

La entrada de la firma son los bytes JCS obtenidos después de quitar el miembro
<code>signature</code> de nivel superior. <code>verifyDocumentSignature</code>
solo realiza una verificación criptográfica; la aplicación debe validar por
separado el esquema, la identidad y confianza de la clave, la revocación, la
vigencia y la protección contra repetición.

## CLI de conformidad

El ejecutable instalado procesa los esquemas y vectores de prueba incluidos en
el paquete:

```bash
npx --package @missionweaveprotocol/sdk missionweaveprotocol-conformance
```

La salida predeterminada para personas es:

```text
52/52 conformance vectors passed (25 valid, 27 invalid).
```

Para obtener JSON:

```bash
npx --package @missionweaveprotocol/sdk missionweaveprotocol-conformance --json
```

Para validar otra raíz local de artefactos:

```bash
npx --package @missionweaveprotocol/sdk missionweaveprotocol-conformance --root /path/to/bundle
```

El directorio indicado con <code>--root</code> debe contener
<code>schemas/</code>, <code>conformance/manifest.json</code> y vectores
compatibles. Un fallo o error de configuración produce un código de salida
distinto de cero.

## Recursos del paquete

La raíz del paquete publicado contiene:

- <code>schemas/</code>: los 21 esquemas normativos fijados;
- <code>conformance/manifest.json</code> y <code>conformance/vectors/</code>:
  los vectores de prueba fijados;
- <code>PROTOCOL_PIN.json</code>: el commit de origen y los resúmenes de los
  artefactos;
- <code>LICENSE</code> y los README localizados.

Use <code>packageRoot()</code> para localizar estos archivos:

```ts
import path from "node:path";

import { packageRoot } from "@missionweaveprotocol/sdk";

const schemasDirectory = path.join(packageRoot(), "schemas");
```

Estos recursos son artefactos del sistema de archivos, no subrutas JavaScript de
<code>exports</code>.

## Límites de seguridad y comportamiento

- La validación de esquemas confirma la estructura JSON, no la autorización, la
  semántica de negocio, las transiciones de estado ni la seguridad de una
  operación.
- Este SDK no proporciona transporte, Agent Registry, emisión de identidades,
  distribución de claves, gestión de grupos, planificación, persistencia,
  reintentos ni consenso.
- Una firma válida no demuestra que el firmante sea de confianza ni que un
  comando esté vigente o no se haya repetido.
- Las funciones JCS solo aceptan datos compatibles con JSON y rechazan números
  no finitos, ciclos, arrays dispersos, <code>undefined</code> y sustitutos
  Unicode sin pareja.
- <code>SchemaCatalog.load()</code> y el ejecutor de conformidad leen archivos
  locales de forma síncrona; no deben tratarse como E/S asíncrona en la ruta
  crítica de una solicitud.
- Para datos no confiables, primero use el analizador JSON estricto, después
  valide el esquema y, por último, aplique las comprobaciones de autorización,
  políticas y estado de su organización.
- El éxito del CLI solo indica que los artefactos incluidos producen los
  resultados de esquema esperados. El alcance sigue limitado a la **conformidad
  con esquemas y vectores de prueba**.

## Desarrollo

```bash
npm ci
npm run check
```

## Licencia

Apache-2.0. Consulte [LICENSE](LICENSE).
