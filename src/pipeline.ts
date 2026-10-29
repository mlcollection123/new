import { pool } from "./db.js";
import { scoreLead, writeEmail } from "./llm.js";
import { searchLeads } from "./providers/apollo.js";
import { type Campaign, type Icp, IcpSchema, type Lead } from "./types.js";

export async function createCampaign(name: string, offer: string, icp: unknown, minScore = 60): Promise<number> {
  const parsed = IcpSchema.parse(icp);
  const { rows } = await pool.query(
    "INSERT INTO campaigns (name, offer, icp, min_score) VALUES ($1,$2,$3,$4) RETURNING id",
    [name, offer, parsed, minScore],
  );
  return rows[0].id;
}

export async function updateIcp(id: number, icp: unknown): Promise<void> {
  const parsed: Icp = IcpSchema.parse(icp);
  await pool.query("UPDATE campaigns SET icp=$2 WHERE id=$1", [id, parsed]);
}

export async function getCampaign(id: number): Promise<Campaign> {
  const { rows } = await pool.query("SELECT * FROM campaigns WHERE id=$1", [id]);
  if (!rows[0]) throw new Error(`Campaign ${id} not found`);
  return rows[0] as Campaign;
}

export async function sourceLeads(id: number, limit: number): Promise<number> {
  const c = await getCampaign(id);
  const found = await searchLeads(c.icp, limit);
  let added = 0;
  for (const l of found) {
    const email = l.email.toLowerCase();
    if (l.domain && c.icp.excludeDomains.includes(l.domain)) continue;
    const { rowCount } = await pool.query(
      `INSERT INTO leads (campaign_id,email,first_name,last_name,title,company,domain,linkedin_url,raw)
       SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9
       WHERE NOT EXISTS (SELECT 1 FROM suppression WHERE email=$2)
       ON CONFLICT (campaign_id,email) DO NOTHING`,
      [id, email, l.firstName, l.lastName, l.title, l.company, l.domain, l.linkedinUrl, l.raw ?? null],
    );
    added += rowCount ?? 0;
  }
  return added;
}

export async function scoreLeads(id: number): Promise<{ kept: number; rejected: number }> {
  const c = await getCampaign(id);
  const { rows } = await pool.query("SELECT * FROM leads WHERE campaign_id=$1 AND status='new'", [id]);
  let kept = 0;
  let rejected = 0;
  for (const lead of rows as Lead[]) {
    const { score, reason } = await scoreLead(c, lead);
    const status = score >= c.min_score ? "scored" : "rejected";
    await pool.query("UPDATE leads SET score=$2, score_reason=$3, status=$4 WHERE id=$1", [lead.id, score, reason, status]);
    status === "scored" ? kept++ : rejected++;
  }
  return { kept, rejected };
}

export async function writeDrafts(id: number): Promise<number> {
  const c = await getCampaign(id);
  const { rows } = await pool.query("SELECT * FROM leads WHERE campaign_id=$1 AND status='scored'", [id]);
  for (const lead of rows as Lead[]) {
    const { subject, body } = await writeEmail(c, lead);
    await pool.query(
      "INSERT INTO messages (lead_id, step, channel, subject, body) VALUES ($1,1,'email',$2,$3) ON CONFLICT DO NOTHING",
      [lead.id, subject, body],
    );
    await pool.query("UPDATE leads SET status='drafted' WHERE id=$1", [lead.id]);
  }
  return rows.length;
}

export async function listDrafts(id: number) {
  const { rows } = await pool.query(
    `SELECT m.id, m.subject, m.body, m.status, l.email, l.company, l.score
     FROM messages m JOIN leads l ON l.id=m.lead_id
     WHERE l.campaign_id=$1 AND m.status='draft' ORDER BY l.score DESC`,
    [id],
  );
  return rows;
}

export async function approve(messageId: number | "all", campaignId?: number): Promise<number> {
  if (messageId === "all") {
    const { rowCount } = await pool.query(
      `UPDATE messages SET status='approved' WHERE status='draft'
       AND lead_id IN (SELECT id FROM leads WHERE campaign_id=$1)`,
      [campaignId],
    );
    return rowCount ?? 0;
  }
  const { rowCount } = await pool.query("UPDATE messages SET status='approved' WHERE id=$1 AND status='draft'", [messageId]);
  return rowCount ?? 0;
}

export async function suppress(email: string, reason = "unsubscribe"): Promise<void> {
  await pool.query("INSERT INTO suppression (email, reason) VALUES ($1,$2) ON CONFLICT DO NOTHING", [email.toLowerCase(), reason]);
}
