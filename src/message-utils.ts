import crypto from "node:crypto";
import { MessageItemType, MessageType, type MessageItem, type WeixinMessage } from "./types.js";

export function buildMessageId(msg: WeixinMessage): string {
  if (msg.message_id != null) return String(msg.message_id);
  if (msg.client_id) return msg.client_id;
  if (msg.seq != null) return `seq:${msg.seq}`;
  const stable = JSON.stringify({
    from: msg.from_user_id,
    to: msg.to_user_id,
    ts: msg.create_time_ms,
    items: msg.item_list,
  });
  return `weixin:${crypto.createHash("sha1").update(stable).digest("hex").slice(0, 20)}`;
}

export function getMessageUserId(msg: WeixinMessage): string {
  if (msg.message_type === MessageType.BOT) {
    return msg.to_user_id || msg.from_user_id || "unknown";
  }
  return msg.from_user_id || msg.to_user_id || "unknown";
}

export function isBotMessage(msg: WeixinMessage): boolean {
  return msg.message_type === MessageType.BOT;
}

export function bodyFromItemList(itemList?: MessageItem[]): string {
  if (!itemList?.length) return "";
  for (const item of itemList) {
    if (item.type === MessageItemType.TEXT && item.text_item?.text != null) {
      const text = String(item.text_item.text);
      const ref = item.ref_msg;
      if (!ref) return text;
      if (ref.message_item && isMediaItem(ref.message_item)) return text;
      const parts: string[] = [];
      if (ref.title) parts.push(ref.title);
      if (ref.message_item) {
        const refBody = bodyFromItemList([ref.message_item]);
        if (refBody) parts.push(refBody);
      }
      return parts.length ? `[引用: ${parts.join(" | ")}]\n${text}` : text;
    }
    if (item.type === MessageItemType.VOICE && item.voice_item?.text) {
      return item.voice_item.text;
    }
  }
  return "";
}

export function isMediaItem(item: MessageItem): boolean {
  return (
    item.type === MessageItemType.IMAGE ||
    item.type === MessageItemType.VIDEO ||
    item.type === MessageItemType.FILE ||
    item.type === MessageItemType.VOICE
  );
}

export function messageItemsOfType(msg: WeixinMessage, type: number): MessageItem[] {
  return (msg.item_list ?? []).filter((item) => item.type === type);
}

export function createClientId(prefix = "chat-adapter-weixin"): string {
  return `${prefix}-${crypto.randomUUID()}`;
}
