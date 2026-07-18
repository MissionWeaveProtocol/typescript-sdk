[English](README.md) | **简体中文** | [繁體中文](README.zh-TW.md) |
[日本語](README.ja.md) | [Español](README.es.md) | [Français](README.fr.md) |
[Deutsch](README.de.md)

# MissionWeaveProtocol TypeScript SDK

MissionWeaveProtocol 官方 TypeScript SDK。npm 包名为
<code>@missionweaveprotocol/sdk</code>。它用于验证、规范化、签名和测试 MissionWeaveProtocol
0.1 数据。

> 本 SDK 仅声明达到 **schema-and-vector
> conformance（仅 Schema 与测试向量一致性）**。它并不声明传输层互操作性、运行时行为一致性或端到端协议一致性。

## 安装

```bash
npm install @missionweaveprotocol/sdk
```

需要 Node.js 20 或更高版本。

SDK 使用 Node.js 的文件系统和密码学 API；不声明支持浏览器或 Deno。

## 模块支持

本包同时提供 ESM、CommonJS 和相应的 TypeScript 类型声明。

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

## 协议兼容性

此版本固定到以下 MissionWeaveProtocol 工件：

| 项目           | 固定值                                                        |
| -------------- | ------------------------------------------------------------- |
| npm 包         | <code>@missionweaveprotocol/sdk@0.1.0</code>                  |
| 协议版本       | <code>0.1</code>                                              |
| Wire namespace | <code>missionweaveprotocol</code>                             |
| 协议提交       | [`6f10987627d62fb296e3490ceceb5539b1e94b70`][protocol-commit] |
| Schema         | 21 个                                                         |
| 一致性测试向量 | 52 个（25 个有效，27 个无效）                                 |

[protocol-commit]:
  https://github.com/missionweaveprotocol/missionweaveprotocol/commit/6f10987627d62fb296e3490ceceb5539b1e94b70

完整的来源、文件计数和 SHA-256 摘要记录在
[`PROTOCOL_PIN.json`](PROTOCOL_PIN.json)
中。SDK 在构建检查期间验证固定工件；它不会在运行时从网络下载 Schema。

## 严格 JSON 和 Schema 验证

<code>parseStrictJson</code> 与 <code>parseStrictJsonObject</code> 接受
<code>string</code> 或
<code>Uint8Array</code>。解析器会在 Schema 验证之前拒绝重复成员名、无效 UTF-8、UTF-8
BOM、尾随内容、无效或不可表示的数字、未配对的 Unicode 代理项，以及超过 512 层的嵌套。

<code>SchemaCatalog</code> 从包内固定的 21 个 JSON Schema 创建离线的 Ajv Draft
2020-12 验证器：

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

<code>validate</code> 返回 <code>{ valid, errors }</code>；
<code>assertValid</code> 在失败时抛出带有 Ajv 错误详情的
<code>SchemaValidationError</code>。

## WebSocket FrameCodec

<code>FrameCodec</code> 使用严格 JSON 解码，按照
<code>websocket-frame.schema.json</code> 验证帧，并使用 RFC 8785
JCS 规范化字节进行编码：

```ts
import { readFileSync } from "node:fs";

import { FrameCodec } from "@missionweaveprotocol/sdk";

const codec = new FrameCodec();
const frame = codec.decode(readFileSync("./frame.json"));
const canonicalBytes = codec.encode(frame);
```

该编解码器只处理完整 JSON 帧；它不实现网络连接、重连、订阅状态或部分流式帧。

## JCS、SHA-256 和 Ed25519

本 SDK 提供：

- <code>canonicalizeJson</code> 和 <code>canonicalJsonBytes</code>，用于 RFC
  8785 JCS 输出；
- <code>sha256Hex</code> 和 <code>sha256Identifier</code>；
- 严格、无填充的 base64url 编解码；
- 基于 Node.js 密钥的 Ed25519 签名与验证；
- <code>signBytes</code> 和 <code>verifyBytes</code> 字节级签名助手；
- <code>signDocument</code>、<code>signatureInput</code> 和
  <code>verifyDocumentSignature</code>；
- <code>SignedDocumentCodec</code>，用于固定九种 Signed
  Document 类型的六阶段签名与验证。

<code>SignedDocumentCodec.verify</code> 接受收到的原始 UTF-8 字节和
<code>KeyResolver</code>，并返回规范签名字节与哈希、完整文档哈希、精确受保护时间以及已解析的密钥与 Principal 证据。该结果只证明密码学验证；首次准入记录（First-Admission
Record）、Command 新鲜度和授权仍须单独检查。

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

签名输入是移除顶层 <code>signature</code> 成员后的 JCS 字节。
<code>verifyDocumentSignature</code>
只进行密码学验证；调用方仍须验证 Schema、密钥身份、信任、吊销、时效性和防重放策略。

## 一致性测试运行器

可以在程序中运行内置向量：

```ts
import { runConformance } from "@missionweaveprotocol/sdk";

const report = runConformance();
console.log(
  `${report.passed}/${report.total} vectors passed ` +
    `(${report.validCases} valid, ${report.invalidCases} invalid)`,
);

if (report.failed > 0) process.exitCode = 1;
```

已安装的二进制文件会运行随包发布的 Schema 和测试向量：

```bash
npx --package @missionweaveprotocol/sdk missionweaveprotocol-conformance
```

默认的人类可读输出为：

```text
52/52 conformance vectors passed (25 valid, 27 invalid).
```

使用 JSON 输出：

```bash
npx --package @missionweaveprotocol/sdk missionweaveprotocol-conformance --json
```

验证另一个本地工件根目录：

```bash
npx --package @missionweaveprotocol/sdk missionweaveprotocol-conformance --root /path/to/bundle
```

<code>--root</code> 目录必须包含兼容的 <code>schemas/</code>、
<code>conformance/manifest.json</code>
和测试向量。任何失败或配置错误都会产生非零退出码。

## 包内资源

发布包根目录包含：

- <code>schemas/</code>：固定的 21 个规范 Schema；
- <code>conformance/manifest.json</code> 和
  <code>conformance/vectors/</code>：固定测试向量；
- <code>PROTOCOL_PIN.json</code>：上游提交和工件摘要；
- <code>examples/</code>：上文所示且通过类型检查的示例；
- <code>dist/</code>：ESM、CommonJS、类型声明、source map 和命令行工具；
- <code>LICENSE</code> 和本地化 README。

可通过 <code>packageRoot()</code> 定位这些文件：

```ts
import path from "node:path";

import { packageRoot } from "@missionweaveprotocol/sdk";

const schemasDirectory = path.join(packageRoot(), "schemas");
```

这些资源是文件系统工件，不是 <code>exports</code> 中的 JavaScript 子路径。

## 安全与行为边界

- Schema 验证确认 JSON 结构，不确认授权、业务语义、状态转换或操作是否安全。
- 已经构造好的 JavaScript 对象不再保留原始字节；直接传给
  <code>SchemaCatalog</code> 无法发现早先解析时丢失的重复 JSON 键或无效源字节。
- 本 SDK 不提供传输、Agent
  Registry、身份颁发、密钥分发、群组管理、调度、持久化、重试或共识。
- 签名成功不代表签名者受信任，也不代表命令仍然新鲜或未被重放。
- 签名助手不提供密钥生成策略、密钥存储与发现、信任决策、吊销、时间戳策略、防重放机制或 Session/Membership/lease
  fencing。
- JCS 函数只接受 JSON 兼容数据，并拒绝非有限数字、循环结构、稀疏数组、<code>undefined</code>
  和未配对的 Unicode 代理项。
- <code>SchemaCatalog.load()</code>
  和一致性测试运行器同步读取本地文件；不要把它们当作请求热路径中的异步 I/O。
- 对不受信任的已签名数据，应先严格解析并验证 Schema，再验证签名，最后应用本组织的授权、策略和状态检查；解析、base64url 解码或签名验证错误均应视为拒绝。
- 命令行成功仅表示随包工件与预期的 Schema 结果一致。这仍然是 **schema-and-vector
  conformance only**。

## 开发

```bash
npm ci
npm run check
npm audit --audit-level=low
```

<code>npm run check</code>
会验证仓库命名策略、协议锁定、文档、格式、静态检查、所有示例、测试、构建产物、包元数据，以及 ESM、CommonJS、资源和 CLI 的打包安装冒烟测试。

## 许可证

Apache-2.0。参见 [LICENSE](LICENSE)。
