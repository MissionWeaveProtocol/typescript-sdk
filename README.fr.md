[English](README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md)
| [日本語](README.ja.md) | [Español](README.es.md) | [Français](README.fr.md) |
[Deutsch](README.de.md)

# SDK TypeScript MissionWeaveProtocol

SDK TypeScript officiel de MissionWeaveProtocol. Le paquet npm est publié sous
le nom <code>@missionweaveprotocol/sdk</code>.

> Ce SDK revendique uniquement **schema-and-vector conformance only (conformité
> aux schémas et aux vecteurs de test)**. Il ne revendique ni l’interopérabilité
> du transport, ni l’équivalence des comportements à l’exécution, ni la
> conformité de bout en bout au protocole.

## Installation

```bash
npm install @missionweaveprotocol/sdk
```

Node.js 20 ou une version ultérieure est requis.

## Prise en charge des modules

Le paquet fournit des points d’entrée ESM et CommonJS, ainsi que les
déclarations de types TypeScript correspondantes.

ESM :

```ts
import {
  SchemaCatalog,
  parseStrictJsonObject,
} from "@missionweaveprotocol/sdk";
```

CommonJS :

```js
const {
  SchemaCatalog,
  parseStrictJsonObject,
} = require("@missionweaveprotocol/sdk");
```

## Compatibilité du protocole

Cette version est épinglée aux artefacts MissionWeaveProtocol suivants :

| Élément                | Valeur épinglée                                       |
| ---------------------- | ----------------------------------------------------- |
| Paquet npm             | <code>@missionweaveprotocol/sdk@0.1.0</code>          |
| Version du protocole   | <code>0.1</code>                                      |
| Wire namespace         | <code>missionweaveprotocol</code>                     |
| Commit du protocole    | <code>00964ea9064cbf1f0eca8af21a0c57367ee14752</code> |
| Schémas                | 21                                                    |
| Vecteurs de conformité | 43 (22 valides et 21 non valides)                     |

La provenance complète, le nombre de fichiers et les empreintes SHA-256 sont
consignés dans <code>PROTOCOL_PIN.json</code>. Le SDK vérifie les artefacts
épinglés pendant les contrôles de compilation ; il ne télécharge pas les schémas
depuis le réseau à l’exécution.

## JSON strict et validation des schémas

<code>parseStrictJson</code> et <code>parseStrictJsonObject</code> acceptent une
<code>string</code> ou un <code>Uint8Array</code>. Avant la validation du
schéma, l’analyseur rejette les noms de membres dupliqués, l’UTF-8 invalide, le
BOM UTF-8, les données supplémentaires, les nombres invalides ou non
représentables, les substituts Unicode non appariés et une imbrication
excessive.

<code>SchemaCatalog</code> construit hors ligne des validateurs Ajv Draft
2020-12 à partir des 21 JSON Schema épinglés dans le paquet :

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

<code>validate</code> renvoie <code>{ valid, errors }</code>.
<code>assertValid</code> lève une <code>SchemaValidationError</code> avec le
détail des erreurs Ajv en cas d’échec.

## WebSocket FrameCodec

<code>FrameCodec</code> décode du JSON strict, valide chaque frame avec
<code>websocket-frame.schema.json</code>, puis l’encode en octets canoniques RFC
8785 JCS :

```ts
import { readFileSync } from "node:fs";

import { FrameCodec } from "@missionweaveprotocol/sdk";

const codec = new FrameCodec();
const frame = codec.decode(readFileSync("./frame.json"));
const canonicalBytes = codec.encode(frame);
```

Le codec traite uniquement des frames JSON complets. Il n’implémente ni
connexion réseau, ni reconnexion, ni état des abonnements, ni frames de
streaming partiels.

## JCS, SHA-256 et Ed25519

Le SDK fournit :

- <code>canonicalizeJson</code> et <code>canonicalJsonBytes</code> pour produire
  du RFC 8785 JCS ;
- <code>sha256Hex</code> et <code>sha256Identifier</code> ;
- un encodage et décodage base64url strict, sans remplissage ;
- la signature et la vérification Ed25519 avec des clés Node.js ;
- <code>signDocument</code>, <code>signatureInput</code> et
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

L’entrée de signature correspond aux octets JCS obtenus après suppression du
membre <code>signature</code> de premier niveau.
<code>verifyDocumentSignature</code> effectue uniquement la vérification
cryptographique ; l’application doit encore vérifier le schéma, l’identité et la
confiance de la clé, la révocation, la fraîcheur et la protection contre le
rejeu.

## CLI de conformité

L’exécutable installé traite les schémas et les vecteurs de test fournis dans le
paquet :

```bash
npx --package @missionweaveprotocol/sdk missionweaveprotocol-conformance
```

La sortie lisible par défaut est :

```text
43/43 conformance vectors passed (22 valid, 21 invalid).
```

Pour obtenir du JSON :

```bash
npx --package @missionweaveprotocol/sdk missionweaveprotocol-conformance --json
```

Pour valider une autre racine locale d’artefacts :

```bash
npx --package @missionweaveprotocol/sdk missionweaveprotocol-conformance --root /path/to/bundle
```

Le répertoire indiqué par <code>--root</code> doit contenir des
<code>schemas/</code>, un <code>conformance/manifest.json</code> et des vecteurs
compatibles. Un échec ou une erreur de configuration produit un code de sortie
non nul.

## Ressources du paquet

La racine du paquet publié contient :

- <code>schemas/</code> : les 21 schémas normatifs épinglés ;
- <code>conformance/manifest.json</code> et <code>conformance/vectors/</code> :
  les vecteurs de test épinglés ;
- <code>PROTOCOL_PIN.json</code> : le commit amont et les empreintes des
  artefacts ;
- <code>LICENSE</code> et les README traduits.

Utilisez <code>packageRoot()</code> pour localiser ces fichiers :

```ts
import path from "node:path";

import { packageRoot } from "@missionweaveprotocol/sdk";

const schemasDirectory = path.join(packageRoot(), "schemas");
```

Ces ressources sont des artefacts du système de fichiers, pas des sous-chemins
JavaScript de <code>exports</code>.

## Limites de sécurité et de comportement

- La validation d’un schéma confirme la structure JSON, pas l’autorisation, la
  sémantique métier, les transitions d’état ou la sûreté d’une opération.
- Ce SDK ne fournit ni transport, ni Agent Registry, ni émission d’identités, ni
  distribution de clés, ni gestion de groupes, ni ordonnancement, ni
  persistance, ni nouvelles tentatives, ni consensus.
- Une signature valide ne prouve pas que le signataire est digne de confiance,
  ni qu’une commande est encore fraîche ou n’a pas été rejouée.
- Les fonctions JCS acceptent uniquement des données compatibles avec JSON et
  rejettent les nombres non finis, les cycles, les tableaux creux,
  <code>undefined</code> et les substituts Unicode non appariés.
- <code>SchemaCatalog.load()</code> et l’exécuteur de conformité lisent les
  fichiers locaux de façon synchrone ; ne les considérez pas comme des E/S
  asynchrones sur le chemin critique d’une requête.
- Pour les données non fiables, utilisez d’abord l’analyseur JSON strict,
  validez ensuite le schéma, puis appliquez les contrôles d’autorisation, de
  politique et d’état propres à votre organisation.
- Le succès du CLI indique uniquement que les artefacts inclus produisent les
  résultats de schéma attendus. La portée reste **schema-and-vector conformance
  only**.

## Développement

```bash
npm ci
npm run check
```

## Licence

Apache-2.0. Voir [LICENSE](LICENSE).
