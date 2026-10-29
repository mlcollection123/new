import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { config } from "./config.js";
import { pool } from "./db.js";
import { classifyReply } from "./llm.js";
import { getCampaign, suppress } from "./pipeline.js";
import type { Lead } from "./types.js";

interface Incoming {
  messageId: string;
  from: string;
  subject: string;
  text: string;
  date: Date;
  refs: string[];
}

const BOUNCE_SENDER = /mailer-daemon|postmaster/i;

async function fetchRecent(days: number): Promise<Incoming[]> {
  if (!config.imapHost) throw new Error("IMAP_HOST is not set");
  const client = new ImapFlow({
    host: config.imapHost,
    port: config.imapPort,
    secure: config.imapPort === 993,
    auth: { user: config.imapUser, pass: config.imapPass },
    logger: false,
  });
  await client.connect();
  const out: Incoming[] = [];
  const lock = await client.getMailboxLock("INBOX", { readOnly: true });
  try {
    const raw: Buffer[] = [];
    for await (const msg of client.fetch({ since: new Date(Date.now() - days * 86_400_000) }, { source: true })) {
      if (msg.source) raw.push(msg.source);
    }
    for (const src of raw) {
      const m = await simpleParser(src);
      if (!m.messageId) continue;
      const refs = [m.inReplyTo, ...(Array.isArray(m.references) ? m.references : m.references ? [m.references] : [])].filter(
        (x): x is string => !!x,
      );
      out.push({
        messageId: m.messageId,
        from: (m.from?.value[0]?.address ?? "").toLowerCase(),
        subject: m.subject ?? "",
        text: m.text ?? "",
        date: m.date ?? new Date(),
        refs,
      });
    }
  } finally {
    lock.release();
  }
  await client.logout();
  return out;
}

async function findLead(m: Incoming): Promise<Lead | undefined> {
  if (m.refs.length) {
    const { rows } = await pool.query(
      "SELECT l.* FROM messages x JOIN leads l ON l.id=x.lead_id WHERE x.message_id = ANY($1) LIMIT 1",
      [m.refs],
    );
    if (rows[0]) return rows[0];
  }
  if (BOUNCE_SENDER.test(m.from)) {
    // Bounce notices quote the failed recipient in the body.
    const addrs = [...new Set((m.text.match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g) ?? []).map((a) => a.toLowerCase()))];
    if (addrs.length) {
      const { rows } = await pool.query("SELECT * FROM leads WHERE email = ANY($1) AND status='contacted' LIMIT 1", [addrs]);
      if (rows[0]) return rows[0];
    }
    return undefined;
  }
  const { rows } = await pool.query("SELECT * FROM leads WHERE email=$1 AND status IN ('contacted','replied') ORDER BY id DESC LIMIT 1", [m.from]);
  return rows[0];
}

// Reads the last `days` of the inbox without changing it, classifies new replies, and applies the result.
export async function processReplies(days = 14): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const m of await fetchRecent(days)) {
    const { rowCount: seen } = await pool.query("SELECT 1 FROM replies WHERE message_id=$1", [m.messageId]);
    if (seen) continue;
    const lead = await findLead(m);
    if (!lead) continue;

    const c = await getCampaign(lead.campaign_id);
    const r = await classifyReply(c, lead, m.subject, m.text);
    counts[r.category] = (counts[r.category] ?? 0) + 1;

    const stops = ["unsubscribe", "not_interested", "bounce"].includes(r.category);
    const needsHuman = ["interested", "not_now", "objection", "other"].includes(r.category);

    await pool.query(
      `INSERT INTO replies (lead_id, message_id, received_at, subject, body, category, summary, suggested_reply, handled)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [lead.id, m.messageId, m.date, m.subject, m.text.slice(0, 5000), r.category, r.summary, r.suggested_reply ?? null, !needsHuman],
    );

    if (stops) {
      await suppress(lead.email, r.category);
      await pool.query("UPDATE leads SET status='closed' WHERE id=$1", [lead.id]);
    } else if (needsHuman) {
      await pool.query("UPDATE leads SET status='replied' WHERE id=$1", [lead.id]);
    }
    if (stops || needsHuman) {
      await pool.query("UPDATE messages SET status='rejected', error='lead replied' WHERE lead_id=$1 AND status IN ('draft','approved')", [lead.id]);
    }
  }
  return counts;
}

export async function listInbox(campaignId?: number) {
  const { rows } = await pool.query(
    `SELECT r.id, r.category, r.summary, r.body, r.suggested_reply, l.email, l.company, l.segment
     FROM replies r JOIN leads l ON l.id=r.lead_id
     WHERE r.handled=false AND ($1::int IS NULL OR l.campaign_id=$1)
     ORDER BY (r.category='interested') DESC, r.created_at`,
    [campaignId ?? null],
  );
  return rows;
}

export async function markHandled(replyId: number): Promise<void> {
  await pool.query("UPDATE replies SET handled=true WHERE id=$1", [replyId]);
}
