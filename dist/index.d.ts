import { Logger, Adapter, ChatInstance, WebhookOptions, Message, FormattedContent, AdapterPostableMessage, RawMessage, EmojiValue, FetchOptions, FetchResult, ThreadInfo, Attachment, BaseFormatConverter, Root } from 'chat';

interface WeixinAdapterConfig {
    accountId?: string;
    token?: string;
    baseUrl?: string;
    cdnBaseUrl?: string;
    userName?: string;
    botType?: string;
    routeTag?: string | number;
    polling?: WeixinPollingConfig;
    logger?: Logger;
}
interface WeixinPollingConfig {
    enabled?: boolean;
    longPollTimeoutMs?: number;
    retryDelayMs?: number;
    backoffDelayMs?: number;
    maxConsecutiveFailures?: number;
}
interface ResolvedWeixinAdapterConfig {
    accountId: string;
    token: string;
    baseUrl: string;
    cdnBaseUrl: string;
    userName: string;
    botType: string;
    routeTag?: string | number;
    polling: Required<WeixinPollingConfig>;
    logger?: Logger;
}
interface WeixinThreadId {
    accountId: string;
    userId: string;
}
interface CDNMedia {
    encrypt_query_param?: string;
    aes_key?: string;
    encrypt_type?: number;
    full_url?: string;
}
interface TextItem {
    text?: string;
}
interface ImageItem {
    media?: CDNMedia;
    thumb_media?: CDNMedia;
    aeskey?: string;
    url?: string;
    mid_size?: number;
    thumb_size?: number;
    thumb_height?: number;
    thumb_width?: number;
    hd_size?: number;
}
interface VoiceItem {
    media?: CDNMedia;
    encode_type?: number;
    bits_per_sample?: number;
    sample_rate?: number;
    playtime?: number;
    text?: string;
}
interface FileItem {
    media?: CDNMedia;
    file_name?: string;
    md5?: string;
    len?: string;
}
interface VideoItem {
    media?: CDNMedia;
    video_size?: number;
    play_length?: number;
    video_md5?: string;
    thumb_media?: CDNMedia;
    thumb_size?: number;
    thumb_height?: number;
    thumb_width?: number;
}
interface RefMessage {
    message_item?: MessageItem;
    title?: string;
}
interface MessageItem {
    type?: number;
    create_time_ms?: number;
    update_time_ms?: number;
    is_completed?: boolean;
    msg_id?: string;
    ref_msg?: RefMessage;
    text_item?: TextItem;
    image_item?: ImageItem;
    voice_item?: VoiceItem;
    file_item?: FileItem;
    video_item?: VideoItem;
}
interface WeixinMessage {
    seq?: number;
    message_id?: number;
    from_user_id?: string;
    to_user_id?: string;
    client_id?: string;
    create_time_ms?: number;
    update_time_ms?: number;
    delete_time_ms?: number;
    session_id?: string;
    group_id?: string;
    message_type?: number;
    message_state?: number;
    item_list?: MessageItem[];
    context_token?: string;
}
interface EnrichedWeixinMessage extends WeixinMessage {
    __isMe?: boolean;
}
interface GetUpdatesResp {
    ret?: number;
    errcode?: number;
    errmsg?: string;
    msgs?: WeixinMessage[];
    get_updates_buf?: string;
    longpolling_timeout_ms?: number;
}
interface SendMessageReq {
    msg?: WeixinMessage;
}
interface GetUploadUrlReq {
    filekey?: string;
    media_type?: number;
    to_user_id?: string;
    rawsize?: number;
    rawfilemd5?: string;
    filesize?: number;
    thumb_rawsize?: number;
    thumb_rawfilemd5?: string;
    thumb_filesize?: number;
    no_need_thumb?: boolean;
    aeskey?: string;
}
interface GetUploadUrlResp {
    upload_param?: string;
    thumb_upload_param?: string;
    upload_full_url?: string;
}
interface GetConfigResp {
    ret?: number;
    errmsg?: string;
    typing_ticket?: string;
}
interface SendTypingReq {
    ilink_user_id?: string;
    typing_ticket?: string;
    status?: number;
}
interface SendTypingResp {
    ret?: number;
    errmsg?: string;
}
interface WeixinLoginOptions {
    botType?: string;
    timeoutMs?: number;
    verbose?: boolean;
    onQRCode?: (qrCodeUrl: string) => void | Promise<void>;
    fetchFn?: typeof fetch;
}
interface WeixinLoginResult {
    accountId: string;
    token: string;
    baseUrl: string;
    userId?: string;
}
interface QRCodeResponse {
    qrcode: string;
    qrcode_img_content: string;
}
interface QRStatusResponse {
    status: "wait" | "scaned" | "confirmed" | "expired" | "scaned_but_redirect";
    bot_token?: string;
    ilink_bot_id?: string;
    baseurl?: string;
    ilink_user_id?: string;
    redirect_host?: string;
}
type WeixinFetch = typeof fetch;
interface WeixinProtocolOptions {
    baseUrl: string;
    token?: string;
    routeTag?: string | number;
    fetchFn?: WeixinFetch;
    channelVersion?: string;
}
interface WeixinApiOptions {
    timeoutMs?: number;
}

declare class WeixinProtocolClient {
    private readonly baseUrl;
    private readonly token?;
    private readonly routeTag?;
    private readonly fetchFn;
    private readonly channelVersion;
    constructor(options: WeixinProtocolOptions);
    getUpdates(params: {
        getUpdatesBuf?: string;
        timeoutMs?: number;
        signal?: AbortSignal;
    }): Promise<GetUpdatesResp>;
    sendMessage(body: SendMessageReq, options?: WeixinApiOptions): Promise<void>;
    getUploadUrl(body: GetUploadUrlReq, options?: WeixinApiOptions): Promise<GetUploadUrlResp>;
    getConfig(params: {
        ilinkUserId: string;
        contextToken?: string;
    }, options?: WeixinApiOptions): Promise<GetConfigResp>;
    sendTyping(body: SendTypingReq, options?: WeixinApiOptions): Promise<SendTypingResp>;
    fetchQRCode(botType?: string): Promise<QRCodeResponse>;
    pollQRStatus(qrcode: string): Promise<QRStatusResponse>;
    private postJson;
    private getJson;
    private buildCommonHeaders;
    private buildPostHeaders;
}

type InternalConfig = WeixinAdapterConfig & {
    protocolClient?: WeixinProtocolClient;
    fetchFn?: WeixinFetch;
};
declare class WeixinAdapter implements Adapter<WeixinThreadId, WeixinMessage> {
    readonly name = "weixin";
    readonly userName: string;
    readonly persistThreadHistory = true;
    private readonly config;
    private readonly converter;
    private readonly protocol;
    private readonly fetchFn?;
    private chat;
    private state;
    private logger;
    private abortController;
    private pollPromise;
    private nextPollTimeoutMs;
    constructor(config?: InternalConfig);
    initialize(chat: ChatInstance): Promise<void>;
    disconnect(): Promise<void>;
    encodeThreadId(data: WeixinThreadId): string;
    decodeThreadId(threadId: string): WeixinThreadId;
    channelIdFromThreadId(threadId: string): string;
    handleWebhook(_request: Request, _options?: WebhookOptions): Promise<Response>;
    parseMessage(raw: WeixinMessage): Message<WeixinMessage>;
    renderFormatted(content: FormattedContent): string;
    postMessage(threadId: string, message: AdapterPostableMessage): Promise<RawMessage<WeixinMessage>>;
    editMessage(_threadId: string, _messageId: string, _message: AdapterPostableMessage): Promise<RawMessage<WeixinMessage>>;
    deleteMessage(_threadId: string, _messageId: string): Promise<void>;
    addReaction(_threadId: string, _messageId: string, _emoji: EmojiValue | string): Promise<void>;
    removeReaction(_threadId: string, _messageId: string, _emoji: EmojiValue | string): Promise<void>;
    fetchMessages(_threadId: string, _options?: FetchOptions): Promise<FetchResult<WeixinMessage>>;
    fetchThread(threadId: string): Promise<ThreadInfo>;
    openDM(userId: string): Promise<string>;
    isDM(threadId: string): boolean;
    startTyping(threadId: string, _status?: string): Promise<void>;
    private pollLoop;
    pollOnce(signal?: AbortSignal): Promise<void>;
    private processInbound;
    private sendItems;
    private fileUploadToMessageItem;
    private attachmentToMessageItem;
    private attachmentsFromMessage;
    rehydrateAttachment(attachment: Attachment): Attachment;
    private assertInitialized;
}

declare function createWeixinAdapter(config?: Partial<WeixinAdapterConfig>): WeixinAdapter;

declare class WeixinFormatConverter extends BaseFormatConverter {
    toAst(platformText: string): Root;
    fromAst(ast: Root): string;
    renderPostable(message: AdapterPostableMessage): string;
}
declare function markdownToPlainText(text: string): string;

declare function startWeixinLogin(options?: WeixinLoginOptions): Promise<WeixinLoginResult>;

declare function encodeThreadId(data: WeixinThreadId): string;
declare function decodeThreadId(threadId: string): WeixinThreadId;
declare function channelIdFromThreadId(threadId: string): string;

export { type EnrichedWeixinMessage, type GetUpdatesResp, type MessageItem, type ResolvedWeixinAdapterConfig, WeixinAdapter, type WeixinAdapterConfig, WeixinFormatConverter, type WeixinLoginOptions, type WeixinLoginResult, type WeixinMessage, type WeixinPollingConfig, WeixinProtocolClient, type WeixinThreadId, channelIdFromThreadId, createWeixinAdapter, decodeThreadId, encodeThreadId, markdownToPlainText, startWeixinLogin };
