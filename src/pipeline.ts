import { pool } from "./db.js";
import { scoreLead, writeEmail } from "./llm.js";
import { csvToLeads, runSources } from "./sources.js";
import { type Campaign, type Icp, IcpSchema, type Lead, type RawLead } from "./types.js";

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

export async function updateCampaign(id: number, offer: string, minScore: number, icp: unknown): Promise<void> {
  const parsed: Icp = IcpSchema.parse(icp);
  await pool.query("UPDATE campaigns SET offer=$2, min_score=$3, icp=$4 WHERE id=$1", [id, offer, minScore, parsed]);
}

export async function getCampaign(id: number): Promise<Campaign> {
  const { rows } = await pool.query("SELECT * FROM campaigns WHERE id=$1", [id]);
  if (!rows[0]) throw new Error(`Campaign ${id} not found`);
  return { ...rows[0], icp: IcpSchema.parse(JSON.parse(rows[0].icp)) } as Campaign;
}

export async function addLeads(campaignId: number, leads: RawLead[], source: string): Promise<number> {
  const c = await getCampaign(campaignId);
  let added = 0;
  for (const l of leads) {
    const email = l.email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) continue;
    if (l.domain && c.icp.excludeDomains.includes(l.domain)) continue;
    const { rowCount } = await pool.query(
      `INSERT INTO leads (campaign_id,email,first_name,last_name,title,company,domain,linkedin_url,raw,segment,
                          phone,city,country,website,industry,employees,company_linkedin,description,email_status,source,external_id)
       SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21
       WHERE NOT EXISTS (SELECT 1 FROM suppression WHERE email=$2)
       ON CONFLICT (campaign_id,email) DO NOTHING`,
      [campaignId, email, l.firstName, l.lastName, l.title, l.company, l.domain, l.linkedinUrl, l.raw ?? null, l.segment ?? null,
        l.phone, l.city, l.country, l.website, l.industry, l.employees, l.companyLinkedin, l.description, l.emailStatus, source, l.externalId],
    );
    added += rowCount ?? 0;
  }
  return added;
}

// Asks every enabled source for leads. They land as "new" so you can review and choose.
export async function sourceLeads(id: number, limit: number): Promise<string> {
  const c = await getCampaign(id);
  const results = await runSources(c.icp, limit);
  if (!results.length) throw new Error("No lead sources are switched on. Turn one on in the Sources page.");
  const lines: string[] = [];
  let total = 0;
  for (const r of results) {
    if (r.error) {
      lines.push(`${r.source}: failed. ${r.error}`);
      continue;
    }
    const added = await addLeads(id, r.leads, r.source);
    total += added;
    lines.push(`${r.source}: ${r.leads.length} found, ${added} new`);
  }
  lines.push(`Total ${total} new leads to review.`);
  if (total === 0 && results.every((r) => r.error)) throw new Error(lines.join("\n"));
  return lines.join("\n");
}

export async function importCsv(id: number, text: string, segment?: string): Promise<string> {
  const { leads, skipped } = csvToLeads(text, segment || undefined);
  const added = await addLeads(id, leads, "CSV import");
  return `${added} new leads imported, ${leads.length - added} already known or blocked, ${skipped} rows without a valid email.`;
}

// Optional help for choosing: Claude rates how well each unrated lead fits. It never rejects anyone.
export async function scoreLeads(id: number): Promise<{ rated: number }> {
  const c = await getCampaign(id);
  const { rows } = await pool.query("SELECT * FROM leads WHERE campaign_id=$1 AND status='new' AND score IS NULL", [id]);
  let rated = 0;
  for (const lead of rows as Lead[]) {
    const { score, reason } = await scoreLead(c, lead);
    await pool.query("UPDATE leads SET score=$2, score_reason=$3 WHERE id=$1", [lead.id, score, reason]);
    rated++;
  }
  return { rated };
}

export async function setLeadStatus(ids: number[], status: "chosen" | "skipped" | "new"): Promise<number> {
  let n = 0;
  for (const id of ids) {
    const { rowCount } = await pool.query("UPDATE leads SET status=$2 WHERE id=$1 AND status IN ('new','chosen','skipped')", [id, status]);
    n += rowCount;
  }
  return n;
}

export async function chooseAbove(campaignId: number, minScore: number): Promise<number> {
  const { rowCount } = await pool.query("UPDATE leads SET status='chosen' WHERE campaign_id=$1 AND status='new' AND score>=$2", [campaignId, minScore]);
  return rowCount;
}

export async function writeDrafts(id: number): Promise<number> {
  const c = await getCampaign(id);
  const { rows } = await pool.query("SELECT * FROM leads WHERE campaign_id=$1 AND status='chosen'", [id]);
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
    `SELECT m.id, m.step, m.subject, m.body, m.status, l.email, l.company, l.score
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

export async function editDraft(messageId: number, subject: string, body: string): Promise<void> {
  await pool.query("UPDATE messages SET subject=$2, body=$3 WHERE id=$1 AND status='draft'", [messageId, subject, body]);
}

export async function reject(messageId: number): Promise<void> {
  await pool.query("UPDATE messages SET status='rejected' WHERE id=$1 AND status IN ('draft','approved')", [messageId]);
}

export async function suppress(email: string, reason = "unsubscribe"): Promise<void> {
  await pool.query("INSERT INTO suppression (email, reason) VALUES ($1,$2) ON CONFLICT DO NOTHING", [email.toLowerCase(), reason]);
}
