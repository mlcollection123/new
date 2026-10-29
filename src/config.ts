import dotenv from "dotenv";

dotenv.config();

const env = (key: string, fallback = "") => process.env[key] ?? fallback;

function build() {
  return {
    dbPath: env("DB_PATH", "data/agent.db"),
    anthropicKey: env("ANTHROPIC_API_KEY"),
    model: env("ANTHROPIC_MODEL", "claude-sonnet-5-5"),
    apolloKey: env("APOLLO_API_KEY"),
    senderName: env("SENDER_NAME"),
    senderCompany: env("SENDER_COMPANY"),
    senderAddress: env("SENDER_ADDRESS"),
    smtpHost: env("SMTP_HOST"),
    smtpPort: Number(env("SMTP_PORT", "587")),
    smtpUser: env("SMTP_USER"),
    smtpPass: env("SMTP_PASS"),
    fromEmail: env("FROM_EMAIL"),
    publicUrl: env("PUBLIC_URL", "http://localhost:3000").replace(/\/$/, ""),
    // reply: footer asks people to reply "unsubscribe" (no public server needed).
    // link: signed unsubscribe URL, needs `serve` on a public HTTPS address.
    unsubMode: (env("UNSUB_MODE") === "link" ? "link" : "reply") as "link" | "reply",
    unsubSecret: env("UNSUB_SECRET"),
    dailyCap: Number(env("DAILY_CAP", "5")),
    sendDelayMs: Number(env("SEND_DELAY_MS", "120000")),
    port: Number(env("PORT", "3000")),
    dashboardPassword: env("DASHBOARD_PASSWORD"),
    dashboardHost: env("DASHBOARD_HOST", "127.0.0.1"),
    dashboardPort: Number(env("DASHBOARD_PORT", "4000")),
    imapHost: env("IMAP_HOST"),
    imapPort: Number(env("IMAP_PORT", "993")),
    imapUser: env("IMAP_USER") || env("SMTP_USER"),
    imapPass: env("IMAP_PASS") || env("SMTP_PASS"),
    // Days to wait after the previous email before each follow-up. "3,7" means two follow-ups.
    followupDays: env("FOLLOWUP_DAYS", "3,7").split(",").map(Number).filter((n) => n > 0),
  };
}

export const config = build();

// Re-reads .env so changes made in the dashboard apply without a restart.
export function reloadConfig(): void {
  dotenv.config({ override: true });
  Object.assign(config, build());
}
