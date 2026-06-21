import { describe, expect, it, vi } from "vitest";
import { startWeixinLogin } from "./login.js";

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200 });
}

describe("startWeixinLogin", () => {
  it("returns the redirected base URL when confirmed response omits baseurl", async () => {
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("get_bot_qrcode")) {
        return json({ qrcode: "qr1", qrcode_img_content: "qr-url-1" });
      }
      if (url.startsWith("https://ilinkai.weixin.qq.com")) {
        return json({ status: "scaned_but_redirect", redirect_host: "regional.weixin.qq.com" });
      }
      return json({ status: "confirmed", bot_token: "tok", ilink_bot_id: "acc" });
    });

    await expect(startWeixinLogin({ fetchFn })).resolves.toEqual({
      accountId: "acc",
      token: "tok",
      baseUrl: "https://regional.weixin.qq.com",
      userId: undefined,
    });
  });

  it("resets polling to the default host after a redirected QR expires and refreshes", async () => {
    let defaultStatusCalls = 0;
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("get_bot_qrcode")) {
        return json({ qrcode: `qr${defaultStatusCalls + 1}`, qrcode_img_content: "qr-url" });
      }
      if (url.startsWith("https://regional.weixin.qq.com")) {
        return json({ status: "expired" });
      }
      defaultStatusCalls += 1;
      if (defaultStatusCalls === 1) {
        return json({ status: "scaned_but_redirect", redirect_host: "regional.weixin.qq.com" });
      }
      return json({
        status: "confirmed",
        bot_token: "tok",
        ilink_bot_id: "acc",
        baseurl: "https://ilinkai.weixin.qq.com",
      });
    });

    await expect(startWeixinLogin({ fetchFn })).resolves.toMatchObject({
      accountId: "acc",
      baseUrl: "https://ilinkai.weixin.qq.com",
    });
    expect(defaultStatusCalls).toBe(2);
  });
});
