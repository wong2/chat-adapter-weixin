import { Chat, type StateAdapter } from "chat";
import { createMemoryState } from "@chat-adapter/state-memory";
import { describe, expect, it, vi } from "vitest";
import { WeixinAdapter } from "./adapter.js";
import { encryptAesEcb } from "./media.js";
import type { WeixinProtocolClient } from "./protocol.js";
import {
  MessageItemType,
  MessageType,
  type GetUpdatesResp,
  type SendMessageReq,
  type WeixinMessage,
} from "./types.js";

function makeProtocol(overrides: Partial<WeixinProtocolClient> = {}): WeixinProtocolClient {
  return {
    getUpdates: vi.fn(async () => ({ ret: 0, msgs: [] })),
    sendMessage: vi.fn(async () => undefined),
    getUploadUrl: vi.fn(async () => ({
      upload_full_url: "https://cdn.example/upload",
    })),
    getConfig: vi.fn(async () => ({ ret: 0, typing_ticket: "ticket" })),
    sendTyping: vi.fn(async () => ({ ret: 0 })),
    fetchQRCode: vi.fn(),
    pollQRStatus: vi.fn(),
    ...overrides,
  } as unknown as WeixinProtocolClient;
}

async function createInitializedAdapter(protocol: WeixinProtocolClient, fetchFn?: typeof fetch) {
  const adapter = new WeixinAdapter({
    accountId: "acc@im.bot",
    token: "tok",
    polling: { enabled: false },
    protocolClient: protocol,
    fetchFn,
  } as never);
  const state = createMemoryState();
  const chat = new Chat({
    userName: "bot",
    adapters: { weixin: adapter },
    state,
    logger: "silent",
  });
  await chat.initialize();
  return { adapter, chat, state };
}

describe("WeixinAdapter parsing", () => {
  it("parses text and quoted text", () => {
    const adapter = new WeixinAdapter({
      accountId: "acc@im.bot",
      token: "tok",
      polling: { enabled: false },
    });
    const message = adapter.parseMessage({
      from_user_id: "u@im.wechat",
      message_id: 123,
      create_time_ms: 1_700_000_000_000,
      item_list: [
        {
          type: MessageItemType.TEXT,
          text_item: { text: "hello" },
          ref_msg: {
            title: "previous",
            message_item: { type: MessageItemType.TEXT, text_item: { text: "quoted" } },
          },
        },
      ],
    });

    expect(message.text).toBe("[引用: previous | quoted]\nhello");
    expect(message.author.userId).toBe("u@im.wechat");
    expect(message.author.isMe).toBe(false);
  });

  it("uses voice transcription as message text", () => {
    const adapter = new WeixinAdapter({
      accountId: "acc@im.bot",
      token: "tok",
      polling: { enabled: false },
    });
    const message = adapter.parseMessage({
      from_user_id: "u@im.wechat",
      item_list: [{ type: MessageItemType.VOICE, voice_item: { text: "transcribed" } }],
    });

    expect(message.text).toBe("transcribed");
  });

  it("threads bot-originated raw messages against the conversation peer", () => {
    const adapter = new WeixinAdapter({
      accountId: "acc@im.bot",
      token: "tok",
      polling: { enabled: false },
    });
    const message = adapter.parseMessage({
      from_user_id: "acc@im.bot",
      to_user_id: "u@im.wechat",
      message_type: MessageType.BOT,
      item_list: [{ type: MessageItemType.TEXT, text_item: { text: "bot echo" } }],
    });

    expect(message.threadId).toBe(
      adapter.encodeThreadId({ accountId: "acc@im.bot", userId: "u@im.wechat" }),
    );
    expect(message.author.userId).toBe("acc@im.bot");
    expect(message.author.isBot).toBe(true);
  });
});

describe("WeixinAdapter integration", () => {
  it("processes long-poll messages through Chat and replies with cached context token", async () => {
    const sent: SendMessageReq[] = [];
    const inbound: WeixinMessage = {
      from_user_id: "u@im.wechat",
      message_id: 1,
      message_type: MessageType.USER,
      context_token: "ctx",
      create_time_ms: Date.now(),
      item_list: [{ type: MessageItemType.TEXT, text_item: { text: "hi" } }],
    };
    const protocol = makeProtocol({
      getUpdates: vi.fn(async (): Promise<GetUpdatesResp> => ({
        ret: 0,
        msgs: [inbound],
        get_updates_buf: "cursor-2",
      })),
      sendMessage: vi.fn(async (body: SendMessageReq) => {
        sent.push(body);
      }),
    });
    const { adapter, chat, state } = await createInitializedAdapter(protocol);
    let captured = "";
    chat.onDirectMessage(async (thread, message) => {
      captured = message.text;
      await thread.post("ack");
    });

    await adapter.pollOnce();

    expect(captured).toBe("hi");
    expect(await (state as StateAdapter).get("weixin:acc@im.bot:get_updates_buf")).toBe("cursor-2");
    expect(await (state as StateAdapter).get("weixin:acc@im.bot:u@im.wechat:context_token")).toBe(
      "ctx",
    );
    expect(sent).toHaveLength(1);
    expect(sent[0].msg?.context_token).toBe("ctx");
    expect(sent[0].msg?.item_list?.[0].text_item?.text).toBe("ack");

    await chat.shutdown();
  });

  it("does not persist the poll cursor before inbound messages are processed", async () => {
    const protocol = makeProtocol({
      getUpdates: vi.fn(async (): Promise<GetUpdatesResp> => ({
        ret: 0,
        msgs: [
          {
            from_user_id: "u@im.wechat",
            message_id: 1,
            item_list: [{ type: MessageItemType.TEXT, text_item: { text: "hi" } }],
          },
        ],
        get_updates_buf: "cursor-after-failed-message",
      })),
    });
    const { adapter, chat, state } = await createInitializedAdapter(protocol);
    const testAdapter = adapter as unknown as {
      processInbound(raw: WeixinMessage): Promise<void>;
    };
    testAdapter.processInbound = async () => {
      throw new Error("handler failed");
    };

    await expect(adapter.pollOnce()).rejects.toThrow("handler failed");
    expect(await (state as StateAdapter).get("weixin:acc@im.bot:get_updates_buf")).toBeNull();

    await chat.shutdown();
  });

  it("passes abort signals to long-poll requests", async () => {
    const controller = new AbortController();
    const getUpdates = vi.fn(async (): Promise<GetUpdatesResp> => ({ ret: 0, msgs: [] }));
    const protocol = makeProtocol({ getUpdates });
    const { adapter, chat } = await createInitializedAdapter(protocol);

    await adapter.pollOnce(controller.signal);

    expect(getUpdates).toHaveBeenCalledWith(
      expect.objectContaining({ signal: controller.signal }),
    );

    await chat.shutdown();
  });

  it("rehydrates persisted media attachments from fetch metadata", async () => {
    const key = Buffer.from("0123456789abcdef");
    const plaintext = Buffer.from("persisted media");
    const ciphertext = encryptAesEcb(plaintext, key);
    const fetchFn = vi.fn(async () => new Response(new Uint8Array(ciphertext), { status: 200 }));
    const adapter = new WeixinAdapter({
      accountId: "acc@im.bot",
      token: "tok",
      polling: { enabled: false },
      fetchFn,
    } as never);

    const attachment = adapter.rehydrateAttachment({
      type: "file",
      name: "file.bin",
      fetchMetadata: {
        encryptedQueryParam: "download-param",
        aesKey: key.toString("base64"),
        cdnBaseUrl: "https://cdn.example/c2c",
      },
    });

    await expect(attachment.fetchData?.()).resolves.toEqual(plaintext);
    expect(fetchFn).toHaveBeenCalledWith(
      "https://cdn.example/c2c/download?encrypted_query_param=download-param",
    );
  });

  it("uploads files before sending media messages", async () => {
    const sent: SendMessageReq[] = [];
    const protocol = makeProtocol({
      sendMessage: vi.fn(async (body: SendMessageReq) => {
        sent.push(body);
      }),
    });
    const fetchFn = vi.fn(async () => {
      const headers = new Headers({ "x-encrypted-param": "download-param" });
      return new Response("", { status: 200, headers });
    });
    const { adapter, chat } = await createInitializedAdapter(protocol, fetchFn);
    const threadId = adapter.encodeThreadId({ accountId: "acc@im.bot", userId: "u@im.wechat" });

    await adapter.postMessage(threadId, {
      markdown: "caption",
      files: [{ data: Buffer.from("abc"), filename: "image.png", mimeType: "image/png" }],
    });

    expect(protocol.getUploadUrl).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(sent).toHaveLength(2);
    expect(sent[0].msg?.item_list?.[0].text_item?.text).toBe("caption");
    expect(sent[1].msg?.item_list?.[0].type).toBe(MessageItemType.IMAGE);

    await chat.shutdown();
  });

  it("uses configured fetchFn for URL-only attachment uploads", async () => {
    const sent: SendMessageReq[] = [];
    const protocol = makeProtocol({
      sendMessage: vi.fn(async (body: SendMessageReq) => {
        sent.push(body);
      }),
    });
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "https://source.example/file.txt") {
        return new Response("remote file", { status: 200 });
      }
      const headers = new Headers({ "x-encrypted-param": "download-param" });
      return new Response("", { status: 200, headers });
    });
    const { adapter, chat } = await createInitializedAdapter(protocol, fetchFn);
    const threadId = adapter.encodeThreadId({ accountId: "acc@im.bot", userId: "u@im.wechat" });

    await adapter.postMessage(threadId, {
      raw: "",
      attachments: [{ type: "file", url: "https://source.example/file.txt", name: "file.txt" }],
    });

    expect(fetchFn).toHaveBeenCalledWith("https://source.example/file.txt");
    expect(protocol.getUploadUrl).toHaveBeenCalledTimes(1);
    expect(sent).toHaveLength(1);
    expect(sent[0].msg?.item_list?.[0].type).toBe(MessageItemType.FILE);

    await chat.shutdown();
  });
});
