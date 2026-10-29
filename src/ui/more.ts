import { config } from "../config.js";
import { pool } from "../db.js";
import { FIELDS, isSet } from "../settings.js";
import { DEFAULT_ICP, DEFAULT_NAME, DEFAULT_OFFER } from "../templates.js";
import { badge, esc, fullName, hidden, icon, pageHead, STATUS_LABEL, type Ctx, when } from "./kit.js";

// ---------- Leads ----------

export async function leadsView(x: Ctx, status: string, q: string): Promise<string> {
  const counts = (await pool.query("SELECT status, count(*) n FROM leads WHERE campaign_id=$1 GROUP BY status", [x.c])).rows;
  const total = counts.reduce((a, r) => a + Number(r.n), 0);
  const order = ["new", "scored", "drafted", "contacted", "replied", "closed", "rejected"];
  const tab = (k: string, label: string, n: number) =>
    `<a href="/?c=${x.c}&tab=leads&f=${k}&q=${encodeURIComponent(q)}" class="${status === k ? "on" : ""}">${label}<span>${n}</span></a>`;
  const tabs = `<div class="tabs">${tab("all", "All", total)}${order.map((s) => tab(s, STATUS_LABEL[s], Number(counts.find((r) => r.status === s)?.n ?? 0))).join("")}</div>`;

  const params: (string | number)[] = [x.c];
  let where = "campaign_id=$1";
  if (order.includes(status)) {
    params.push(status);
    where += ` AND status=$${params.length}`;
  }
  if (q.trim()) {
    params.push(`%${q.trim().toLowerCase()}%`);
    where += ` AND (lower(coalesce(first_name,'')||' '||coalesce(last_name,'')) LIKE $${params.length} OR lower(coalesce(company,'')) LIKE $${params.length} OR lower(email) LIKE $${params.length})`;
  }
  const { rows } = await pool.query(
    `SELECT first_name,last_name,title,company,segment,email,score,score_reason,status FROM leads WHERE ${where} ORDER BY score DESC NULLS LAST, id DESC LIMIT 300`,
    params,
  );
  const tone: Record<string, string> = { new: "", scored: "active", drafted: "wait", contacted: "active", replied: "good", closed: "", rejected: "bad" };
  const table = rows.length
    ? `<div class="card flush"><table><tr><th>Contact</th><th>Company</th><th>Segment</th><th>Score</th><th>Status</th></tr>${rows
        .map(
          (r) => `<tr><td><b style="font-weight:500">${esc(fullName(r))}</b><div class="meta">${esc(r.title)} · ${esc(r.email)}</div></td><td>${esc(r.company)}</td><td>${esc(r.segment)}</td><td title="${esc(r.score_reason)}">${esc(r.score ?? "")}</td><td>${badge(STATUS_LABEL[r.status] ?? r.status, tone[r.status])}</td></tr>`,
        )
        .join("")}</table></div>`
    : `<div class="card empty">No leads match. Use Find leads on the Today page.</div>`;
  const search = `<form class="filters" method="get"><input type="hidden" name="c" value="${x.c}"><input type="hidden" name="tab" value="leads"><input type="hidden" name="f" value="${esc(status)}"><input type="text" name="q" value="${esc(q)}" placeholder="Search name, company, email"><button class="btn">Search</button></form>`;
  return pageHead("Leads", "Everyone the agent has found for this campaign. Hover a score to see why.") + tabs + search + table;
}

// ---------- Campaign ----------

export async function campaignView(x: Ctx): Promise<string> {
  const cur = (await pool.query("SELECT * FROM campaigns WHERE id=$1", [x.c])).rows[0];
  const edit = cur
    ? `<form class="card" method="post" action="/campaign/update">${hidden(x, "campaign")}<input type="hidden" name="id" value="${cur.id}">
<div class="card-head"><h3>${esc(cur.name)}</h3></div>
<label>What you offer <span class="meta">Claude uses this in every email</span></label><input type="text" name="offer" value="${esc(cur.offer)}">
<label>Minimum score to keep a lead <span class="meta">0 to 100. Higher is stricter.</span></label><input type="number" name="min_score" value="${cur.min_score}" min="0" max="100" style="width:100px">
<label>Who to target <span class="meta">Segments, each with its own pitch and pain. Edit any time. Change every "pitch" and "pain" line to what is true for you.</span></label>
<textarea class="tall" name="icp" spellcheck="false">${esc(JSON.stringify(JSON.parse(cur.icp), null, 2))}</textarea>
<div class="actions" style="margin-top:14px"><button class="btn primary">Save campaign</button></div></form>`
    : "";
  const create = `<form class="card" method="post" action="/campaign/create">${hidden(x, "campaign")}
<div class="card-head"><h3>${cur ? "New campaign" : "Create your first campaign"}</h3></div>
<label>Name</label><input type="text" name="name" value="${esc(DEFAULT_NAME)}">
<label>What you offer</label><input type="text" name="offer" value="${esc(DEFAULT_OFFER)}">
<label>Minimum score to keep a lead</label><input type="number" name="min_score" value="60" min="0" max="100" style="width:100px">
<label>Who to target <span class="meta">Starts from the VATcube template.</span></label>
<textarea class="tall" name="icp" spellcheck="false">${esc(DEFAULT_ICP)}</textarea>
<div class="actions" style="margin-top:14px"><button class="btn primary">Create campaign</button></div></form>`;
  return pageHead("Campaign", "Who the agent looks for and what it says to them.") + edit + create;
}

// ---------- Settings ----------

export function settingsView(x: Ctx): string {
  const groups = FIELDS.map(
    (g) => `<div class="card"><div class="card-head"><h3>${esc(g.group)}</h3></div>${g.fields
      .map((f) => {
        const value = f.secret ? "" : process.env[f.key] ?? "";
        const ph = f.secret ? (isSet(f.key) ? "Saved. Leave empty to keep it." : "Not set") : "";
        return `<label>${esc(f.label)} ${f.hint ? `<span class="meta">${esc(f.hint)}</span>` : ""}</label><input type="${f.secret ? "password" : "text"}" name="${f.key}" value="${esc(value)}" placeholder="${esc(ph)}" autocomplete="off">`;
      })
      .join("")}</div>`,
  ).join("");
  return (
    pageHead("Settings", "Keys, mailbox and limits. Saved on this computer only.") +
    `<form method="post" action="/settings">${hidden(x, "settings")}${groups}<div class="actions"><button class="btn primary">Save settings</button></div></form>
<div class="section-title">Test your mailbox</div><div class="card"><p class="lede">Save first. The sending test emails your own mailbox. Open it in Gmail, choose Show original, and check SPF, DKIM and DMARC say PASS.</p>
<form method="post" action="/test" class="actions">${hidden(x, "settings")}<button class="btn" name="what" value="smtp">Test sending</button><button class="btn" name="what" value="imap">Test reading replies</button></form></div>`
  );
}

// ---------- Activity ----------

export async function activityView(x: Ctx): Promise<string> {
  const { rows } = await pool.query(
    `SELECT kind, email, company, txt, ts FROM (
       SELECT 'sent' kind, l.email, l.company, m.subject txt, m.sent_at ts FROM messages m JOIN leads l ON l.id=m.lead_id WHERE l.campaign_id=$1 AND m.status='sent'
       UNION ALL SELECT 'reply', l.email, l.company, r.category, r.created_at FROM replies r JOIN leads l ON l.id=r.lead_id WHERE l.campaign_id=$1
       UNION ALL SELECT 'lead', l.email, l.company, coalesce(l.segment,''), l.created_at FROM leads l WHERE l.campaign_id=$1
     ) ORDER BY ts DESC LIMIT 80`,
    [x.c],
  );
  const text = (r: { kind: string; email: string; company: string; txt: string }) =>
    r.kind === "sent" ? `Sent "${esc(r.txt)}" to ${esc(r.email)}` : r.kind === "reply" ? `${esc(r.email)} replied (${esc(String(r.txt).replace("_", " "))})` : `Found ${esc(r.company)} (${esc(r.email)})${r.txt ? " in " + esc(r.txt) : ""}`;
  const tone: Record<string, string> = { sent: "active", reply: "good", lead: "" };
  const body = rows.length
    ? `<div class="card flush"><table>${rows.map((r) => `<tr><td style="width:90px">${badge(r.kind === "lead" ? "found" : r.kind, tone[r.kind])}</td><td>${text(r)}</td><td class="meta" style="text-align:right;white-space:nowrap">${when(r.ts)}</td></tr>`).join("")}</table></div>`
    : `<div class="card empty">Nothing has happened yet.</div>`;
  return pageHead("Activity", "The latest things the agent did, newest first.") + body;
}

// ---------- Help ----------

export function helpView(): string {
  const items: [string, string][] = [
    ["First time", "Settings: add your Anthropic key, your name, company and postal address, and your mailbox. Click both test buttons. Then Campaign: edit every pitch and pain line so it is true for you."],
    ["Every day", "Today shows what needs you. Find leads, Score, Write drafts. Then Outbox: read each draft, edit if needed, approve. Send approved emails from Today."],
    ["Replies", "Run Check replies before every send. Replies you need to answer appear in Conversations with a suggested answer. You send answers yourself from your own mailbox."],
    ["Stay safe", "Keep to 5 emails a day for the first 2 weeks. Send your first 3 to your own addresses and check they reach the inbox. Anyone who writes unsubscribe is blocked automatically."],
    ["Pause", "Pause all sending on the Outbox page stops every real send until you resume."],
    ["Your data", "Everything is in the data folder and the .env file next to the program. Back them up and never share .env."],
  ];
  return (
    pageHead("Help", "How the agent works.") +
    items.map(([t, d]) => `<div class="need"><div class="need-icon note">${icon("help")}</div><div class="need-body"><b>${t}</b><span>${d}</span></div></div>`).join("") +
    `<p class="meta">Config: ${config.dailyCap} emails per day, ${Math.round(config.sendDelayMs / 1000)} second pause between emails, follow-ups after ${esc(config.followupDays.join(" and "))} days.</p>`
  );
}
