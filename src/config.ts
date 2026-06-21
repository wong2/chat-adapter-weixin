import { AuthenticationError } from "@chat-adapter/shared";
import {
  DEFAULT_BASE_URL,
  DEFAULT_BOT_TYPE,
  DEFAULT_BOT_USERNAME,
  DEFAULT_CDN_BASE_URL,
  type ResolvedWeixinAdapterConfig,
  type WeixinAdapterConfig,
} from "./types.js";

const DEFAULT_LONG_POLL_TIMEOUT_MS = 35_000;
const DEFAULT_RETRY_DELAY_MS = 2_000;
const DEFAULT_BACKOFF_DELAY_MS = 30_000;
const DEFAULT_MAX_CONSECUTIVE_FAILURES = 3;

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => value != null && value.trim() !== "")?.trim();
}

export function resolveConfig(config: WeixinAdapterConfig = {}): ResolvedWeixinAdapterConfig {
  const accountId = firstNonEmpty(config.accountId, process.env.WEIXIN_ACCOUNT_ID);
  const token = firstNonEmpty(config.token, process.env.WEIXIN_BOT_TOKEN);

  if (!accountId) {
    throw new AuthenticationError(
      "weixin",
      "accountId is required. Pass config.accountId or set WEIXIN_ACCOUNT_ID.",
    );
  }

  if (!token) {
    throw new AuthenticationError(
      "weixin",
      "token is required. Pass config.token or set WEIXIN_BOT_TOKEN.",
    );
  }

  return {
    accountId,
    token,
    baseUrl: firstNonEmpty(config.baseUrl, process.env.WEIXIN_BASE_URL) ?? DEFAULT_BASE_URL,
    cdnBaseUrl:
      firstNonEmpty(config.cdnBaseUrl, process.env.WEIXIN_CDN_BASE_URL) ?? DEFAULT_CDN_BASE_URL,
    userName:
      firstNonEmpty(config.userName, process.env.WEIXIN_BOT_USERNAME) ?? DEFAULT_BOT_USERNAME,
    botType: firstNonEmpty(config.botType, process.env.WEIXIN_BOT_TYPE) ?? DEFAULT_BOT_TYPE,
    routeTag: config.routeTag ?? process.env.WEIXIN_ROUTE_TAG,
    polling: {
      enabled: config.polling?.enabled ?? true,
      longPollTimeoutMs:
        config.polling?.longPollTimeoutMs ?? DEFAULT_LONG_POLL_TIMEOUT_MS,
      retryDelayMs: config.polling?.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS,
      backoffDelayMs: config.polling?.backoffDelayMs ?? DEFAULT_BACKOFF_DELAY_MS,
      maxConsecutiveFailures:
        config.polling?.maxConsecutiveFailures ?? DEFAULT_MAX_CONSECUTIVE_FAILURES,
    },
    logger: config.logger,
  };
}
