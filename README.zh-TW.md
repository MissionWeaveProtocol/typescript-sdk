[English](README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md)
| [日本語](README.ja.md) | [Español](README.es.md) | [Français](README.fr.md) |
[Deutsch](README.de.md)

# MissionWeaveProtocol TypeScript SDK

MissionWeaveProtocol 官方 TypeScript SDK。npm 套件名稱為
<code>@missionweaveprotocol/sdk</code>。

> 本 SDK 僅聲明達到 **schema-and-vector conformance
> only（僅 Schema 與測試向量一致性）**。它並不聲明傳輸層互通性、執行期行為一致性或端對端協定一致性。

## 安裝

```bash
npm install @missionweaveprotocol/sdk
```

需要 Node.js 20 或更新版本。

## 模組支援

本套件同時提供 ESM、CommonJS 和對應的 TypeScript 型別宣告。

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

## 協定相容性

此版本固定到以下 MissionWeaveProtocol 成品：

| 項目           | 固定值                                                |
| -------------- | ----------------------------------------------------- |
| npm 套件       | <code>@missionweaveprotocol/sdk@0.1.0</code>          |
| 協定版本       | <code>0.1</code>                                      |
| Wire namespace | <code>missionweaveprotocol</code>                     |
| 協定提交       | <code>00964ea9064cbf1f0eca8af21a0c57367ee14752</code> |
| Schema         | 21 個                                                 |
| 一致性測試向量 | 43 個（22 個有效，21 個無效）                         |

完整來源、檔案數量和 SHA-256 摘要記錄在
<code>PROTOCOL_PIN.json</code>。SDK 會在建置檢查期間驗證固定成品；執行時不會從網路下載 Schema。

## 嚴格 JSON 與 Schema 驗證

<code>parseStrictJson</code> 和 <code>parseStrictJsonObject</code> 接受
<code>string</code> 或
<code>Uint8Array</code>。解析器會在 Schema 驗證前拒絕重複成員名稱、無效 UTF-8、UTF-8
BOM、尾隨內容、無效或無法表示的數字、未成對的 Unicode 代理字元，以及過深的巢狀結構。

<code>SchemaCatalog</code> 從套件內固定的 21 個 JSON Schema 建立離線 Ajv Draft
2020-12 驗證器：

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

<code>validate</code> 回傳 <code>{ valid, errors }</code>；
<code>assertValid</code> 失敗時會拋出包含 Ajv 錯誤細節的
<code>SchemaValidationError</code>。

## WebSocket FrameCodec

<code>FrameCodec</code> 使用嚴格 JSON 解碼，依
<code>websocket-frame.schema.json</code> 驗證 Frame，並以 RFC 8785
JCS 正規化位元組進行編碼：

```ts
import { readFileSync } from "node:fs";

import { FrameCodec } from "@missionweaveprotocol/sdk";

const codec = new FrameCodec();
const frame = codec.decode(readFileSync("./frame.json"));
const canonicalBytes = codec.encode(frame);
```

此編解碼器只處理完整 JSON
Frame；不實作網路連線、重新連線、訂閱狀態或部分串流 Frame。

## JCS、SHA-256 與 Ed25519

本 SDK 提供：

- <code>canonicalizeJson</code> 和 <code>canonicalJsonBytes</code>，用於 RFC
  8785 JCS 輸出；
- <code>sha256Hex</code> 和 <code>sha256Identifier</code>；
- 嚴格且無填補的 base64url 編解碼；
- 使用 Node.js 金鑰的 Ed25519 簽署與驗證；
- <code>signDocument</code>、<code>signatureInput</code> 和
  <code>verifyDocumentSignature</code>。

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

簽章輸入是移除頂層 <code>signature</code> 成員後的 JCS 位元組。
<code>verifyDocumentSignature</code>
只進行密碼學驗證；呼叫端仍須驗證 Schema、金鑰身分、信任、撤銷、時效性和防重放政策。

## 一致性測試命令列

安裝的執行檔會執行隨套件發布的 Schema 與測試向量：

```bash
npx --package @missionweaveprotocol/sdk missionweaveprotocol-conformance
```

預設的人類可讀輸出為：

```text
43/43 conformance vectors passed (22 valid, 21 invalid).
```

使用 JSON 輸出：

```bash
npx --package @missionweaveprotocol/sdk missionweaveprotocol-conformance --json
```

驗證另一個本機成品根目錄：

```bash
npx --package @missionweaveprotocol/sdk missionweaveprotocol-conformance --root /path/to/bundle
```

<code>--root</code> 目錄必須包含相容的 <code>schemas/</code>、
<code>conformance/manifest.json</code>
和測試向量。任何失敗或設定錯誤都會產生非零結束碼。

## 套件內資源

發布套件的根目錄包含：

- <code>schemas/</code>：固定的 21 個規範 Schema；
- <code>conformance/manifest.json</code> 和
  <code>conformance/vectors/</code>：固定測試向量；
- <code>PROTOCOL_PIN.json</code>：上游提交與成品摘要；
- <code>LICENSE</code> 和本地化 README。

可透過 <code>packageRoot()</code> 找到這些檔案：

```ts
import path from "node:path";

import { packageRoot } from "@missionweaveprotocol/sdk";

const schemasDirectory = path.join(packageRoot(), "schemas");
```

這些資源是檔案系統成品，不是 <code>exports</code> 中的 JavaScript 子路徑。

## 安全與行為邊界

- Schema 驗證確認 JSON 結構，不確認授權、業務語意、狀態轉換或操作是否安全。
- 本 SDK 不提供傳輸、Agent
  Registry、身分簽發、金鑰分發、群組管理、排程、持久化、重試或共識。
- 簽章成功不代表簽署者受信任，也不代表命令仍在有效時間內或未被重放。
- JCS 函式只接受 JSON 相容資料，並拒絕非有限數字、循環結構、稀疏陣列、<code>undefined</code>
  和未成對的 Unicode 代理字元。
- <code>SchemaCatalog.load()</code>
  與一致性測試執行器會同步讀取本機檔案；不要把它們視為請求熱路徑中的非同步 I/O。
- 對不受信任的資料，應先使用嚴格 JSON 解析，再進行 Schema 驗證，然後套用組織自身的授權、政策和狀態檢查。
- 命令列成功只表示套件成品符合預期的 Schema 結果。這仍然是 **schema-and-vector
  conformance only**。

## 開發

```bash
npm ci
npm run check
```

## 授權條款

Apache-2.0。請參閱 [LICENSE](LICENSE)。
