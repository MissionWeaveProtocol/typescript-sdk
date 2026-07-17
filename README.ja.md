[English](README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md)
| [日本語](README.ja.md) | [Español](README.es.md) | [Français](README.fr.md) |
[Deutsch](README.de.md)

# MissionWeaveProtocol TypeScript SDK

MissionWeaveProtocol の公式 TypeScript SDK です。npm パッケージ名は
<code>@missionweaveprotocol/sdk</code> です。

> この SDK が適合を表明する範囲は **schema-and-vector conformance
> only（Schema とテストベクトルへの適合のみ）**です。トランスポートの相互運用性、実行時の振る舞い、エンドツーエンドのプロトコル適合性は表明しません。

## インストール

```bash
npm install @missionweaveprotocol/sdk
```

Node.js 20 以降が必要です。

## モジュール対応

このパッケージは ESM と CommonJS の両方、および対応する TypeScript 型宣言を提供します。

ESM：

```ts
import {
  SchemaCatalog,
  parseStrictJsonObject,
} from "@missionweaveprotocol/sdk";
```

CommonJS：

```js
const {
  SchemaCatalog,
  parseStrictJsonObject,
} = require("@missionweaveprotocol/sdk");
```

## プロトコル互換性

このリリースは、次の MissionWeaveProtocol 成果物に固定されています。

| 項目                 | 固定値                                                |
| -------------------- | ----------------------------------------------------- |
| npm パッケージ       | <code>@missionweaveprotocol/sdk@0.1.0</code>          |
| プロトコルバージョン | <code>0.1</code>                                      |
| Wire namespace       | <code>missionweaveprotocol</code>                     |
| プロトコルコミット   | <code>00964ea9064cbf1f0eca8af21a0c57367ee14752</code> |
| Schema               | 21                                                    |
| 適合性テストベクトル | 43（valid 22、invalid 21）                            |

出典、ファイル数、SHA-256 ダイジェストの全情報は <code>PROTOCOL_PIN.json</code>
に記録されています。SDK はビルド時のチェックで固定成果物を検証し、実行時にネットワークから Schema をダウンロードしません。

## 厳密な JSON と Schema 検証

<code>parseStrictJson</code> と <code>parseStrictJsonObject</code> は
<code>string</code> または <code>Uint8Array</code>
を受け取ります。パーサーは Schema 検証の前に、重複したメンバー名、不正な UTF-8、UTF-8
BOM、末尾の余分なデータ、不正または表現不能な数値、対になっていない Unicode サロゲート、深すぎるネストを拒否します。

<code>SchemaCatalog</code> は、パッケージに固定された 21 個の JSON
Schema からオフラインの Ajv Draft 2020-12 バリデーターを構築します。

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

<code>validate</code> は <code>{ valid, errors }</code> を返します。
<code>assertValid</code> は失敗時に Ajv のエラー詳細を含む
<code>SchemaValidationError</code> をスローします。

## WebSocket FrameCodec

<code>FrameCodec</code> は厳密な JSON としてデコードし、
<code>websocket-frame.schema.json</code> で Frame を検証し、RFC 8785
JCS の正規化バイトとしてエンコードします。

```ts
import { readFileSync } from "node:fs";

import { FrameCodec } from "@missionweaveprotocol/sdk";

const codec = new FrameCodec();
const frame = codec.decode(readFileSync("./frame.json"));
const canonicalBytes = codec.encode(frame);
```

このコーデックが扱うのは完全な JSON
Frame だけです。ネットワーク接続、再接続、購読状態、部分的なストリーミング Frame は実装しません。

## JCS、SHA-256、Ed25519

この SDK は次を提供します。

- RFC 8785 JCS 出力用の <code>canonicalizeJson</code> と
  <code>canonicalJsonBytes</code>
- <code>sha256Hex</code> と <code>sha256Identifier</code>
- 厳密なパディングなし base64url エンコード／デコード
- Node.js の鍵を使用する Ed25519 署名／検証
- <code>signDocument</code>、<code>signatureInput</code>、
  <code>verifyDocumentSignature</code>

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

署名入力は、トップレベルの <code>signature</code>
メンバーを取り除いた文書の JCS バイトです。<code>verifyDocumentSignature</code>
が行うのは暗号学的検証だけです。呼び出し側は Schema、鍵のアイデンティティ、信頼、失効、鮮度、リプレイ防止ポリシーを別途検証する必要があります。

## 適合性テスト CLI

インストールされる実行ファイルは、パッケージ同梱の Schema とテストベクトルを実行します。

```bash
npx --package @missionweaveprotocol/sdk missionweaveprotocol-conformance
```

デフォルトの可読出力は次のとおりです。

```text
43/43 conformance vectors passed (22 valid, 21 invalid).
```

JSON 出力：

```bash
npx --package @missionweaveprotocol/sdk missionweaveprotocol-conformance --json
```

別のローカル成果物ルートを検証：

```bash
npx --package @missionweaveprotocol/sdk missionweaveprotocol-conformance --root /path/to/bundle
```

<code>--root</code> ディレクトリには、互換性のある
<code>schemas/</code>、<code>conformance/manifest.json</code>、テストベクトルが必要です。失敗または構成エラーがあれば終了コードは 0 以外になります。

## パッケージ内リソース

公開パッケージのルートには次が含まれます。

- <code>schemas/</code>：固定された 21 個の規範 Schema
- <code>conformance/manifest.json</code> と
  <code>conformance/vectors/</code>：固定されたテストベクトル
- <code>PROTOCOL_PIN.json</code>：上流コミットと成果物ダイジェスト
- <code>LICENSE</code> とローカライズされた README

<code>packageRoot()</code> でこれらのファイルを特定できます。

```ts
import path from "node:path";

import { packageRoot } from "@missionweaveprotocol/sdk";

const schemasDirectory = path.join(packageRoot(), "schemas");
```

これらはファイルシステム上の成果物であり、<code>exports</code>
の JavaScript サブパスではありません。

## セキュリティと振る舞いの境界

- Schema 検証が確認するのは JSON の構造です。認可、ビジネス上の意味、状態遷移、操作の安全性は確認しません。
- この SDK は、トランスポート、Agent
  Registry、ID 発行、鍵配布、グループ管理、スケジューリング、永続化、再試行、合意形成を提供しません。
- 署名検証の成功は、署名者が信頼できること、またはコマンドが新鮮でリプレイされていないことを意味しません。
- JCS 関数は JSON 互換データだけを受け付け、有限でない数値、循環構造、疎な配列、<code>undefined</code>、対になっていない Unicode サロゲートを拒否します。
- <code>SchemaCatalog.load()</code>
  と適合性テストランナーはローカルファイルを同期的に読み取ります。リクエストのホットパスにおける非同期 I/O として扱わないでください。
- 信頼できないデータは、最初に厳密な JSON として解析し、次に Schema を検証してから、組織固有の認可、ポリシー、状態チェックを適用してください。
- CLI の成功が示すのは、同梱成果物が期待される Schema 結果と一致することだけです。適合範囲は引き続き
  **schema-and-vector conformance only** です。

## 開発

```bash
npm ci
npm run check
```

## ライセンス

Apache-2.0。[LICENSE](LICENSE) を参照してください。
