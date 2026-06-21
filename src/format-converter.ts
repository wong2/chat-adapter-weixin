import {
  BaseFormatConverter,
  markdownToPlainText as sdkMarkdownToPlainText,
  parseMarkdown,
  stringifyMarkdown,
  type AdapterPostableMessage,
  type Root,
} from "chat";

export class WeixinFormatConverter extends BaseFormatConverter {
  toAst(platformText: string): Root {
    return parseMarkdown(platformText);
  }

  fromAst(ast: Root): string {
    return markdownToPlainText(stringifyMarkdown(ast));
  }

  renderPostable(message: AdapterPostableMessage): string {
    return markdownToPlainText(super.renderPostable(message));
  }
}

export function markdownToPlainText(text: string): string {
  return sdkMarkdownToPlainText(text)
    .replace(/^\|[\s:|-]+\|$/gm, "")
    .replace(/^\|(.+)\|$/gm, (_match, inner: string) =>
      inner
        .split("|")
        .map((cell) => cell.trim())
        .filter(Boolean)
        .join("  "),
    )
    .trim();
}
