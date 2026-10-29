import { ImapFlow } from "imapflow";
import { config } from "./config.js";
import { smtpTransport } from "./sender.js";

export async function testSmtp(): Promise<string> {
  if (!config.smtpHost || !config.smtpUser || !config.smtpPass || !config.fromEmail) {
    throw new Error("Fill in the mailbox address, SMTP server, username and password first");
  }
  const t = smtpTransport();
  await t.verify();
  await t.sendMail({
    from: config.fromEmail,
    to: config.fromEmail,
    subject: "Lead agent test",
    text: "If you can read this, sending works. Open this message in Gmail, choose Show original, and check SPF, DKIM and DMARC say PASS.",
  });
  return `Login works. A test email was sent to ${config.fromEmail}.`;
}

export async function testImap(): Promise<string> {
  if (!config.imapHost) throw new Error("Fill in the IMAP server first");
  const client = new ImapFlow({
    host: config.imapHost,
    port: config.imapPort,
    secure: config.imapPort === 993,
    auth: { user: config.imapUser, pass: config.imapPass },
    logger: false,
  });
  await client.connect();
  const lock = await client.getMailboxLock("INBOX", { readOnly: true });
  const n = client.mailbox ? client.mailbox.exists : 0;
  lock.release();
  await client.logout();
  return `Connected. ${n} messages in the inbox.`;
}
