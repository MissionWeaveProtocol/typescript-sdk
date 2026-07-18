[English](README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md)
| **日本語** | [Español](README.es.md) | [Français](README.fr.md) |
[Deutsch](README.de.md)

# MissionWeaveProtocol TypeScript SDK

MissionWeaveProtocol の公式 TypeScript SDK です。npm パッケージ名は
<code>@missionweaveprotocol/sdk</code> です。MissionWeaveProtocol
0.1 データの検証、正規化、署名、テストに使用できます。

> この SDK が適合を表明する範囲は **schema-and-vector
> conformance（Schema とテストベクトルへの適合のみ）**です。トランスポートの相互運用性、実行時の振る舞い、エンドツーエンドのプロトコル適合性は表明しません。

## インストール

```bash
npm install @missionweaveprotocol/sdk
```

Node.js 20 以降が必要です。

SDK は Node.js のファイルシステム API と暗号 API を使用するため、ブラウザーおよび Deno のサポートは対象外です。

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

| 項目                 | 固定値                                                        |
| -------------------- | ------------------------------------------------------------- |
| npm パッケージ       | <code>@missionweaveprotocol/sdk@0.1.0</code>                  |
| プロトコルバージョン | <code>0.1</code>                                              |
| Wire namespace       | <code>missionweaveprotocol</code>                             |
| プロトコルコミット   | [`6f10987627d62fb296e3490ceceb5539b1e94b70`][protocol-commit] |
| Schema               | 21                                                            |
| 適合性テストベクトル | 52（valid 25、invalid 27）                                    |

[protocol-commit]:
  https://github.com/missionweaveprotocol/missionweaveprotocol/commit/6f10987627d62fb296e3490ceceb5539b1e94b70

出典、ファイル数、SHA-256 ダイジェストの全情報は
[`PROTOCOL_PIN.json`](PROTOCOL_PIN.json)
に記録されています。SDK はビルド時のチェックで固定成果物を検証し、実行時にネットワークから Schema をダウンロードしません。

## 厳密な JSON と Schema 検証

<code>parseStrictJson</code> と <code>parseStrictJsonObject</code> は
<code>string</code> または <code>Uint8Array</code>
を受け取ります。パーサーは Schema 検証の前に、重複したメンバー名、不正な UTF-8、UTF-8
BOM、末尾の余分なデータ、不正または表現不能な数値、対になっていない Unicode サロゲート、512 層を超えるネストを拒否します。

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
- バイト単位で署名・検証する <code>signBytes</code> と <code>verifyBytes</code>
- <code>signDocument</code>、<code>signatureInput</code>、
  <code>verifyDocumentSignature</code>
- 固定された 9 種類の Signed Document を 6 段階で署名・検証する
  <code>SignedDocumentCodec</code>

<code>SignedDocumentCodec.verify</code> は受信した生の UTF-8 バイトと
<code>KeyResolver</code>
を受け取り、正規化された署名バイトとハッシュ、完全な文書ハッシュ、厳密な保護時刻、解決済みの鍵と Principal の証拠を返します。この結果が証明するのは暗号学的検証だけであり、First
Admission、Command の鮮度、認可は別途検証します。

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

## 適合性テストランナー

プログラムから同梱ベクトルを実行できます。

```ts
import { runConformance } from "@missionweaveprotocol/sdk";

const report = runConformance();
console.log(
  `${report.passed}/${report.total} vectors passed ` +
    `(${report.validCases} valid, ${report.invalidCases} invalid)`,
);

if (report.failed > 0) process.exitCode = 1;
```

インストールされる実行ファイルは、パッケージ同梱の Schema とテストベクトルを実行します。

```bash
npx --package @missionweaveprotocol/sdk missionweaveprotocol-conformance
```

デフォルトの可読出力は次のとおりです。

```text
52/52 conformance vectors passed (25 valid, 27 invalid).
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
- <code>examples/</code>：上記の型チェック済みサンプル
- <code>dist/</code>：ESM、CommonJS、型定義、ソースマップ、CLI
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
- 構築済みの JavaScript オブジェクトには元のバイトが残っていません。<code>SchemaCatalog</code>
  に直接渡すと、以前のパースで失われた重複 JSON キーや不正な入力バイトは検出できません。
- この SDK は、トランスポート、Agent
  Registry、ID 発行、鍵配布、グループ管理、スケジューリング、永続化、再試行、合意形成を提供しません。
- 署名検証の成功は、署名者が信頼できること、またはコマンドが新鮮でリプレイされていないことを意味しません。
- 署名ヘルパーは、鍵生成ポリシー、鍵の保管と検索、信頼判定、失効、タイムスタンプポリシー、リプレイ防止、Session/Membership/lease フェンシングを提供しません。
- JCS 関数は JSON 互換データだけを受け付け、有限でない数値、循環構造、疎な配列、<code>undefined</code>、対になっていない Unicode サロゲートを拒否します。
- <code>SchemaCatalog.load()</code>
  と適合性テストランナーはローカルファイルを同期的に読み取ります。リクエストのホットパスにおける非同期 I/O として扱わないでください。
- 信頼できない署名済みデータは、厳密にパースして Schema を検証した後に署名を検証し、最後に組織固有の認可、ポリシー、状態チェックを適用してください。パース、base64url デコード、署名検証のエラーはすべて拒否として扱います。
- CLI の成功が示すのは、同梱成果物が期待される Schema 結果と一致することだけです。適合範囲は引き続き
  **schema-and-vector conformance only** です。

## 開発

```bash
npm ci
npm run check
npm audit --audit-level=low
```

<code>npm run check</code>
は、リポジトリの命名ポリシー、プロトコルピン、ドキュメント、フォーマット、リント、すべてのサンプル、テスト、ビルド出力、パッケージメタデータ、ESM、CommonJS、リソース、CLI のパック後インストールスモークテストを検証します。

## ライセンス

Apache-2.0。[LICENSE](LICENSE) を参照してください。
