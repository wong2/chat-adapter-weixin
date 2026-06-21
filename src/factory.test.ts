import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createWeixinAdapter } from "./factory.js";

describe("createWeixinAdapter", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("creates an adapter from explicit config", () => {
    const adapter = createWeixinAdapter({ accountId: "acc", token: "tok" });

    expect(adapter.name).toBe("weixin");
    expect(adapter.userName).toBe("weixin-bot");
  });

  it("reads environment variables as fallback", () => {
    process.env.WEIXIN_ACCOUNT_ID = "env-acc";
    process.env.WEIXIN_BOT_TOKEN = "env-token";
    process.env.WEIXIN_BOT_USERNAME = "env-bot";

    const adapter = createWeixinAdapter();

    expect(adapter.userName).toBe("env-bot");
  });

  it("throws when required credentials are missing", () => {
    expect(() => createWeixinAdapter({ token: "tok" })).toThrow(/accountId is required/);
    expect(() => createWeixinAdapter({ accountId: "acc" })).toThrow(/token is required/);
  });
});
