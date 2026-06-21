import { ValidationError } from "@chat-adapter/shared";
import { ADAPTER_NAME, type WeixinThreadId } from "./types.js";

function encodeSegment(value: string): string {
  return Buffer.from(value, "utf-8").toString("base64url");
}

function decodeSegment(value: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new ValidationError("weixin", `Invalid base64url segment: ${value}`);
  }
  try {
    const decoded = Buffer.from(value, "base64url").toString("utf-8");
    if (!decoded || encodeSegment(decoded) !== value) {
      throw new Error("non-canonical base64url segment");
    }
    return decoded;
  } catch {
    throw new ValidationError("weixin", `Invalid base64url segment: ${value}`);
  }
}

export function encodeThreadId(data: WeixinThreadId): string {
  if (!data.accountId || !data.userId) {
    throw new ValidationError("weixin", "accountId and userId are required for thread IDs");
  }
  return `${ADAPTER_NAME}:${encodeSegment(data.accountId)}:${encodeSegment(data.userId)}`;
}

export function decodeThreadId(threadId: string): WeixinThreadId {
  const parts = threadId.split(":");
  if (parts.length !== 3 || parts[0] !== ADAPTER_NAME || !parts[1] || !parts[2]) {
    throw new ValidationError("weixin", `Invalid Weixin thread ID: ${threadId}`);
  }
  return {
    accountId: decodeSegment(parts[1]),
    userId: decodeSegment(parts[2]),
  };
}

export function channelIdFromThreadId(threadId: string): string {
  const { accountId } = decodeThreadId(threadId);
  return `${ADAPTER_NAME}:${encodeSegment(accountId)}`;
}
