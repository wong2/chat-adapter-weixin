import { describe, expect, it, vi } from "vitest";
import {
  attachmentFromMessageItem,
  encryptAesEcb,
  inferUploadKind,
  parseAesKey,
  uploadedToMessageItem,
} from "./media.js";
import type { UploadedFileInfo } from "./types.js";
import { MessageItemType } from "./types.js";

describe("parseAesKey", () => {
  const rawKey = Buffer.from("00112233445566778899aabbccddeeff", "hex");

  it("decodes base64 of raw 16 bytes (image format)", () => {
    expect(parseAesKey(rawKey.toString("base64"))).toEqual(rawKey);
  });

  it("decodes base64 of a 32-char hex string (file/voice/video format)", () => {
    const hexTextKey = Buffer.from(rawKey.toString("hex"), "ascii");
    expect(parseAesKey(hexTextKey.toString("base64"))).toEqual(rawKey);
  });

  it("rejects keys that decode to neither 16 bytes nor 32-char hex", () => {
    expect(() => parseAesKey(Buffer.from("too-short").toString("base64"))).toThrow(/aes_key must/);
  });
});

describe("uploadedToMessageItem aes_key encoding", () => {
  const keyHex = "00112233445566778899aabbccddeeff";
  const uploaded: UploadedFileInfo = {
    filekey: "fk",
    downloadEncryptedQueryParam: "dl-param",
    aeskey: keyHex,
    fileSize: 42,
    fileSizeCiphertext: 48,
  };

  it("encodes image aes_key as base64 of the 32-char hex string", () => {
    const item = uploadedToMessageItem({ uploaded, kind: "image" });
    const aesKey = item.image_item!.media!.aes_key!;
    expect(parseAesKey(aesKey)).toEqual(Buffer.from(keyHex, "hex"));
    // All media types now use base64(hex string) — consistent with WeChat client expectations.
    expect(Buffer.from(aesKey, "base64").toString("ascii")).toBe(keyHex);
  });

  it("encodes file aes_key as base64 of the 32-char hex string", () => {
    const item = uploadedToMessageItem({ uploaded, kind: "file", fileName: "doc.pdf" });
    const aesKey = item.file_item!.media!.aes_key!;
    expect(parseAesKey(aesKey)).toEqual(Buffer.from(keyHex, "hex"));
    // Wire format the WeChat client expects for files: base64 of the ASCII hex.
    expect(Buffer.from(aesKey, "base64").toString("ascii")).toBe(keyHex);
  });

  it("creates voice metadata for an uploaded SILK file", () => {
    const item = uploadedToMessageItem({ uploaded, kind: "voice", duration: 40 });
    expect(item).toEqual({
      type: MessageItemType.VOICE,
      voice_item: {
        media: {
          encrypt_query_param: "dl-param",
          aes_key: Buffer.from(keyHex, "ascii").toString("base64"),
          encrypt_type: 1,
        },
        encode_type: 6,
        bits_per_sample: 16,
        sample_rate: 24_000,
        playtime: 40,
      },
    });
  });
});

describe("inferUploadKind", () => {
  it("maps SILK audio attachments to Weixin voice uploads", async () => {
    const silk = Buffer.concat([Buffer.from("#!SILK_V3"), Buffer.from([1, 0, 0])]);
    await expect(inferUploadKind("audio/silk", "audio", silk)).resolves.toEqual({
      kind: "voice",
      mediaType: 4,
      duration: 20,
    });
  });

  it("keeps non-SILK audio as a file attachment", async () => {
    await expect(
      inferUploadKind("audio/mpeg", "audio", Buffer.from("not silk")),
    ).resolves.toEqual({ kind: "file", mediaType: 3 });
  });
});

describe("voice message handling", () => {
  it("skips the audio attachment when the server provides a transcription", () => {
    const attachment = attachmentFromMessageItem({
      cdnBaseUrl: "https://cdn.example/c2c",
      item: {
        type: MessageItemType.VOICE,
        voice_item: {
          text: "你好",
          media: { encrypt_query_param: "voice-param", aes_key: "AAAA" },
        },
      },
    });
    expect(attachment).toBeNull();
  });

  it("decrypts the SILK payload and exposes it as audio when there is no text", async () => {
    const keyHex = "00112233445566778899aabbccddeeff";
    // voice/file/video carry aes_key as base64 of the 32-char hex string.
    const aesKey = Buffer.from(keyHex, "ascii").toString("base64");
    const silk = Buffer.from("#!SILK_V3 raw payload fixture");
    const ciphertext = encryptAesEcb(silk, Buffer.from(keyHex, "hex"));
    const fetchFn = vi.fn(async () => new Response(new Uint8Array(ciphertext), { status: 200 }));

    const attachment = attachmentFromMessageItem({
      cdnBaseUrl: "https://cdn.example/c2c",
      fetchFn,
      item: {
        type: MessageItemType.VOICE,
        voice_item: { media: { encrypt_query_param: "voice-param", aes_key: aesKey } },
      },
    });

    expect(attachment?.type).toBe("audio");
    // silk-wasm cannot decode the fixture, so fetchData falls back to raw SILK.
    await expect(attachment?.fetchData?.()).resolves.toEqual(silk);
  });
});
