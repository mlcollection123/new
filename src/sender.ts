import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
import { config } from "./config.js";
import { pool } from "./db.js";
import { processReplies } from "./replies.js";
import { unsubscribeUrl } from "./unsubscribe.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Outgoing {
  id: number;
  lead_id: number;
  lead_status: string;
  thread_ids: string[];
  email: string;
  first_name: string | null;
  subject: string | null;
  body: string;
}

function footer(email: string): string {
  return (
    `\n\n--\n${config.senderName}, ${config.senderCompany}\n${config.senderAddress}\n` +
    (config.unsubMode === "link"
      ? `Not relevant? Unsubscribe: ${unsubscribeUrl(email)}`
      : `Not relevant? Reply "unsubscribe" and I will not write again.`)
  );
}

function requireLiveConfig(): void {
  const missing = (
    [
      ["SMTP_HOST", config.smtpHost],
      ["SMTP_USER", config.smtpUser],
      ["SMTP_PASS", config.smtpPass],
      ["FROM_EMAIL", config.fromEmail],
      ["SENDER_NAME", config.senderName],
      ["SENDER_COMPANY", config.senderCompany],
      ["SENDER_ADDRESS", config.senderAddress],
      ...(config.unsubMode === "link"
        ? ([["UNSUB_SECRET", config.unsubSecret], ["PUBLIC_URL", process.env.PUBLIC_URL ?? ""]] as const)
        : ([["IMAP_HOST", config.imapHost]] as const)),
    ] as const
  )
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length) throw new Error(`Cannot send live, missing: ${missing.join(", ")}`);
}

export async function sendApproved(campaignId: number, live: boolean): Promise<{ sent: number; failed: number; skipped: number; remainingToday: number }> {
  if (live) requireLiveConfig();
  else if (!config.unsubSecret) config.unsubSecret = "dry-run-secret";

  // Reply-based opt-out only works if we read the replies first, so nobody who said stop gets another email.
  if (live && config.unsubMode === "reply") {
    console.log("reading inbox before sending", await processReplies(7));
  }

  const { rows: today } = await pool.query(
    "SELECT count(*)::int AS n FROM messages WHERE status='sent' AND sent_at >= date_trunc('day', now())",
  );
  const remaining = Math.max(0, config.dailyCap - today[0].n);

  const { rows } = await pool.query(
    `SELECT m.id, m.lead_id, l.status AS lead_status, l.email, l.first_name, m.subject, m.body,
       ARRAY(SELECT p.message_id FROM messages p
             WHERE p.lead_id=m.lead_id AND p.status='sent' AND p.step<m.step AND p.message_id IS NOT NULL
             ORDER BY p.step) AS thread_ids
     FROM messages m JOIN leads l ON l.id=m.lead_id
     WHERE l.campaign_id=$1 AND m.status='approved' AND m.channel='email'
     ORDER BY m.step DESC, l.score DESC NULLS LAST, m.id LIMIT $2`,
    [campaignId, remaining],
  );

  const transport = live
    ? nodemailer.createTransport({
        host: config.smtpHost,
        port: config.smtpPort,
        secure: config.smtpPort === 465,
        auth: { user: config.smtpUser, pass: config.smtpPass },
      })
    : null;

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const m of rows as Outgoing[]) {
    if (m.lead_status === "replied" || m.lead_status === "closed") {
      await pool.query("UPDATE messages SET status='rejected', error='lead replied or closed' WHERE id=$1", [m.id]);
      skipped++;
      continue;
    }
    const { rowCount: suppressed } = await pool.query("SELECT 1 FROM suppression WHERE email=$1", [m.email]);
    if (suppressed) {
      await pool.query("UPDATE messages SET status='rejected', error='suppressed' WHERE id=$1", [m.id]);
      skipped++;
      continue;
    }

    const text = m.body + footer(m.email);

    if (!transport) {
      console.log(`\n[dry run] to ${m.email}\nSubject: ${m.subject}\n${text}`);
      continue;
    }

    // Claim first so two runs can never send the same message.
    const claim = await pool.query("UPDATE messages SET status='sending' WHERE id=$1 AND status='approved'", [m.id]);
    if (!claim.rowCount) continue;

    try {
      const unsub = config.unsubMode === "link" ? unsubscribeUrl(m.email) : null;
      const messageId = `<${randomUUID()}@${config.fromEmail.split("@")[1]}>`;
      const thread = m.thread_ids.length
        ? { inReplyTo: m.thread_ids[m.thread_ids.length - 1], references: m.thread_ids }
        : {};
      await transport.sendMail({
        messageId,
        ...thread,
        from: `"${config.senderName}" <${config.fromEmail}>`,
        to: m.email,
        subject: m.subject ?? "",
        text,
        headers: unsub
          ? { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
          : { "List-Unsubscribe": `<mailto:${config.fromEmail}?subject=unsubscribe>` },
      });
      await pool.query("UPDATE messages SET status='sent', sent_at=now(), message_id=$2 WHERE id=$1", [m.id, messageId]);
      await pool.query("UPDATE leads SET status='contacted' WHERE id=$1 AND status IN ('drafted','scored')", [m.lead_id]);
      sent++;
    } catch (e) {
      await pool.query("UPDATE messages SET status='failed', error=$2 WHERE id=$1", [m.id, e instanceof Error ? e.message : String(e)]);
      failed++;
    }
    await sleep(config.sendDelayMs);
  }

  return { sent, failed, skipped, remainingToday: remaining - sent };
}
