[English](README.md) | [简体中文](README.zh-CN.md) | **繁體中文** |
[日本語](README.ja.md) | [Español](README.es.md) | [Français](README.fr.md) |
[Deutsch](README.de.md)

# MissionWeaveProtocol TypeScript SDK

MissionWeaveProtocol 官方 TypeScript SDK。npm 套件名稱為
<code>@missionweaveprotocol/sdk</code>。它用於驗證、規範化、簽署和測試 MissionWeaveProtocol
0.1 資料。

> 本 SDK 僅聲明達到 **schema-and-vector
> conformance（僅 Schema 與測試向量一致性）**。它並不聲明傳輸層互通性、執行期行為一致性或端對端協定一致性。

## 安裝

```bash
npm install @missionweaveprotocol/sdk
```

需要 Node.js 20 或更新版本。

SDK 使用 Node.js 的檔案系統和密碼學 API；不聲稱支援瀏覽器或 Deno。

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

| 項目           | 固定值                                                        |
| -------------- | ------------------------------------------------------------- |
| npm 套件       | <code>@missionweaveprotocol/sdk@0.1.0</code>                  |
| 協定版本       | <code>0.1</code>                                              |
| Wire namespace | <code>missionweaveprotocol</code>                             |
| 協定提交       | [`6f10987627d62fb296e3490ceceb5539b1e94b70`][protocol-commit] |
| Schema         | 21 個                                                         |
| 一致性測試向量 | 52 個（25 個有效，27 個無效）                                 |

[protocol-commit]:
  https://github.com/missionweaveprotocol/missionweaveprotocol/commit/6f10987627d62fb296e3490ceceb5539b1e94b70

完整來源、檔案數量和 SHA-256 摘要記錄在
[`PROTOCOL_PIN.json`](PROTOCOL_PIN.json)。SDK 會在建置檢查期間驗證固定成品；執行時不會從網路下載 Schema。

## 嚴格 JSON 與 Schema 驗證

<code>parseStrictJson</code> 和 <code>parseStrictJsonObject</code> 接受
<code>string</code> 或
<code>Uint8Array</code>。解析器會在 Schema 驗證前拒絕重複成員名稱、無效 UTF-8、UTF-8
BOM、尾隨內容、無效或無法表示的數字、未成對的 Unicode 代理字元，以及超過 512 層的巢狀結構。

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
- <code>signBytes</code> 和 <code>verifyBytes</code> 位元組層級簽署輔助函式；
- <code>signDocument</code>、<code>signatureInput</code> 和
  <code>verifyDocumentSignature</code>；
- <code>SignedDocumentCodec</code>，用於固定九種 Signed
  Document 類型的六階段簽署與驗證。

<code>SignedDocumentCodec.verify</code> 接受收到的原始 UTF-8 位元組和
<code>KeyResolver</code>，並回傳規範簽署位元組與雜湊、完整文件雜湊、精確受保護時間，以及已解析的金鑰與 Principal 證據。此結果只證明密碼學驗證；首次准入、Command 新鮮度和授權仍須另外檢查。

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

## 一致性測試執行器

可以在程式中執行內建向量：

```ts
import { runConformance } from "@missionweaveprotocol/sdk";

const report = runConformance();
console.log(
  `${report.passed}/${report.total} vectors passed ` +
    `(${report.validCases} valid, ${report.invalidCases} invalid)`,
);

if (report.failed > 0) process.exitCode = 1;
```

安裝的執行檔會執行隨套件發布的 Schema 與測試向量：

```bash
npx --package @missionweaveprotocol/sdk missionweaveprotocol-conformance
```

預設的人類可讀輸出為：

```text
52/52 conformance vectors passed (25 valid, 27 invalid).
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
- <code>examples/</code>：上文所示且通過型別檢查的範例；
- <code>dist/</code>：ESM、CommonJS、型別宣告、source map 和命令列工具；
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
- 已經建立的 JavaScript 物件不再保留原始位元組；直接傳給
  <code>SchemaCatalog</code>
  無法發現早先解析時遺失的重複 JSON 鍵或無效來源位元組。
- 本 SDK 不提供傳輸、Agent
  Registry、身分簽發、金鑰分發、群組管理、排程、持久化、重試或共識。
- 簽章成功不代表簽署者受信任，也不代表命令仍在有效時間內或未被重放。
- 簽署輔助函式不提供金鑰產生政策、金鑰儲存與發現、信任決策、撤銷、時間戳政策、防重放機制或 Session/Membership/lease
  fencing。
- JCS 函式只接受 JSON 相容資料，並拒絕非有限數字、循環結構、稀疏陣列、<code>undefined</code>
  和未成對的 Unicode 代理字元。
- <code>SchemaCatalog.load()</code>
  與一致性測試執行器會同步讀取本機檔案；不要把它們視為請求熱路徑中的非同步 I/O。
- 對不受信任的已簽署資料，應先嚴格解析並驗證 Schema，再驗證簽章，最後套用組織自身的授權、政策和狀態檢查；解析、base64url 解碼或簽章驗證錯誤都應視為拒絕。
- 命令列成功只表示套件成品符合預期的 Schema 結果。這仍然是 **schema-and-vector
  conformance only**。

## 開發

```bash
npm ci
npm run check
npm audit --audit-level=low
```

<code>npm run check</code>
會驗證儲存庫命名政策、協定鎖定、文件、格式、靜態檢查、所有範例、測試、建置輸出、套件中繼資料，以及 ESM、CommonJS、資源和 CLI 的打包安裝煙霧測試。

## 授權條款

Apache-2.0。請參閱 [LICENSE](LICENSE)。
