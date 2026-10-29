import { config } from "../config.js";
import { getMeta, pool } from "../db.js";
import type { Job } from "../jobs.js";
import { isSet } from "../settings.js";
import { ago, badge, CATEGORY_TONE, esc, fullName, hidden, icon, initials, pageHead, STATUS_LABEL, type Ctx, when } from "./kit.js";

const num = async (sql: string, params: (string | number)[]) => Number((await pool.query(sql, params)).rows[0].n);

// ---------- Today ----------

function series(rows: { d: string; n: number }[]): number[] {
  const byDay = new Map(rows.map((r) => [r.d, Number(r.n)]));
  return Array.from({ length: 14 }, (_, i) => byDay.get(new Date(Date.now() - (13 - i) * 864e5).toISOString().slice(0, 10)) ?? 0);
}

function spark(vals: number[]): string {
  const max = Math.max(...vals, 1);
  const bars = vals
    .map((v, i) => {
      const h = Math.max(2, (v / max) * 28);
      return `<rect class="${v ? "" : "zero"}" x="${i * 6}" y="${28 - h}" width="4" height="${h}" rx="1"/>`;
    })
    .join("");
  return `<svg class="spark" viewBox="0 0 84 28" aria-hidden="true">${bars}</svg>`;
}

function kpi(label: string, value: number, note: string, vals?: number[]): string {
  return `<div class="kpi"><div class="kpi-label">${label}</div><div class="kpi-main"><div class="kpi-value${value ? "" : " zero"}">${value}</div>${vals ? spark(vals) : ""}</div><div class="kpi-note">${note}</div></div>`;
}

export function runForm(x: Ctx, step: string, label: string, o: { primary?: boolean; extra?: string; confirm?: string; danger?: boolean } = {}): string {
  const cls = `btn sm${o.primary ? " primary" : ""}${o.danger ? " danger" : ""}`;
  return `<form method="post" action="/run" style="display:inline-flex;gap:8px;align-items:center"${o.confirm ? ` onsubmit="return confirm('${o.confirm}')"` : ""}>${hidden(x, "today")}<input type="hidden" name="step" value="${step}">${o.extra ?? ""}<button class="${cls}">${label}</button></form>`;
}

const need = (tone: string, ic: string, title: string, text: string, action: string) =>
  `<div class="need"><div class="need-icon ${tone}">${icon(ic)}</div><div class="need-body"><b>${title}</b><span>${text}</span></div><div class="actions">${action}</div></div>`;

export async function todayView(x: Ctx, job: Job | undefined): Promise<string> {
  const c = x.c;
  const d14 = new Date(Date.now() - 14 * 864e5).toISOString();
  const d7 = new Date(Date.now() - 7 * 864e5).toISOString();
  const q = (sql: string, p: (string | number)[] = [c, d14]) => pool.query(sql, p).then((r) => r.rows);

  const leadsTotal = await num("SELECT count(*) n FROM leads WHERE campaign_id=$1", [c]);
  const leadsWeek = await num("SELECT count(*) n FROM leads WHERE campaign_id=$1 AND created_at>=$2", [c, d7]);
  const sentTotal = await num("SELECT count(*) n FROM messages m JOIN leads l ON l.id=m.lead_id WHERE l.campaign_id=$1 AND m.status='sent'", [c]);
  const approved = await num("SELECT count(*) n FROM messages m JOIN leads l ON l.id=m.lead_id WHERE l.campaign_id=$1 AND m.status='approved'", [c]);
  const drafts = await num("SELECT count(*) n FROM messages m JOIN leads l ON l.id=m.lead_id WHERE l.campaign_id=$1 AND m.status='draft'", [c]);
  const convos = await num("SELECT count(*) n FROM replies r JOIN leads l ON l.id=r.lead_id WHERE l.campaign_id=$1", [c]);
  const convos14 = await num("SELECT count(*) n FROM replies r JOIN leads l ON l.id=r.lead_id WHERE l.campaign_id=$1 AND r.created_at>=$2", [c, d14]);
  const unread = await num("SELECT count(*) n FROM replies r JOIN leads l ON l.id=r.lead_id WHERE l.campaign_id=$1 AND r.handled=0", [c]);
  const sent14 = await num("SELECT count(*) n FROM messages m JOIN leads l ON l.id=m.lead_id WHERE l.campaign_id=$1 AND m.status='sent' AND m.sent_at>=$2", [c, d14]);

  const leadsSeries = series(await q("SELECT substr(created_at,1,10) d, count(*) n FROM leads WHERE campaign_id=$1 AND created_at>=$2 GROUP BY d"));
  const sentSeries = series(await q("SELECT substr(m.sent_at,1,10) d, count(*) n FROM messages m JOIN leads l ON l.id=m.lead_id WHERE l.campaign_id=$1 AND m.status='sent' AND m.sent_at>=$2 GROUP BY d"));
  const replySeries = series(await q("SELECT substr(r.created_at,1,10) d, count(*) n FROM replies r JOIN leads l ON l.id=r.lead_id WHERE l.campaign_id=$1 AND r.created_at>=$2 GROUP BY d"));

  const unrated = await num("SELECT count(*) n FROM leads WHERE campaign_id=$1 AND status='new' AND score IS NULL", [c]);
  const stages = await q("SELECT status, count(*) n FROM leads WHERE campaign_id=$1 GROUP BY status", [c]);
  const stageN = (s: string) => Number(stages.find((r) => r.status === s)?.n ?? 0);

  const needsYou = drafts + unread;
  const kpis =
    `<div class="kpis">` +
    kpi("Leads found", leadsTotal, `+${leadsWeek} this week`, leadsSeries) +
    kpi("Emails sent", sentTotal, `last 14 days: ${sent14} · ${approved} approved, waiting`, sentSeries) +
    kpi("Conversations", convos, `${convos14} new in 14 days`, replySeries) +
    kpi("Waiting on you", needsYou, `${drafts} to approve · ${unread} replies to read`) +
    `</div>`;

  const missing: string[] = [];
  if (!isSet("ANTHROPIC_API_KEY")) missing.push("Anthropic key");
  if (!(config.smtpHost && config.smtpUser && config.smtpPass && config.fromEmail)) missing.push("sending mailbox");
  if (!(config.senderName && config.senderCompany && config.senderAddress)) missing.push("your name, company and address");
  if (!config.imapHost) missing.push("reading replies (IMAP)");

  const link = (tab: string, label: string) => `<a class="btn sm" href="/?c=${c}&tab=${tab}">${label}${icon("arrow")}</a>`;
  const cards: string[] = [];
  if (missing.length)
    cards.push(need("bad", "alert", "Finish setup", `Still missing: ${esc(missing.join(", "))}. Nothing can run until these are filled in.`, link("settings", "Open settings")));
  if (drafts) cards.push(need("wait", "flag", `${drafts} email${drafts === 1 ? "" : "s"} waiting for approval`, "Nothing sends until you approve it. Read them one at a time.", link("outbox", "Open the outbox")));
  if (unread) cards.push(need("bad", "alert", `${unread} repl${unread === 1 ? "y needs" : "ies need"} you`, "People answered. Read them and reply from your own mailbox.", link("conversations", "Read them")));
  if (stageN("new")) cards.push(need("note", "flag", `${stageN("new")} lead${stageN("new") === 1 ? "" : "s"} to review`, "Open each one to see everything the source returned, then choose who gets an email.", link("leads&f=new", "Review leads")));
  if (unrated) cards.push(need("note", "flag", `${unrated} lead${unrated === 1 ? " has" : "s have"} no fit score`, "Optional. Claude rates how well each lead fits, to help you choose. It never rejects anyone.", runForm(x, "score", "Rate fit")));
  if (stageN("chosen")) cards.push(need("good", "check", `${stageN("chosen")} chosen lead${stageN("chosen") === 1 ? "" : "s"} ready for a draft`, "Claude writes one email per chosen lead. You approve each before it can send.", runForm(x, "write", "Write drafts", { primary: true })));
  if (approved)
    cards.push(
      need("good", "check", `${approved} approved email${approved === 1 ? "" : "s"} ready to send`, `Up to ${config.dailyCap} go out per day. A dry run only shows what would be sent.`,
        runForm(x, "send_dry", "Dry run") + runForm(x, "send_live", "Send for real", { primary: true, confirm: "Send approved emails now?" })),
    );
  if (!leadsTotal) cards.push(need("note", "flag", "No leads yet", "Searches Apollo with this campaign's segments. Without an Apollo key you get 3 sample leads.", runForm(x, "source", "Find leads", { primary: true, extra: '<input type="number" name="limit" value="10" min="1" max="100" style="width:72px">' })));
  if (!cards.length) cards.push(need("good", "check", "You are all caught up", "Check the mailbox for new replies, or find more leads.", runForm(x, "replies", "Check replies")));

  const steps = [
    ["source", "Find leads", "Ask every switched-on source (Apollo and your own APIs) using this campaign's segments", '<input type="number" name="limit" value="10" min="1" max="100">'],
    ["score", "Rate fit (optional)", "Claude scores new leads to help you choose. Never rejects.", ""],
    ["write", "Write drafts", "One email per chosen lead, for your approval", ""],
    ["replies", "Check replies", "Reads the inbox, stops sequences for unsubscribes and bounces", ""],
    ["followups", "Draft follow-ups", "For leads who did not reply, on your schedule", ""],
  ]
    .map(([s, t, d, extra]) => `<div class="step"><div class="t"><b>${t}</b><span>${d}</span></div>${runForm(x, s, "Run", { extra })}</div>`)
    .join("");

  const colors: Record<string, string> = { new: "var(--chart-muted)", chosen: "var(--accent-line)", drafted: "var(--accent)", contacted: "var(--active)", replied: "var(--good)", closed: "var(--line-strong)", skipped: "var(--text-3)" };
  const total = Math.max(1, stages.reduce((a, r) => a + Number(r.n), 0));
  const order = ["new", "chosen", "drafted", "contacted", "replied", "closed", "skipped"];
  const bar = order.filter(stageN).map((s) => `<i style="width:${(stageN(s) / total) * 100}%;background:${colors[s]}"></i>`).join("");
  const legend = order
    .map((s) => `<li><span class="sw" style="background:${colors[s]}"></span>${STATUS_LABEL[s]}<span class="n">${stageN(s)}</span><span class="pct">${Math.round((stageN(s) / total) * 100)}%</span></li>`)
    .join("");

  const jobCard = job
    ? `<div class="card job"><div class="card-head"><h3>Right now: ${esc(job.name)}</h3>${badge(job.status === "running" ? "running" : job.status, job.status === "failed" ? "bad" : job.status === "running" ? "active" : "good")}</div><pre>${esc(job.log.join("\n") || "Working...")}</pre></div>`
    : "";

  return (
    pageHead("Today", "What is waiting on you, and how the pipeline is moving.") +
    kpis +
    `<div class="grid2"><div><div class="section-title">Needs you</div>${jobCard}${cards.join("")}
<div class="section-title">Run a step</div><div class="card"><div class="steps">${steps}</div></div></div>
<div><div class="section-title">Leads by stage</div><div class="card"><div class="stagebar">${bar}</div><ul class="legend">${legend}</ul></div></div></div>`
  );
}

// ---------- Outbox ----------

export async function outboxView(x: Ctx): Promise<string> {
  const { rows } = await pool.query(
    `SELECT m.id, m.step, m.subject, m.body, l.first_name, l.last_name, l.title, l.email, l.company, l.domain, l.segment, l.score, l.score_reason, l.website, l.industry, l.employees, l.city, l.country, l.linkedin_url, l.source
     FROM messages m JOIN leads l ON l.id=m.lead_id
     WHERE l.campaign_id=$1 AND m.status='draft' AND m.channel='email'
     ORDER BY l.score DESC NULLS LAST, m.id LIMIT 100`,
    [x.c],
  );
  const paused = (await getMeta("paused")) === "1";
  const pauseBtn = `<form method="post" action="/pause">${hidden(x, "outbox")}<button class="btn">${paused ? "Resume sending" : "Pause all sending"}</button></form>`;
  const approveAll = `<form method="post" action="/approve-all" onsubmit="return confirm('Approve every draft without reading it?')">${hidden(x, "outbox")}<button class="btn primary" id="approve-all"${rows.length ? "" : " hidden"}>Approve all ${rows.length}</button></form>`;

  const list = rows
    .map((d, i) => `<button type="button" class="ob-item${i ? "" : " on"}"><span class="avatar${i ? "" : " on"}">${esc(initials(d.first_name, d.last_name, d.email))}</span><span><b>${esc(fullName(d))}</b><small>${esc(d.subject)}</small></span></button>`)
    .join("");
  const panes = rows
    .map(
      (d, i) => `<article class="ob-pane" data-id="${d.id}"${i ? " hidden" : ""}>
<div class="ob-to"><span>To</span><b>${esc(d.email)}</b><span class="tag">${d.step > 1 ? `Follow-up ${d.step - 1}` : "First email"}</span></div>
<dl class="facts"><dt>Company</dt><dd>${esc(d.company)}</dd>${d.website || d.domain ? `<dt>Website</dt><dd>${esc(d.website || d.domain)}</dd>` : ""}${d.industry ? `<dt>Industry</dt><dd>${esc(d.industry)}${d.employees ? " · " + esc(d.employees) + " employees" : ""}</dd>` : ""}${d.city || d.country ? `<dt>Location</dt><dd>${esc([d.city, d.country].filter(Boolean).join(", "))}</dd>` : ""}<dt>Contact</dt><dd>${esc(fullName(d))}${d.title ? " · " + esc(d.title) : ""}</dd>${d.segment ? `<dt>Segment</dt><dd>${esc(d.segment)}</dd>` : ""}<dt>Fit score</dt><dd>${esc(d.score)} · ${esc(d.score_reason)}</dd></dl>
<div class="view"><h2 class="ob-subject">${esc(d.subject)}</h2><div class="ob-text">${esc(d.body)}</div></div>
<div class="edit" hidden><label>Subject</label><input type="text" name="subject" value="${esc(d.subject)}"><label>Message</label><textarea name="body">${esc(d.body)}</textarea></div>
<div class="meta" style="margin-top:12px">Your name, postal address and the opt-out line are added when the email is sent.</div>
<div class="ob-foot"><span class="view-btns"><button class="btn primary" data-act="approve">Approve<kbd>A</kbd></button> <button class="btn" data-act="edit">Edit<kbd>E</kbd></button> <button class="btn danger" data-act="reject">Reject<kbd>R</kbd></button></span>
<span class="edit-btns" hidden><button class="btn primary" data-act="save">Save</button> <button class="btn" data-act="approve">Save and approve</button> <button class="btn ghost" data-act="cancel">Cancel<kbd>Esc</kbd></button></span><span class="pos">${i + 1} of ${rows.length}</span></div></article>`,
    )
    .join("");

  const queued = (
    await pool.query(
      `SELECT l.email, m.step, m.subject, m.status, m.sent_at FROM messages m JOIN leads l ON l.id=m.lead_id
       WHERE l.campaign_id=$1 AND m.status IN ('approved','sent','failed') ORDER BY (m.status='approved') DESC, m.sent_at DESC, m.id DESC LIMIT 25`,
      [x.c],
    )
  ).rows;
  const tone: Record<string, string> = { approved: "wait", sent: "good", failed: "bad" };
  const queue = queued.length
    ? `<div class="section-title">Approved and sent</div><div class="card flush"><table><tr><th>To</th><th>Step</th><th>Subject</th><th>Status</th></tr>${queued
        .map((r) => `<tr><td>${esc(r.email)}</td><td>${r.step}</td><td>${esc(r.subject)}</td><td>${badge(r.status === "approved" ? "Approved, waiting to send" : r.status === "sent" ? `Sent ${when(r.sent_at)}` : "Failed", tone[r.status])}</td></tr>`)
        .join("")}</table></div>`
    : "";

  const body = rows.length
    ? `<div class="outbox" id="outbox" data-token="${x.token}" data-c="${x.c}"><div class="ob-list">${list}</div><div class="ob-main">${panes}</div></div><div class="card empty" id="ob-empty" hidden>Nothing waiting for approval. <a href="/?c=${x.c}&tab=today">Back to Today</a></div>`
    : `<div class="card empty">Nothing waiting for approval. <a href="/?c=${x.c}&tab=today">Back to Today</a> to write more drafts.</div>`;

  return (
    pageHead("Outbox", `Every outgoing email stops here. Read one, decide, move on: <kbd>A</kbd> approve, <kbd>R</kbd> reject, <kbd>E</kbd> edit, <kbd>J</kbd>/<kbd>K</kbd> to move.`, approveAll + pauseBtn) +
    (paused ? `<div class="flash">Sending is paused. Approved emails stay queued until you resume.</div>` : "") +
    body +
    queue +
    OUTBOX_JS
  );
}

const OUTBOX_JS = `<script>(function(){var root=document.getElementById("outbox");if(!root)return;var token=root.dataset.token,camp=root.dataset.c;
var items=[].slice.call(root.querySelectorAll(".ob-item")),panes=[].slice.call(root.querySelectorAll(".ob-pane")),cur=0;
function show(i){if(!items.length){document.getElementById("ob-empty").hidden=false;root.hidden=true;return}cur=Math.max(0,Math.min(i,items.length-1));
items.forEach(function(el,k){el.classList.toggle("on",k===cur);el.querySelector(".avatar").classList.toggle("on",k===cur)});
panes.forEach(function(p,k){p.hidden=k!==cur;var pos=p.querySelector(".pos");if(pos)pos.textContent=(k+1)+" of "+items.length});
items[cur].scrollIntoView({block:"nearest"})}
function bump(){["nb-outbox","nb-today"].forEach(function(id){var e=document.getElementById(id);if(e){var v=Math.max(0,(parseInt(e.textContent,10)||0)-1);e.textContent=v;e.hidden=v===0}});
var b=document.getElementById("approve-all");if(b){b.textContent="Approve all "+items.length;b.hidden=items.length===0}}
function post(data){var b=new URLSearchParams(data);b.set("_t",token);b.set("c",camp);return fetch("/draft",{method:"POST",headers:{"X-Requested-With":"fetch"},body:b}).then(function(r){if(!r.ok)return r.text().then(function(t){throw new Error(t||"Failed")})})}
function edit(on){if(!panes.length)return;var p=panes[cur];p.querySelector(".view").hidden=on;p.querySelector(".edit").hidden=!on;p.querySelector(".view-btns").hidden=on;p.querySelector(".edit-btns").hidden=!on;if(on)p.querySelector("input[name=subject]").focus()}
function isEdit(){return panes.length&&!panes[cur].querySelector(".edit").hidden}
function act(kind){if(!panes.length)return;if(kind==="edit"){edit(true);return}if(kind==="cancel"){edit(false);return}
var p=panes[cur],data={id:p.dataset.id,action:kind==="save"?"save":kind};
if((kind==="save"||kind==="approve")&&isEdit()){data.subject=p.querySelector("input[name=subject]").value;data.body=p.querySelector("textarea[name=body]").value}
post(data).then(function(){if(kind==="save"){p.querySelector(".ob-subject").textContent=data.subject;p.querySelector(".ob-text").textContent=data.body;items[cur].querySelector("small").textContent=data.subject;edit(false);return}
items[cur].remove();p.remove();items.splice(cur,1);panes.splice(cur,1);bump();show(cur)}).catch(function(e){alert(e.message)})}
items.forEach(function(el){el.addEventListener("click",function(){show(items.indexOf(el))})});
root.addEventListener("click",function(e){var b=e.target.closest("[data-act]");if(b)act(b.dataset.act)});
document.addEventListener("keydown",function(e){var t=e.target,typing=t&&/INPUT|TEXTAREA|SELECT/.test(t.tagName);
if(e.key==="Escape"){if(typing)t.blur();edit(false);return}if(typing||e.metaKey||e.ctrlKey||e.altKey)return;
var k=e.key.toLowerCase();if(k==="a")act("approve");else if(k==="r")act("reject");else if(k==="e"){e.preventDefault();act("edit")}else if(k==="j")show(cur+1);else if(k==="k")show(cur-1)});
show(0)})()</script>`;

// ---------- Conversations ----------

export async function conversationsView(x: Ctx, filter: string): Promise<string> {
  const f = ["needs", "handled", "all"].includes(filter) ? filter : "needs";
  const cnt = async (cond: string) => num(`SELECT count(*) n FROM replies r JOIN leads l ON l.id=r.lead_id WHERE l.campaign_id=$1 ${cond}`, [x.c]);
  const [nNeeds, nHandled, nAll] = [await cnt("AND r.handled=0"), await cnt("AND r.handled=1"), await cnt("")];
  const tab = (k: string, label: string, n: number) => `<a href="/?c=${x.c}&tab=conversations&f=${k}" class="${f === k ? "on" : ""}">${label}<span>${n}</span></a>`;
  const tabs = `<div class="tabs">${tab("needs", "Needs you", nNeeds)}${tab("handled", "Handled", nHandled)}${tab("all", "All", nAll)}</div>`;

  const { rows } = await pool.query(
    `SELECT r.id, r.category, r.summary, r.body, r.suggested_reply, r.handled, r.created_at, r.received_at,
            l.id lead_id, l.first_name, l.last_name, l.email, l.company, l.title
     FROM replies r JOIN leads l ON l.id=r.lead_id
     WHERE l.campaign_id=$1 ${f === "needs" ? "AND r.handled=0" : f === "handled" ? "AND r.handled=1" : ""}
     ORDER BY r.created_at DESC LIMIT 40`,
    [x.c],
  );
  const cards: string[] = [];
  for (const r of rows) {
    const sent = (await pool.query("SELECT step, subject, body, sent_at FROM messages WHERE lead_id=$1 AND status='sent' ORDER BY step", [r.lead_id])).rows;
    const thread = sent
      .map((m) => `<div class="bubble out"><small>${m.step > 1 ? `Follow-up ${m.step - 1}` : "Email 1"} · ${esc(m.subject)} · ${when(m.sent_at)}</small>${esc(m.body)}</div>`)
      .join("");
    cards.push(`<div class="convo"><div class="convo-head"><span class="avatar">${esc(initials(r.first_name, r.last_name, r.email))}</span>
<div class="who"><b>${esc(fullName(r))}</b><div class="meta">${esc(r.company)} · ${esc(r.email)} · ${ago(r.received_at ?? r.created_at)}</div></div>${badge(String(r.category).replace("_", " "), CATEGORY_TONE[r.category] ?? "")}</div>
${thread}<div class="bubble in"><small>${esc(fullName(r))} replied</small>${esc(String(r.body).slice(0, 1500))}</div>
<div class="meta">Summary: ${esc(r.summary)}</div>
${r.suggested_reply ? `<div class="suggest"><div class="meta">Suggested reply. Edit it, then send from your own mailbox.</div><pre>${esc(r.suggested_reply)}</pre><button class="btn sm" type="button" onclick="navigator.clipboard.writeText(this.previousElementSibling.textContent);this.textContent='Copied'">Copy</button></div>` : ""}
<form method="post" action="${r.handled ? "/unhandled" : "/handled"}" class="actions" style="margin-top:12px">${hidden(x, "conversations")}<input type="hidden" name="id" value="${r.id}"><input type="hidden" name="f" value="${f}"><button class="btn sm${r.handled ? "" : " primary"}">${r.handled ? "Reopen" : "Mark handled"}</button></form></div>`);
  }
  return (
    pageHead("Conversations", "Every reply, and what Claude made of it. The agent never answers for you.") +
    tabs +
    (cards.join("") || `<div class="card empty">${f === "needs" ? "Nothing needs you right now. Use Check replies on the Today page." : "No conversations here yet."}</div>`)
  );
}
