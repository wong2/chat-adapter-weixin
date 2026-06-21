import type { StateAdapter } from "chat";
import type { EnrichedWeixinMessage, WeixinMessage } from "./types.js";

const CONTEXT_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const GET_UPDATES_BUF_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SENT_CLIENT_ID_TTL_MS = 10 * 60 * 1000;

export class WeixinRuntimeState {
  constructor(
    private readonly state: StateAdapter,
    private readonly accountId: string,
  ) {}

  async getUpdatesBuf(): Promise<string> {
    return (await this.state.get<string>(this.getUpdatesBufKey())) ?? "";
  }

  async setUpdatesBuf(value: string): Promise<void> {
    await this.state.set(this.getUpdatesBufKey(), value, GET_UPDATES_BUF_TTL_MS);
  }

  async setContextToken(userId: string, token: string): Promise<void> {
    if (!userId || !token) return;
    await this.state.set(this.contextTokenKey(userId), token, CONTEXT_TOKEN_TTL_MS);
  }

  async getContextToken(userId: string): Promise<string | undefined> {
    return (await this.state.get<string>(this.contextTokenKey(userId))) ?? undefined;
  }

  async markSentClientId(clientId: string): Promise<void> {
    await this.state.set(this.sentClientIdKey(clientId), true, SENT_CLIENT_ID_TTL_MS);
  }

  async isSentClientId(clientId?: string): Promise<boolean> {
    if (!clientId) return false;
    return Boolean(await this.state.get<boolean>(this.sentClientIdKey(clientId)));
  }

  enrichMessage(raw: WeixinMessage, isMe: boolean): EnrichedWeixinMessage {
    return { ...raw, __isMe: isMe };
  }

  private getUpdatesBufKey(): string {
    return `weixin:${this.accountId}:get_updates_buf`;
  }

  private contextTokenKey(userId: string): string {
    return `weixin:${this.accountId}:${userId}:context_token`;
  }

  private sentClientIdKey(clientId: string): string {
    return `weixin:${this.accountId}:sent_client_id:${clientId}`;
  }
}
