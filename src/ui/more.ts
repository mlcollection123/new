import { config } from "../config.js";
import { apolloEnabled, listSources } from "../sources.js";
import { pool } from "../db.js";
import { FIELDS, isSet } from "../settings.js";
import { DEFAULT_ICP, DEFAULT_NAME, DEFAULT_OFFER } from "../templates.js";
import { badge, esc, fullName, hidden, icon, pageHead, STATUS_LABEL, type Ctx, when } from "./kit.js";

// ---------- Leads ----------

const PAGE = 50;
const link = (u?: string | null) => (u && /^https?:\/\//i.test(u) ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(u)}</a>` : esc(u));

export async function leadsView(x: Ctx, status: string, q: string, src: string, page: number): Promise<string> {
  const order = ["new", "chosen", "drafted", "contacted", "replied", "closed", "skipped"];
  const counts = (await pool.query("SELECT status, count(*) n FROM leads WHERE campaign_id=$1 GROUP BY status", [x.c])).rows;
  const total = counts.reduce((a, r) => a + Number(r.n), 0);
  const sources = (await pool.query("SELECT DISTINCT source FROM leads WHERE campaign_id=$1 AND source IS NOT NULL ORDER BY source", [x.c])).rows.map((r) => r.source as string);
  const qs = (f: string) => `/?c=${x.c}&tab=leads&f=${f}&q=${encodeURIComponent(q)}&src=${encodeURIComponent(src)}`;
  const tab = (k: string, label: string, n: number) => `<a href="${qs(k)}" class="${status === k ? "on" : ""}">${label}<span>${n}</span></a>`;
  const tabs = `<div class="tabs">${tab("all", "All", total)}${order.map((s) => tab(s, STATUS_LABEL[s], Number(counts.find((r) => r.status === s)?.n ?? 0))).join("")}</div>`;

  const params: (string | number)[] = [x.c];
  let where = "campaign_id=$1";
  if (order.includes(status)) { params.push(status); where += ` AND status=$${params.length}`; }
  if (src) { params.push(src); where += ` AND source=$${params.length}`; }
  if (q.trim()) {
    params.push(`%${q.trim().toLowerCase()}%`);
    where += ` AND (lower(coalesce(first_name,'')||' '||coalesce(last_name,'')) LIKE $${params.length} OR lower(coalesce(company,'')) LIKE $${params.length} OR lower(email) LIKE $${params.length})`;
  }
  const matching = Number((await pool.query(`SELECT count(*) n FROM leads WHERE ${where}`, params)).rows[0].n);
  const { rows } = await pool.query(`SELECT * FROM leads WHERE ${where} ORDER BY score DESC NULLS LAST, id DESC LIMIT ${PAGE} OFFSET ${page * PAGE}`, params);

  const tone: Record<string, string> = { new: "wait", chosen: "good", skipped: "", drafted: "active", contacted: "active", replied: "good", closed: "" };
  const fact = (label: string, value: string | null | undefined, raw = false) => (value ? `<dt>${label}</dt><dd>${raw ? value : esc(value)}</dd>` : "");
  const cards = rows
    .map((r) => {
      let rawJson = "";
      try { rawJson = JSON.stringify(typeof r.raw === "string" ? JSON.parse(r.raw) : r.raw, null, 2) ?? ""; } catch { rawJson = String(r.raw ?? ""); }
      const place = [r.city, r.country].filter(Boolean).join(", ");
      return `<details class="lead"><summary><input type="checkbox" name="ids" value="${r.id}">
<div><b>${esc(fullName(r))}</b><span class="meta">${esc(r.title)}</span></div>
<div><b>${esc(r.company)}</b><span class="meta">${esc(r.domain)}</span></div>
<div><span class="tag">${esc(r.segment ?? "No segment")}</span><span class="meta">${esc(r.source)}</span></div>
<div class="sc" title="${esc(r.score_reason)}">${esc(r.score ?? "")}</div>${badge(STATUS_LABEL[r.status] ?? r.status, tone[r.status])}</summary>
<div class="lead-body"><dl class="facts">
${fact("Email", `${esc(r.email)}${r.email_status ? " " + badge(r.email_status, r.email_status === "verified" ? "good" : "wait") : ""}`, true)}
${fact("Phone", r.phone)}${fact("Job title", r.title)}${fact("LinkedIn", link(r.linkedin_url), true)}
${fact("Company", r.company)}${fact("Website", r.website ? link(r.website) : esc(r.domain), true)}${fact("Industry", r.industry)}${fact("Employees", r.employees)}
${fact("Location", place)}${fact("Company LinkedIn", link(r.company_linkedin), true)}${fact("About the company", r.description)}
${fact("Segment", r.segment)}${fact("Found by", r.source)}${fact("Fit score", r.score != null ? `${r.score}. ${r.score_reason ?? ""}` : "")}${fact("Found", when(r.created_at))}</dl>
${rawJson ? `<details class="raw"><summary>Everything the source returned</summary><pre>${esc(rawJson.slice(0, 15000))}</pre></details>` : ""}
<div class="actions" style="margin-top:14px"><button class="btn sm primary" name="act1" value="choose:${r.id}">Choose this lead</button><button class="btn sm" name="act1" value="skip:${r.id}">Skip</button></div></div></details>`;
    })
    .join("");

  const back = `/?c=${x.c}&tab=leads&f=${status}&q=${encodeURIComponent(q)}&src=${encodeURIComponent(src)}&p=${page}`;
  const minScore = Number((await pool.query("SELECT min_score FROM campaigns WHERE id=$1", [x.c])).rows[0]?.min_score ?? 60);
  const pager = matching > PAGE
    ? `<div class="actions" style="margin:12px 0">${page > 0 ? `<a class="btn sm" href="${qs(status)}&p=${page - 1}">Previous</a>` : ""}<span class="meta">${page * PAGE + 1} to ${Math.min(matching, (page + 1) * PAGE)} of ${matching}</span>${(page + 1) * PAGE < matching ? `<a class="btn sm" href="${qs(status)}&p=${page + 1}">Next</a>` : ""}</div>`
    : "";

  const filters = `<form class="filters" method="get"><input type="hidden" name="c" value="${x.c}"><input type="hidden" name="tab" value="leads"><input type="hidden" name="f" value="${esc(status)}">
<input type="text" name="q" value="${esc(q)}" placeholder="Search name, company, email"><select name="src" onchange="this.form.submit()"><option value="">All sources</option>${sources.map((s) => `<option${s === src ? " selected" : ""}>${esc(s)}</option>`).join("")}</select><button class="btn">Search</button></form>`;

  const toolbar = `<div class="toolbar"><label class="sel"><input type="checkbox" id="all"> Select all</label><span class="sel" id="count">0 selected</span>
<button class="btn primary" name="act" value="choose">Choose selected</button><button class="btn" name="act" value="skip">Skip selected</button><button class="btn ghost" name="act" value="reset">Back to review</button>
<button class="btn ghost" name="act" value="chooseabove" title="Choose every lead in review rated ${minScore} or higher">Choose all rated ${minScore}+</button></div>`;

  const body = rows.length
    ? `<form method="post" action="/leads/bulk">${hidden(x, "leads")}<input type="hidden" name="back" value="${esc(back)}">${toolbar}${cards}</form>${pager}${LEADS_JS}`
    : `<div class="card empty">No leads match. Use Find leads on the Today page, or import a list on the <a href="/?c=${x.c}&tab=sources">Sources</a> page.</div>`;
  return (
    pageHead("Leads", "Everything the sources found. Open a lead to see all its details, then choose who should get an email. Only chosen leads get drafts.", `<a class="btn" href="/?c=${x.c}&tab=sources">Sources</a>`) +
    tabs + filters + body
  );
}

const LEADS_JS = `<script>(function(){var f=document.querySelector("form[action='/leads/bulk']"),all=document.getElementById("all"),n=document.getElementById("count");
function boxes(){return [].slice.call(f.querySelectorAll("input[name=ids]"))}
function upd(){var c=boxes().filter(function(b){return b.checked}).length;n.textContent=c+" selected"}
all.addEventListener("change",function(){boxes().forEach(function(b){b.checked=all.checked});upd()});
f.addEventListener("change",function(e){if(e.target.name==="ids")upd()});
f.addEventListener("click",function(e){if(e.target.closest("[name=act]")&&e.target.getAttribute("value")!=="chooseabove"&&!boxes().some(function(b){return b.checked})){e.preventDefault();alert("Tick at least one lead first.")}})})()</script>`;

// ---------- Sources ----------

const EXAMPLE = {
  method: "POST",
  url: "https://api.apollo.io/api/v1/mixed_people/api_search",
  headers: '{\n  "Content-Type": "application/json",\n  "x-api-key": "{{key}}"\n}',
  body: '{\n  "person_titles": {{titles_json}},\n  "q_organization_keyword_tags": {{industries_json}},\n  "per_page": {{limit}},\n  "page": 1\n}',
  resultsPath: "people",
  fields: '{\n  "email": "email",\n  "firstName": "first_name",\n  "lastName": "last_name",\n  "title": "title",\n  "company": "organization.name",\n  "domain": "organization.primary_domain",\n  "website": "organization.website_url",\n  "industry": "organization.industry",\n  "employees": "organization.estimated_num_employees",\n  "linkedinUrl": "linkedin_url",\n  "city": "city",\n  "country": "country",\n  "emailStatus": "email_status",\n  "externalId": "id"\n}',
};

export async function sourcesView(x: Ctx, lastTest: string): Promise<string> {
  const custom = await listSources();
  const apolloOn = await apolloEnabled();
  const toggle = (id: string | number, on: boolean) =>
    `<form method="post" action="/sources/toggle" style="display:inline">${hidden(x, "sources")}<input type="hidden" name="sid" value="${id}"><input type="hidden" name="on" value="${on ? "0" : "1"}"><button class="btn sm">${on ? "Switch off" : "Switch on"}</button></form>`;
  const row = (name: string, desc: string, state: string, actions: string) =>
    `<div class="step"><div class="t"><b>${esc(name)}</b><span>${desc}</span></div>${state}<div class="actions">${actions}</div></div>`;
  const list =
    row("Apollo", config.apolloKey ? "Built in. Uses the key from Settings." : "Built in. No key yet, so it returns 3 sample leads. Add the key in Settings.", badge(apolloOn ? "On" : "Off", apolloOn ? "good" : ""), toggle("apollo", apolloOn)) +
    custom
      .map((s) =>
        row(s.name, `${esc(new URL(s.config.url).host)} · ${s.secret ? "key saved" : "no key"}`, badge(s.enabled ? "On" : "Off", s.enabled ? "good" : ""),
          toggle(s.id, !!s.enabled) +
          `<form method="post" action="/sources/test" style="display:inline">${hidden(x, "sources")}<input type="hidden" name="sid" value="${s.id}"><button class="btn sm">Test</button></form>` +
          `<form method="post" action="/sources/delete" style="display:inline" onsubmit="return confirm('Delete this source?')">${hidden(x, "sources")}<input type="hidden" name="sid" value="${s.id}"><button class="btn sm danger">Delete</button></form>`),
      )
      .join("");

  const segs = (await pool.query("SELECT icp FROM campaigns WHERE id=$1", [x.c])).rows[0];
  const segNames: string[] = segs ? (JSON.parse(segs.icp).segments ?? []).map((s: { name: string }) => s.name) : [];

  return (
    pageHead("Sources", "Where leads come from. Find leads asks every source that is switched on, and each lead shows which source found it.") +
    (lastTest ? `<div class="flash">${esc(lastTest)}</div>` : "") +
    `<div class="card"><div class="card-head"><h3>Your sources</h3></div><div class="steps">${list}</div></div>
<div class="section-title">Add a leads API</div>
<form class="card" method="post" action="/sources/save">${hidden(x, "sources")}
<p class="lede">Works with any API that returns people as JSON. Copy the URL, headers and field names from your provider's documentation. I cannot check them for you, so use Test after saving.
Placeholders you can use: <code>{{key}}</code> (your API key), <code>{{limit}}</code>, <code>{{titles_json}}</code>, <code>{{industries_json}}</code>, <code>{{keywords_json}}</code>, <code>{{locations_json}}</code>, <code>{{employeeRanges_json}}</code> and the same without <code>_json</code> for comma-separated text.</p>
<label>Start from</label><select id="preset"><option value="">Blank</option><option value="ex">Example (Apollo-style search)</option></select>
<label>Name</label><input type="text" name="name" placeholder="For example: Hunter, Snov, my scraper">
<label>API key <span class="meta">Stored on this computer. Used as {{key}}.</span></label><input type="password" name="secret" autocomplete="off">
<label>Method</label><select name="method"><option>GET</option><option>POST</option></select>
<label>URL <span class="meta">Must start with https://</span></label><input type="text" name="url" placeholder="https://api.example.com/v1/people/search">
<label>Headers <span class="meta">JSON</span></label><textarea name="headers" style="min-height:100px">{}</textarea>
<label>Body <span class="meta">For POST only</span></label><textarea name="body" style="min-height:120px"></textarea>
<label>Where is the list of people in the response? <span class="meta">For example: data.people</span></label><input type="text" name="resultsPath">
<label>Field mapping <span class="meta">Left: our field. Right: the name in the response. Fields: email (required), firstName, lastName, title, company, domain, website, linkedinUrl, companyLinkedin, phone, city, country, industry, employees, description, emailStatus, externalId.</span></label>
<textarea name="fields" class="tall" style="min-height:200px" spellcheck="false">{\n  "email": "email"\n}</textarea>
<div class="actions" style="margin-top:14px"><button class="btn primary">Add source</button></div></form>
<div class="section-title">Import a list (CSV)</div>
<form class="card" method="post" action="/leads/import">${hidden(x, "sources")}
<p class="lede">Export people from any tool as CSV and import them here. Needs a header row with an <b>email</b> column. These columns are recognised: first name, last name, name, title, company, domain, website, linkedin, phone, city, country, industry, employees, description.</p>
<label>CSV file</label><input type="file" id="csvfile" accept=".csv,text/csv,text/plain">
<label>Or paste it here</label><textarea name="text" id="csvtext" style="min-height:140px" spellcheck="false" placeholder="email,first_name,last_name,title,company&#10;jane@acme.com,Jane,Doe,CFO,Acme"></textarea>
${segNames.length ? `<label>Segment <span class="meta">Which of this campaign's segments are these people in?</span></label><select name="segment"><option value="">None</option>${segNames.map((n) => `<option>${esc(n)}</option>`).join("")}</select>` : ""}
<div class="actions" style="margin-top:14px"><button class="btn primary">Import leads</button></div></form>
<script>var ex=${JSON.stringify(EXAMPLE).replace(/</g, "\\u003c")};document.getElementById("preset").onchange=function(){if(this.value!=="ex")return;var f=this.form;f.method.value=ex.method;f.url.value=ex.url;f.headers.value=ex.headers;f.body.value=ex.body;f.resultsPath.value=ex.resultsPath;f.fields.value=ex.fields;if(!f.name.value)f.name.value="Apollo (custom)"};
document.getElementById("csvfile").onchange=function(){var r=new FileReader();r.onload=function(){document.getElementById("csvtext").value=r.result};r.readAsText(this.files[0])}</script>`
  );
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
    ["Every day", "Today shows what needs you. Find leads asks every source you switched on. Open Leads, look at each lead's details, and choose who should get an email. Then Write drafts, review them in the Outbox, approve, and send from Today."],
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
