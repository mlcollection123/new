import { config } from "./config.js";
import { pool } from "./db.js";
import { writeFollowup } from "./llm.js";
import { getCampaign } from "./pipeline.js";
import type { Lead } from "./types.js";

const DAY = 86_400_000;

// Drafts the next follow-up for contacted leads that have not replied.
// Drafts still go through `approve` like first emails.
export async function draftFollowups(campaignId: number): Promise<number> {
  const c = await getCampaign(campaignId);
  const maxStep = config.followupDays.length + 1;

  const { rows } = await pool.query(
    `SELECT l.*, lm.step AS last_step, lm.sent_at AS last_sent, fm.subject AS first_subject, fm.body AS first_body
     FROM leads l
     JOIN LATERAL (SELECT step, sent_at FROM messages WHERE lead_id=l.id AND status='sent' ORDER BY step DESC LIMIT 1) lm ON true
     JOIN LATERAL (SELECT subject, body FROM messages WHERE lead_id=l.id AND step=1 AND channel='email') fm ON true
     WHERE l.campaign_id=$1 AND l.status='contacted'
       AND NOT EXISTS (SELECT 1 FROM suppression s WHERE s.email=l.email)`,
    [campaignId],
  );

  let drafted = 0;
  for (const r of rows as (Lead & { last_step: number; last_sent: Date; first_subject: string | null; first_body: string })[]) {
    const next = r.last_step + 1;
    if (next > maxStep) continue;
    const wait = config.followupDays[next - 2];
    if (Date.now() < r.last_sent.getTime() + wait * DAY) continue;

    const { rowCount: exists } = await pool.query("SELECT 1 FROM messages WHERE lead_id=$1 AND step=$2 AND channel='email'", [r.id, next]);
    if (exists) continue;

    const { body } = await writeFollowup(c, r, next, next === maxStep, r.first_body);
    await pool.query(
      "INSERT INTO messages (lead_id, step, channel, subject, body) VALUES ($1,$2,'email',$3,$4) ON CONFLICT DO NOTHING",
      [r.id, next, `Re: ${r.first_subject ?? ""}`, body],
    );
    drafted++;
  }
  return drafted;
}
