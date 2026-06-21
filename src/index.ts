export { WeixinAdapter } from "./adapter.js";
export { createWeixinAdapter } from "./factory.js";
export { WeixinFormatConverter, markdownToPlainText } from "./format-converter.js";
export { startWeixinLogin } from "./login.js";
export { decodeThreadId, encodeThreadId, channelIdFromThreadId } from "./thread-id.js";
export { WeixinProtocolClient } from "./protocol.js";
export type {
  EnrichedWeixinMessage,
  GetUpdatesResp,
  MessageItem,
  ResolvedWeixinAdapterConfig,
  WeixinAdapterConfig,
  WeixinLoginOptions,
  WeixinLoginResult,
  WeixinMessage,
  WeixinPollingConfig,
  WeixinThreadId,
} from "./types.js";
