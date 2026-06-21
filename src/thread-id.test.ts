import { describe, expect, it } from "vitest";
import { channelIdFromThreadId, decodeThreadId, encodeThreadId } from "./thread-id.js";

describe("Weixin thread IDs", () => {
  it("roundtrips account and user IDs", () => {
    const data = { accountId: "abc@im.bot", userId: "user:123@im.wechat" };
    const encoded = encodeThreadId(data);

    expect(encoded).toMatch(/^weixin:/);
    expect(decodeThreadId(encoded)).toEqual(data);
  });

  it("derives channel ID from account ID", () => {
    const encoded = encodeThreadId({ accountId: "abc@im.bot", userId: "u@im.wechat" });

    expect(channelIdFromThreadId(encoded)).toBe("weixin:YWJjQGltLmJvdA");
  });

  it("rejects invalid formats", () => {
    expect(() => decodeThreadId("slack:C:T")).toThrow(/Invalid Weixin thread ID/);
    expect(() => decodeThreadId("weixin:only-one-segment")).toThrow(/Invalid Weixin thread ID/);
    expect(() => decodeThreadId("weixin:%%%%:dXNlcg")).toThrow(/Invalid base64url segment/);
  });
});
