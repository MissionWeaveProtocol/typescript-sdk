import { FrameCodec } from "@missionweaveprotocol/sdk";

const incoming = new TextEncoder().encode(`{
  "protocolVersion": "0.1",
  "frameId": "urn:uuid:00000000-0000-4000-8000-000000000010",
  "frameType": "PING",
  "nonce": "cGluZw",
  "sentAt": "2026-07-17T08:00:00Z"
}`);

const codec = new FrameCodec();
const frame = codec.decode(incoming);
const canonicalBytes = codec.encode(frame);

console.log(frame["frameType"], new TextDecoder().decode(canonicalBytes));
