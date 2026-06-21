import { describe, expect, it, vi } from "vitest";
import { WeixinProtocolClient } from "./protocol.js";

describe("WeixinProtocolClient", () => {
  it("posts JSON with Weixin auth headers and base_info", async () => {
    const fetchFn = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response("{}", { status: 200 }),
    );
    const client = new WeixinProtocolClient({
      baseUrl: "https://weixin.example",
      token: "tok",
      routeTag: "route-a",
      fetchFn,
      channelVersion: "9.9.9",
    });

    await client.sendMessage({ msg: { to_user_id: "u", item_list: [] } });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://weixin.example/ilink/bot/sendmessage");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({
      "Content-Type": "application/json",
      AuthorizationType: "ilink_bot_token",
      Authorization: "Bearer tok",
      SKRouteTag: "route-a",
    });
    expect(JSON.parse(String(init?.body))).toMatchObject({
      msg: { to_user_id: "u" },
      base_info: { channel_version: "9.9.9" },
    });
  });

  it("normalizes getUpdates aborts to an empty response", async () => {
    const fetchFn = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    });
    const client = new WeixinProtocolClient({
      baseUrl: "https://weixin.example",
      token: "tok",
      fetchFn,
    });

    await expect(client.getUpdates({ getUpdatesBuf: "cursor", timeoutMs: 1 })).resolves.toEqual({
      ret: 0,
      msgs: [],
      get_updates_buf: "cursor",
    });
  });

  it("rejects Weixin application errors on sendMessage", async () => {
    const fetchFn = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ ret: -1, errmsg: "denied" }), { status: 200 }),
    );
    const client = new WeixinProtocolClient({
      baseUrl: "https://weixin.example",
      token: "tok",
      fetchFn,
    });

    await expect(client.sendMessage({ msg: { to_user_id: "u" } })).rejects.toThrow(
      /sendMessage failed/,
    );
  });
});
