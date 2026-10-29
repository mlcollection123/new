import "dotenv/config";

export const config = {
  databaseUrl: process.env.DATABASE_URL ?? "postgres://agent:agent@localhost:5432/agent",
  anthropicKey: process.env.ANTHROPIC_API_KEY ?? "",
  model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5",
  apolloKey: process.env.APOLLO_API_KEY ?? "",
  senderName: process.env.SENDER_NAME ?? "",
  senderCompany: process.env.SENDER_COMPANY ?? "",
  senderAddress: process.env.SENDER_ADDRESS ?? "",
  smtpHost: process.env.SMTP_HOST ?? "",
  smtpPort: Number(process.env.SMTP_PORT ?? 587),
  smtpUser: process.env.SMTP_USER ?? "",
  smtpPass: process.env.SMTP_PASS ?? "",
  fromEmail: process.env.FROM_EMAIL ?? "",
  publicUrl: (process.env.PUBLIC_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  unsubSecret: process.env.UNSUB_SECRET ?? "",
  dailyCap: Number(process.env.DAILY_CAP ?? 20),
  sendDelayMs: Number(process.env.SEND_DELAY_MS ?? 60000),
  port: Number(process.env.PORT ?? 3000),
  imapHost: process.env.IMAP_HOST ?? "",
  imapPort: Number(process.env.IMAP_PORT ?? 993),
  imapUser: process.env.IMAP_USER ?? process.env.SMTP_USER ?? "",
  imapPass: process.env.IMAP_PASS ?? process.env.SMTP_PASS ?? "",
  // Days to wait after the previous email before each follow-up. "3,7" means two follow-ups.
  followupDays: (process.env.FOLLOWUP_DAYS ?? "3,7").split(",").map(Number).filter((n) => n > 0),
};
