#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import qrcode from "qrcode-terminal";
import { startWeixinLogin } from "./login.js";
import type { WeixinLoginResult } from "./types.js";

interface CliOptions {
  json: boolean;
  env: boolean;
  save: boolean;
  stateDir: string;
  botType?: string;
  timeoutMs?: number;
}

async function main(): Promise<void> {
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
        process.stderr.write(`${output}\n`);
      });
      process.stderr.write(`\nIf the QR code does not render, open this URL:\n${url}\n\n`);
    },
  });
  process.stderr.write("\nWeixin login succeeded.\n");

  if (options.save) {
    await saveCredentials(options.stateDir, result);
    process.stderr.write(`Saved credentials to ${credentialPath(options.stateDir, result.accountId)}\n`);
  }

  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  printEnv(result);
}

function parseLoginArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    json: false,
    env: false,
    save: false,
    stateDir: path.join(os.homedir(), ".chat-adapter-weixin"),
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

function requireValue(args: string[], index: number, flag: string): string {
  const value = args[index];
  if (!value) throw new Error(`${flag} requires a value`);
  return value;
}

function printEnv(result: WeixinLoginResult): void {
  process.stdout.write(`export WEIXIN_ACCOUNT_ID=${shellQuote(result.accountId)}\n`);
  process.stdout.write(`export WEIXIN_BOT_TOKEN=${shellQuote(result.token)}\n`);
  process.stdout.write(`export WEIXIN_BASE_URL=${shellQuote(result.baseUrl)}\n`);
  if (result.userId) {
    process.stdout.write(`export WEIXIN_USER_ID=${shellQuote(result.userId)}\n`);
  }
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

async function saveCredentials(stateDir: string, result: WeixinLoginResult): Promise<void> {
  const filePath = credentialPath(stateDir, result.accountId);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify({ ...result, savedAt: new Date().toISOString() }, null, 2)}\n`, {
    mode: 0o600,
  });
  await fs.chmod(filePath, 0o600).catch(() => undefined);
}

function credentialPath(stateDir: string, accountId: string): string {
  return path.join(stateDir, "accounts", `${sanitizeFileName(accountId)}.json`);
}

function sanitizeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-");
}

function printHelp(): void {
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
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
