import crypto from "node:crypto";
import { NetworkError } from "@chat-adapter/shared";
import {
  DEFAULT_BASE_URL,
  DEFAULT_BOT_TYPE,
  type BaseInfo,
  type GetConfigResp,
  type GetUpdatesResp,
  type GetUploadUrlReq,
  type GetUploadUrlResp,
  type QRCodeResponse,
  type QRStatusResponse,
  type SendMessageReq,
  type SendTypingReq,
  type SendTypingResp,
  type WeixinApiOptions,
  type WeixinFetch,
  type WeixinProtocolOptions,
} from "./types.js";

const DEFAULT_API_TIMEOUT_MS = 15_000;
const DEFAULT_CONFIG_TIMEOUT_MS = 10_000;
const DEFAULT_QR_TIMEOUT_MS = 35_000;
const ILINK_APP_ID = "bot";
const ILINK_CLIENT_VERSION = "1";

interface WeixinStatus {
  ret?: number;
  errcode?: number;
  errmsg?: string;
}

function ensureTrailingSlash(url: string): string {
  return url.endsWith("/") ? url : `${url}/`;
}

function randomWechatUin(): string {
  const uint32 = crypto.randomBytes(4).readUInt32BE(0);
  return Buffer.from(String(uint32), "utf-8").toString("base64");
}

function buildBaseInfo(channelVersion = "0.1.0"): BaseInfo {
  return { channel_version: channelVersion };
}

async function fetchWithTimeout(
  fetchFn: WeixinFetch,
  input: string,
  init: RequestInit,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<Response> {
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

export class WeixinProtocolClient {
  private readonly baseUrl: string;
  private readonly token?: string;
  private readonly routeTag?: string | number;
  private readonly fetchFn: WeixinFetch;
  private readonly channelVersion: string;

  constructor(options: WeixinProtocolOptions) {
    this.baseUrl = options.baseUrl;
    this.token = options.token;
    this.routeTag = options.routeTag;
    this.fetchFn = options.fetchFn ?? fetch;
    this.channelVersion = options.channelVersion ?? "0.1.0";
  }

  async getUpdates(params: {
    getUpdatesBuf?: string;
    timeoutMs?: number;
    signal?: AbortSignal;
  }): Promise<GetUpdatesResp> {
    try {
      return await this.postJson<GetUpdatesResp>(
        "ilink/bot/getupdates",
        {
          get_updates_buf: params.getUpdatesBuf ?? "",
          base_info: buildBaseInfo(this.channelVersion),
        },
        params.timeoutMs ?? 35_000,
        params.signal,
      );
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return { ret: 0, msgs: [], get_updates_buf: params.getUpdatesBuf };
      }
      throw error;
    }
  }

  async sendMessage(body: SendMessageReq, options: WeixinApiOptions = {}): Promise<void> {
    const resp = await this.postJson<WeixinStatus>(
      "ilink/bot/sendmessage",
      { ...body, base_info: buildBaseInfo(this.channelVersion) },
      options.timeoutMs ?? DEFAULT_API_TIMEOUT_MS,
    );
    ensureWeixinOk(resp, "sendMessage");
  }

  async getUploadUrl(
    body: GetUploadUrlReq,
    options: WeixinApiOptions = {},
  ): Promise<GetUploadUrlResp> {
    const resp = await this.postJson<GetUploadUrlResp & WeixinStatus>(
      "ilink/bot/getuploadurl",
      { ...body, base_info: buildBaseInfo(this.channelVersion) },
      options.timeoutMs ?? DEFAULT_API_TIMEOUT_MS,
    );
    ensureWeixinOk(resp, "getUploadUrl");
    return resp;
  }

  async getConfig(
    params: { ilinkUserId: string; contextToken?: string },
    options: WeixinApiOptions = {},
  ): Promise<GetConfigResp> {
    const resp = await this.postJson<GetConfigResp>(
      "ilink/bot/getconfig",
      {
        ilink_user_id: params.ilinkUserId,
        context_token: params.contextToken,
        base_info: buildBaseInfo(this.channelVersion),
      },
      options.timeoutMs ?? DEFAULT_CONFIG_TIMEOUT_MS,
    );
    ensureWeixinOk(resp, "getConfig");
    return resp;
  }

  async sendTyping(body: SendTypingReq, options: WeixinApiOptions = {}): Promise<SendTypingResp> {
    const resp = await this.postJson<SendTypingResp>(
      "ilink/bot/sendtyping",
      { ...body, base_info: buildBaseInfo(this.channelVersion) },
      options.timeoutMs ?? DEFAULT_CONFIG_TIMEOUT_MS,
    );
    ensureWeixinOk(resp, "sendTyping");
    return resp;
  }

  async fetchQRCode(botType = DEFAULT_BOT_TYPE): Promise<QRCodeResponse> {
    return await this.getJson<QRCodeResponse>(
      `ilink/bot/get_bot_qrcode?bot_type=${encodeURIComponent(botType)}`,
      5_000,
    );
  }

  async pollQRStatus(qrcode: string): Promise<QRStatusResponse> {
    try {
      return await this.getJson<QRStatusResponse>(
        `ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcode)}`,
        DEFAULT_QR_TIMEOUT_MS,
      );
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return { status: "wait" };
      }
      return { status: "wait" };
    }
  }

  private async postJson<T>(
    endpoint: string,
    body: unknown,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<T> {
    const bodyText = JSON.stringify(body);
    const res = await fetchWithTimeout(
      this.fetchFn,
      new URL(endpoint, ensureTrailingSlash(this.baseUrl)).toString(),
      {
        method: "POST",
        headers: this.buildPostHeaders(bodyText),
        body: bodyText,
      },
      timeoutMs,
      signal,
    );
    return await parseJsonResponse<T>(res, endpoint);
  }

  private async getJson<T>(endpoint: string, timeoutMs: number): Promise<T> {
    const res = await fetchWithTimeout(
      this.fetchFn,
      new URL(endpoint, ensureTrailingSlash(this.baseUrl)).toString(),
      {
        method: "GET",
        headers: this.buildCommonHeaders(),
      },
      timeoutMs,
    );
    return await parseJsonResponse<T>(res, endpoint);
  }

  private buildCommonHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "iLink-App-Id": ILINK_APP_ID,
      "iLink-App-ClientVersion": ILINK_CLIENT_VERSION,
    };
    if (this.routeTag != null && String(this.routeTag).trim() !== "") {
      headers.SKRouteTag = String(this.routeTag);
    }
    return headers;
  }

  private buildPostHeaders(body: string): Record<string, string> {
    const headers: Record<string, string> = {
      ...this.buildCommonHeaders(),
      "Content-Type": "application/json",
      "Content-Length": String(Buffer.byteLength(body, "utf-8")),
      AuthorizationType: "ilink_bot_token",
      "X-WECHAT-UIN": randomWechatUin(),
    };
    if (this.token?.trim()) {
      headers.Authorization = `Bearer ${this.token.trim()}`;
    }
    return headers;
  }
}

function ensureWeixinOk(resp: WeixinStatus, label: string): void {
  const failed =
    (resp.ret !== undefined && resp.ret !== 0) ||
    (resp.errcode !== undefined && resp.errcode !== 0);
  if (failed) {
    throw new NetworkError(
      "weixin",
      `${label} failed: ret=${resp.ret} errcode=${resp.errcode} errmsg=${resp.errmsg ?? ""}`,
    );
  }
}

export function createQrProtocolClient(fetchFn?: WeixinFetch): WeixinProtocolClient {
  return new WeixinProtocolClient({ baseUrl: DEFAULT_BASE_URL, fetchFn });
}

async function parseJsonResponse<T>(res: Response, label: string): Promise<T> {
  const rawText = await res.text();
  if (!res.ok) {
    throw new NetworkError("weixin", `${label} failed with ${res.status}: ${rawText}`);
  }
  try {
    return JSON.parse(rawText) as T;
  } catch (error) {
    throw new NetworkError(
      "weixin",
      `${label} returned invalid JSON`,
      error instanceof Error ? error : undefined,
    );
  }
}
