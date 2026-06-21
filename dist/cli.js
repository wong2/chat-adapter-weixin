#!/usr/bin/env node

// src/cli.ts
import fs from "fs/promises";
import path from "path";
import os from "os";
import qrcode from "qrcode-terminal";

// src/types.ts
var DEFAULT_BASE_URL = "https://ilinkai.weixin.qq.com";
var DEFAULT_BOT_TYPE = "3";

// src/protocol.ts
import crypto from "crypto";
import { NetworkError } from "@chat-adapter/shared";
var DEFAULT_API_TIMEOUT_MS = 15e3;
var DEFAULT_CONFIG_TIMEOUT_MS = 1e4;
var DEFAULT_QR_TIMEOUT_MS = 35e3;
var ILINK_APP_ID = "bot";
var ILINK_CLIENT_VERSION = "1";
function ensureTrailingSlash(url) {
  return url.endsWith("/") ? url : `${url}/`;
}
function randomWechatUin() {
  const uint32 = crypto.randomBytes(4).readUInt32BE(0);
  return Buffer.from(String(uint32), "utf-8").toString("base64");
}
function buildBaseInfo(channelVersion = "0.1.0") {
  return { channel_version: channelVersion };
}
async function fetchWithTimeout(fetchFn, input, init, timeoutMs, signal) {
  const controller = new AbortController();
  const abortFromParent = () => controller.abort();
  if (signal?.aborted) {
    controller.abort();
  } else {
    signal?.addEventListener("abort", abortFromParent, { once: true });
  }
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchFn(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abortFromParent);
  }
}
var WeixinProtocolClient = class {
  baseUrl;
  token;
  routeTag;
  fetchFn;
  channelVersion;
  constructor(options) {
    this.baseUrl = options.baseUrl;
    this.token = options.token;
    this.routeTag = options.routeTag;
    this.fetchFn = options.fetchFn ?? fetch;
    this.channelVersion = options.channelVersion ?? "0.1.0";
  }
  async getUpdates(params) {
    try {
      return await this.postJson(
        "ilink/bot/getupdates",
        {
          get_updates_buf: params.getUpdatesBuf ?? "",
          base_info: buildBaseInfo(this.channelVersion)
        },
        params.timeoutMs ?? 35e3,
        params.signal
      );
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return { ret: 0, msgs: [], get_updates_buf: params.getUpdatesBuf };
      }
      throw error;
    }
  }
  async sendMessage(body, options = {}) {
    const resp = await this.postJson(
      "ilink/bot/sendmessage",
      { ...body, base_info: buildBaseInfo(this.channelVersion) },
      options.timeoutMs ?? DEFAULT_API_TIMEOUT_MS
    );
    ensureWeixinOk(resp, "sendMessage");
  }
  async getUploadUrl(body, options = {}) {
    const resp = await this.postJson(
      "ilink/bot/getuploadurl",
      { ...body, base_info: buildBaseInfo(this.channelVersion) },
      options.timeoutMs ?? DEFAULT_API_TIMEOUT_MS
    );
    ensureWeixinOk(resp, "getUploadUrl");
    return resp;
  }
  async getConfig(params, options = {}) {
    const resp = await this.postJson(
      "ilink/bot/getconfig",
      {
        ilink_user_id: params.ilinkUserId,
        context_token: params.contextToken,
        base_info: buildBaseInfo(this.channelVersion)
      },
      options.timeoutMs ?? DEFAULT_CONFIG_TIMEOUT_MS
    );
    ensureWeixinOk(resp, "getConfig");
    return resp;
  }
  async sendTyping(body, options = {}) {
    const resp = await this.postJson(
      "ilink/bot/sendtyping",
      { ...body, base_info: buildBaseInfo(this.channelVersion) },
      options.timeoutMs ?? DEFAULT_CONFIG_TIMEOUT_MS
    );
    ensureWeixinOk(resp, "sendTyping");
    return resp;
  }
  async fetchQRCode(botType = DEFAULT_BOT_TYPE) {
    return await this.getJson(
      `ilink/bot/get_bot_qrcode?bot_type=${encodeURIComponent(botType)}`,
      5e3
    );
  }
  async pollQRStatus(qrcode2) {
    try {
      return await this.getJson(
        `ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcode2)}`,
        DEFAULT_QR_TIMEOUT_MS
      );
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return { status: "wait" };
      }
      return { status: "wait" };
    }
  }
  async postJson(endpoint, body, timeoutMs, signal) {
    const bodyText = JSON.stringify(body);
    const res = await fetchWithTimeout(
      this.fetchFn,
      new URL(endpoint, ensureTrailingSlash(this.baseUrl)).toString(),
      {
        method: "POST",
        headers: this.buildPostHeaders(bodyText),
        body: bodyText
      },
      timeoutMs,
      signal
    );
    return await parseJsonResponse(res, endpoint);
  }
  async getJson(endpoint, timeoutMs) {
    const res = await fetchWithTimeout(
      this.fetchFn,
      new URL(endpoint, ensureTrailingSlash(this.baseUrl)).toString(),
      {
        method: "GET",
        headers: this.buildCommonHeaders()
      },
      timeoutMs
    );
    return await parseJsonResponse(res, endpoint);
  }
  buildCommonHeaders() {
    const headers = {
      "iLink-App-Id": ILINK_APP_ID,
      "iLink-App-ClientVersion": ILINK_CLIENT_VERSION
    };
    if (this.routeTag != null && String(this.routeTag).trim() !== "") {
      headers.SKRouteTag = String(this.routeTag);
    }
    return headers;
  }
  buildPostHeaders(body) {
    const headers = {
      ...this.buildCommonHeaders(),
      "Content-Type": "application/json",
      "Content-Length": String(Buffer.byteLength(body, "utf-8")),
      AuthorizationType: "ilink_bot_token",
      "X-WECHAT-UIN": randomWechatUin()
    };
    if (this.token?.trim()) {
      headers.Authorization = `Bearer ${this.token.trim()}`;
    }
    return headers;
  }
};
function ensureWeixinOk(resp, label) {
  const failed = resp.ret !== void 0 && resp.ret !== 0 || resp.errcode !== void 0 && resp.errcode !== 0;
  if (failed) {
    throw new NetworkError(
      "weixin",
      `${label} failed: ret=${resp.ret} errcode=${resp.errcode} errmsg=${resp.errmsg ?? ""}`
    );
  }
}
function createQrProtocolClient(fetchFn) {
  return new WeixinProtocolClient({ baseUrl: DEFAULT_BASE_URL, fetchFn });
}
async function parseJsonResponse(res, label) {
  const rawText = await res.text();
  if (!res.ok) {
    throw new NetworkError("weixin", `${label} failed with ${res.status}: ${rawText}`);
  }
  try {
    return JSON.parse(rawText);
  } catch (error) {
    throw new NetworkError(
      "weixin",
      `${label} returned invalid JSON`,
      error instanceof Error ? error : void 0
    );
  }
}

// src/login.ts
var MAX_QR_REFRESH_COUNT = 3;
async function startWeixinLogin(options = {}) {
  let client = createQrProtocolClient(options.fetchFn);
  let activeBaseUrl = DEFAULT_BASE_URL;
  let qrcode2 = await client.fetchQRCode(options.botType ?? DEFAULT_BOT_TYPE);
  await options.onQRCode?.(qrcode2.qrcode_img_content);
  const deadline = Date.now() + Math.max(options.timeoutMs ?? 48e4, 1e3);
  let refreshCount = 1;
  while (Date.now() < deadline) {
    const status = await client.pollQRStatus(qrcode2.qrcode);
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
      qrcode2 = await client.fetchQRCode(options.botType ?? DEFAULT_BOT_TYPE);
      await options.onQRCode?.(qrcode2.qrcode_img_content);
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
        userId: status.ilink_user_id
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 1e3));
  }
  throw new Error("Weixin QR login timed out");
}

// src/cli.ts
async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }
  if (command !== "login") {
    throw new Error(`Unknown command: ${command}`);
  }
  const options = parseLoginArgs(args);
  const result = await startWeixinLogin({
    botType: options.botType,
    timeoutMs: options.timeoutMs,
    verbose: true,
    onQRCode: (url) => {
      process.stderr.write("\nScan this QR code with Weixin:\n\n");
      qrcode.generate(url, { small: true }, (output) => {
        process.stderr.write(`${output}
`);
      });
      process.stderr.write(`
If the QR code does not render, open this URL:
${url}

`);
    }
  });
  process.stderr.write("\nWeixin login succeeded.\n");
  if (options.save) {
    await saveCredentials(options.stateDir, result);
    process.stderr.write(`Saved credentials to ${credentialPath(options.stateDir, result.accountId)}
`);
  }
  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}
`);
    return;
  }
  printEnv(result);
}
function parseLoginArgs(args) {
  const options = {
    json: false,
    env: false,
    save: false,
    stateDir: path.join(os.homedir(), ".chat-adapter-weixin")
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--json") options.json = true;
    else if (arg === "--env") options.env = true;
    else if (arg === "--save") options.save = true;
    else if (arg === "--state-dir") options.stateDir = requireValue(args, ++i, arg);
    else if (arg === "--bot-type") options.botType = requireValue(args, ++i, arg);
    else if (arg === "--timeout-ms") options.timeoutMs = Number(requireValue(args, ++i, arg));
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (!options.json && !options.env) {
    options.env = true;
  }
  return options;
}
function requireValue(args, index, flag) {
  const value = args[index];
  if (!value) throw new Error(`${flag} requires a value`);
  return value;
}
function printEnv(result) {
  process.stdout.write(`export WEIXIN_ACCOUNT_ID=${shellQuote(result.accountId)}
`);
  process.stdout.write(`export WEIXIN_BOT_TOKEN=${shellQuote(result.token)}
`);
  process.stdout.write(`export WEIXIN_BASE_URL=${shellQuote(result.baseUrl)}
`);
  if (result.userId) {
    process.stdout.write(`export WEIXIN_USER_ID=${shellQuote(result.userId)}
`);
  }
}
function shellQuote(value) {
  return `'${value.replace(/'/g, "'\\''")}'`;
}
async function saveCredentials(stateDir, result) {
  const filePath = credentialPath(stateDir, result.accountId);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify({ ...result, savedAt: (/* @__PURE__ */ new Date()).toISOString() }, null, 2)}
`, {
    mode: 384
  });
  await fs.chmod(filePath, 384).catch(() => void 0);
}
function credentialPath(stateDir, accountId) {
  return path.join(stateDir, "accounts", `${sanitizeFileName(accountId)}.json`);
}
function sanitizeFileName(value) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-");
}
function printHelp() {
  process.stdout.write(`Usage:
  weixin-chat-adapter login [--env|--json] [--save] [--state-dir DIR]

Options:
  --env             Print exportable WEIXIN_* variables (default)
  --json            Print credentials as JSON
  --save            Save credentials for local development only
  --state-dir DIR   Directory used with --save
  --bot-type TYPE   Weixin iLink bot type (default: 3)
  --timeout-ms MS   Login timeout in milliseconds
`);
}
main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}
`);
  process.exitCode = 1;
});
//# sourceMappingURL=cli.js.map