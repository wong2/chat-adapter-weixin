import { WeixinAdapter } from "./adapter.js";
import type { WeixinAdapterConfig } from "./types.js";

export function createWeixinAdapter(config?: Partial<WeixinAdapterConfig>): WeixinAdapter {
  return new WeixinAdapter(config);
}
