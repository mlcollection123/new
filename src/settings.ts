import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { reloadConfig } from "./config.js";

export interface Field {
  key: string;
  label: string;
  secret?: boolean;
  hint?: string;
}

export const FIELDS: { group: string; fields: Field[] }[] = [
  {
    group: "AI and leads",
    fields: [
      { key: "ANTHROPIC_API_KEY", label: "Anthropic API key", secret: true, hint: "Scores leads and writes emails" },
      { key: "APOLLO_API_KEY", label: "Apollo API key", secret: true, hint: "Leave empty to use sample leads" },
    ],
  },
  {
    group: "Who you are (goes in every email footer)",
    fields: [
      { key: "SENDER_NAME", label: "Your name" },
      { key: "SENDER_COMPANY", label: "Company" },
      { key: "SENDER_ADDRESS", label: "Postal address", hint: "Required by anti-spam law" },
    ],
  },
  {
    group: "Sending mailbox (SMTP)",
    fields: [
      { key: "FROM_EMAIL", label: "Mailbox email address" },
      { key: "SMTP_HOST", label: "SMTP server", hint: "Namecheap: cPanel > Email Accounts > Connect Devices" },
      { key: "SMTP_PORT", label: "SMTP port", hint: "465 or 587" },
      { key: "SMTP_USER", label: "SMTP username", hint: "Usually the full email address" },
      { key: "SMTP_PASS", label: "SMTP password", secret: true },
    ],
  },
  {
    group: "Reading replies (IMAP)",
    fields: [
      { key: "IMAP_HOST", label: "IMAP server", hint: "Usually the same server as SMTP" },
      { key: "IMAP_PORT", label: "IMAP port", hint: "993" },
    ],
  },
  {
    group: "Limits",
    fields: [
      { key: "DAILY_CAP", label: "Emails per day", hint: "Keep at 5 to 10 while the domain is new" },
      { key: "SEND_DELAY_MS", label: "Pause between emails (milliseconds)", hint: "120000 is 2 minutes" },
      { key: "FOLLOWUP_DAYS", label: "Follow-up schedule (days)", hint: "3,7 means two follow-ups" },
    ],
  },
];

const ENV_PATH = ".env";

function readLines(): string[] {
  return existsSync(ENV_PATH) ? readFileSync(ENV_PATH, "utf8").split(/\r?\n/) : [];
}

function quote(value: string): string {
  if (/[\r\n]/.test(value)) throw new Error("Values cannot contain line breaks");
  if (!/["\\]/.test(value)) return `"${value}"`;
  if (!/['\\]/.test(value)) return `'${value}'`;
  throw new Error("A value mixes quote marks and backslashes, which cannot be stored safely");
}

export function isSet(key: string): boolean {
  return !!process.env[key];
}

// Empty secret fields keep their old value. Everything else is replaced.
export function saveSettings(values: Record<string, string>): void {
  const secret = new Set(FIELDS.flatMap((g) => g.fields).filter((f) => f.secret).map((f) => f.key));
  const lines = readLines();
  for (const [key, raw] of Object.entries(values)) {
    const value = raw.trim();
    if (secret.has(key) && value === "") continue;
    const line = value === "" ? `${key}=` : `${key}=${quote(value)}`;
    const i = lines.findIndex((l) => l.startsWith(key + "="));
    if (i >= 0) lines[i] = line;
    else lines.push(line);
    process.env[key] = value;
  }
  writeFileSync(ENV_PATH, lines.filter((l, i, a) => l !== "" || i < a.length - 1).join("\n") + "\n", { mode: 0o600 });
  reloadConfig();
}
