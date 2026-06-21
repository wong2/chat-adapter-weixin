import { DEFAULT_BASE_URL, DEFAULT_BOT_TYPE, type WeixinLoginOptions, type WeixinLoginResult } from "./types.js";
import { createQrProtocolClient, WeixinProtocolClient } from "./protocol.js";

const MAX_QR_REFRESH_COUNT = 3;

export async function startWeixinLogin(options: WeixinLoginOptions = {}): Promise<WeixinLoginResult> {
  let client = createQrProtocolClient(options.fetchFn);
  let activeBaseUrl = DEFAULT_BASE_URL;
  let qrcode = await client.fetchQRCode(options.botType ?? DEFAULT_BOT_TYPE);
  await options.onQRCode?.(qrcode.qrcode_img_content);
  const deadline = Date.now() + Math.max(options.timeoutMs ?? 480_000, 1_000);
  let refreshCount = 1;

  while (Date.now() < deadline) {
    const status = await client.pollQRStatus(qrcode.qrcode);
    if (options.verbose) process.stderr.write(".");

    if (status.status === "scaned_but_redirect" && status.redirect_host) {
      activeBaseUrl = `https://${status.redirect_host}`;
      client = new WeixinProtocolClient({ baseUrl: activeBaseUrl, fetchFn: options.fetchFn });
      continue;
    }

    if (status.status === "expired") {
      refreshCount += 1;
      if (refreshCount > MAX_QR_REFRESH_COUNT) {
        throw new Error("Weixin QR login timed out: QR code expired too many times");
      }
      client = createQrProtocolClient(options.fetchFn);
      activeBaseUrl = DEFAULT_BASE_URL;
      qrcode = await client.fetchQRCode(options.botType ?? DEFAULT_BOT_TYPE);
      await options.onQRCode?.(qrcode.qrcode_img_content);
      continue;
    }

    if (status.status === "confirmed") {
      if (!status.ilink_bot_id || !status.bot_token) {
        throw new Error("Weixin QR login confirmed without accountId or token");
      }
      return {
        accountId: status.ilink_bot_id,
        token: status.bot_token,
        baseUrl: status.baseurl || activeBaseUrl,
        userId: status.ilink_user_id,
      };
    }

    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw new Error("Weixin QR login timed out");
}
