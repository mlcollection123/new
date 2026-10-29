import { spawn } from "node:child_process";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { config } from "./config.js";
import { pool } from "./db.js";
import { draftFollowups } from "./followups.js";
import { testImap, testSmtp } from "./health.js";
import { currentJob, startJob } from "./jobs.js";
import {
  approve,
  createCampaign,
  editDraft,
  reject,
  scoreLeads,
  sourceLeads,
  updateCampaign,
  writeDrafts,
} from "./pipeline.js";
import { listInbox, markHandled, processReplies } from "./replies.js";
import { sendApproved } from "./sender.js";
import { FIELDS, isSet, saveSettings } from "./settings.js";
import { DEFAULT_ICP, DEFAULT_NAME, DEFAULT_OFFER } from "./templates.js";

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const TABS = ["run", "drafts", "inbox", "stats", "campaign", "settings"] as const;
type Tab = (typeof TABS)[number];
const LABEL: Record<Tab, string> = { run: "Run", drafts: "Drafts", inbox: "Inbox", stats: "Stats", campaign: "Campaign", settings: "Settings" };

// Without a password the dashboard is localhost only, and the token secret is random per start.
const secret = () => config.dashboardPassword || SESSION_SECRET;
const SESSION_SECRET = randomBytes(32).toString("hex");
const csrf = () => createHmac("sha256", secret()).update("csrf").digest("hex");
const digest = (s: string) => createHash("sha256").update(s).digest();

function authorized(req: IncomingMessage): boolean {
  if (!config.dashboardPassword) return true;
  const h = req.headers.authorization ?? "";
  if (!h.startsWith("Basic ")) return false;
  const given = Buffer.from(h.slice(6), "base64").toString().split(":").slice(1).join(":");
  return timingSafeEqual(digest(given), digest(config.dashboardPassword));
}

const isLoopback = (host: string) => ["127.0.0.1", "localhost", "::1"].includes(host);

async function readForm(req: IncomingMessage): Promise<URLSearchParams> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const ch of req) {
    size += (ch as Buffer).length;
    if (size > 400_000) throw new Error("body too large");
    chunks.push(ch as Buffer);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString());
}

const CSS = `
:root{--bg:#f6f7f9;--card:#fff;--text:#1a1d21;--muted:#667085;--line:#e3e6ea;--accent:#0b6b4f;--danger:#b42318}
@media (prefers-color-scheme:dark){:root{--bg:#121417;--card:#1b1e23;--text:#e8eaed;--muted:#98a2b3;--line:#2c3037;--accent:#3ecf9e;--danger:#f97066}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 system-ui,sans-serif}
main{max-width:56rem;margin:0 auto;padding:1rem}
nav{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center;margin-bottom:1rem}
nav a{padding:.35rem .8rem;border-radius:6px;color:var(--text);text-decoration:none;border:1px solid var(--line);background:var(--card)}
nav a.on{background:var(--accent);color:#fff;border-color:var(--accent)}
select{padding:.35rem;border-radius:6px;border:1px solid var(--line);background:var(--card);color:var(--text)}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:1rem;margin-bottom:1rem}
.meta{color:var(--muted);font-size:13px}.score{font-weight:600;color:var(--accent)}.ok{color:var(--accent)}.bad{color:var(--danger)}
input[type=text],input[type=number],input[type=password],textarea{width:100%;padding:.5rem;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--text);font:inherit}
textarea{min-height:9rem;resize:vertical}textarea.tall{min-height:22rem;font:13px/1.4 ui-monospace,monospace}
label{display:block;margin-top:.6rem;font-weight:600}label .meta{font-weight:400}
.row{display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;margin-top:.6rem}
button{padding:.45rem .9rem;border-radius:6px;border:1px solid var(--line);background:var(--card);color:var(--text);font:inherit;cursor:pointer}
button.go{background:var(--accent);border-color:var(--accent);color:#fff}button.no{color:var(--danger)}
table{border-collapse:collapse;width:100%}td,th{text-align:left;padding:.35rem .6rem;border-bottom:1px solid var(--line)}
blockquote{margin:.5rem 0;padding-left:.8rem;border-left:3px solid var(--line);color:var(--muted);white-space:pre-wrap}
pre{white-space:pre-wrap;background:var(--bg);padding:.7rem;border-radius:6px;border:1px solid var(--line);max-height:22rem;overflow:auto;margin:.5rem 0 0}
.flash{border-color:var(--accent)}h3{margin:.2rem 0 .3rem}
`;

function layout(c: number, tab: Tab, campaigns: { id: number; name: string }[], inner: string, msg: string, refresh: boolean): string {
  const opts = campaigns.map((x) => `<option value="${x.id}"${x.id === c ? " selected" : ""}>${esc(x.name)}</option>`).join("");
  const links = TABS.map((t) => `<a href="/?c=${c}&tab=${t}" class="${tab === t ? "on" : ""}">${LABEL[t]}</a>`).join("");
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
${refresh ? '<meta http-equiv="refresh" content="3">' : ""}<title>Lead agent</title><style>${CSS}</style><body><main>
<nav>${campaigns.length ? `<form method="get"><input type="hidden" name="tab" value="${tab}"><select name="c" onchange="this.form.submit()">${opts}</select></form>` : ""}${links}</nav>
${msg ? `<div class="card flash">${esc(msg)}</div>` : ""}${inner}</main></body></html>`;
}

const hidden = (c: number, tab: string) =>
  `<input type="hidden" name="_t" value="${csrf()}"><input type="hidden" name="c" value="${c}"><input type="hidden" name="tab" value="${tab}">`;

// ---------- Run ----------

async function runView(c: number): Promise<{ html: string; running: boolean }> {
  const one = async (sql: string) => Number((await pool.query(sql, [c])).rows[0].n);
  const newLeads = await one("SELECT count(*) n FROM leads WHERE campaign_id=$1 AND status='new'");
  const scored = await one("SELECT count(*) n FROM leads WHERE campaign_id=$1 AND status='scored'");
  const drafts = await one("SELECT count(*) n FROM messages m JOIN leads l ON l.id=m.lead_id WHERE l.campaign_id=$1 AND m.status='draft'");
  const approved = await one("SELECT count(*) n FROM messages m JOIN leads l ON l.id=m.lead_id WHERE l.campaign_id=$1 AND m.status='approved'");
  const replies = await one("SELECT count(*) n FROM replies r JOIN leads l ON l.id=r.lead_id WHERE l.campaign_id=$1 AND r.handled=0");

  const check = (ok: boolean, label: string, fix: string) =>
    `<tr><td class="${ok ? "ok" : "bad"}">${ok ? "OK" : "Missing"}</td><td>${label}</td><td class="meta">${ok ? "" : fix}</td></tr>`;
  const setup = `<div class="card"><h3>Setup</h3><table>
${check(isSet("ANTHROPIC_API_KEY"), "Anthropic key", "Needed to score leads and write emails. Settings tab.")}
${check(isSet("APOLLO_API_KEY"), "Apollo key", "Optional. Without it you get 3 sample leads.")}
${check(!!(config.smtpHost && config.smtpUser && config.smtpPass && config.fromEmail), "Sending mailbox", "Needed to send. Settings tab.")}
${check(!!(config.senderName && config.senderCompany && config.senderAddress), "Your name, company, address", "Needed in the email footer. Settings tab.")}
${check(!!config.imapHost, "Reading replies (IMAP)", "Needed to catch replies and unsubscribes. Settings tab.")}
</table></div>`;

  const step = (n: number, title: string, note: string, name: string, extra = "", label = "Run", cls = "go", confirmMsg = "") =>
    `<form method="post" action="/run" class="card"${confirmMsg ? ` onsubmit="return confirm('${confirmMsg}')"` : ""}>${hidden(c, "run")}<input type="hidden" name="step" value="${name}">
<b>${n}. ${title}</b> <span class="meta">${note}</span><div class="row">${extra}<button class="${cls}">${label}</button></div></form>`;

  const j = currentJob();
  const running = j?.status === "running";
  const jobCard = j
    ? `<div class="card"><b>${esc(j.name)}</b> <span class="${j.status === "failed" ? "bad" : "ok"}">${j.status === "running" ? "running..." : j.status}</span>
<pre>${esc(j.log.join("\n") || "Working...")}</pre></div>`
    : "";

  const html =
    setup +
    jobCard +
    `<div class="meta" style="margin-bottom:.6rem">New leads: ${newLeads} · Scored, ready to write: ${scored} · Drafts to review: ${drafts} · Approved, waiting to send: ${approved} · Replies for you: ${replies}</div>` +
    step(1, "Find leads", "Searches Apollo using this campaign's segments.", "source", `<input type="number" name="limit" value="10" min="1" max="100" style="width:6rem"> <span class="meta">leads</span>`, "Find leads") +
    step(2, "Score leads", "Claude rejects leads that do not fit.", "score", "", "Score leads") +
    step(3, "Write drafts", `Then open the <a href="/?c=${c}&tab=drafts">Drafts</a> tab to review and approve.`, "write", "", "Write drafts") +
    step(4, "Send approved emails", `Up to ${config.dailyCap} per day. Dry run only prints them.`, "send_dry", "", "Dry run", "") +
    step(4, "Send for real", "Reads your inbox first, then sends approved emails.", "send_live", "", "Send for real", "no", "Send approved emails now?") +
    step(5, "Check replies", "Reads the inbox, sorts replies, stops sequences for unsubscribes and bounces.", "replies", "", "Check replies") +
    step(6, "Draft follow-ups", "For leads who did not reply. Review them in Drafts.", "followups", "", "Draft follow-ups");
  return { html, running };
}

const STEPS: Record<string, (c: number, f: URLSearchParams) => Promise<unknown>> = {
  source: (c, f) => sourceLeads(c, Math.min(100, Math.max(1, Number(f.get("limit")) || 10))).then((n) => `${n} new leads`),
  score: (c) => scoreLeads(c),
  write: (c) => writeDrafts(c).then((n) => `${n} drafts written`),
  send_dry: (c) => sendApproved(c, false),
  send_live: (c) => sendApproved(c, true),
  replies: () => processReplies(14),
  followups: (c) => draftFollowups(c).then((n) => `${n} follow-ups drafted`),
};

// ---------- Drafts ----------

async function draftsView(c: number): Promise<string> {
  const { rows } = await pool.query(
    `SELECT m.id, m.step, m.subject, m.body, l.email, l.first_name, l.last_name, l.title, l.company, l.segment, l.score, l.score_reason
     FROM messages m JOIN leads l ON l.id=m.lead_id
     WHERE l.campaign_id=$1 AND m.status='draft' AND m.channel='email'
     ORDER BY l.score DESC NULLS LAST, m.id LIMIT 50`,
    [c],
  );
  const { rows: tot } = await pool.query(
    "SELECT count(*) n FROM messages m JOIN leads l ON l.id=m.lead_id WHERE l.campaign_id=$1 AND m.status='draft'",
    [c],
  );
  if (!rows.length) return `<div class="card">No drafts waiting. Use the <a href="/?c=${c}&tab=run">Run</a> tab to write some.</div>`;
  const cards = rows
    .map(
      (d) => `<form class="card" method="post" action="/draft">${hidden(c, "drafts")}<input type="hidden" name="id" value="${d.id}">
<div><b>${esc(d.company)}</b> <span class="score">${esc(d.score)}</span> <span class="meta">step ${d.step}${d.segment ? " · " + esc(d.segment) : ""}</span></div>
<div class="meta">${esc(d.first_name)} ${esc(d.last_name)}, ${esc(d.title)} &lt;${esc(d.email)}&gt;</div>
<div class="meta">Why: ${esc(d.score_reason)}</div>
<p><input type="text" name="subject" value="${esc(d.subject)}"></p>
<textarea name="body">${esc(d.body)}</textarea>
<div class="meta">Footer, postal address and opt-out line are added when sending.</div>
<div class="row"><button class="go" name="action" value="approve">Approve</button><button name="action" value="save">Save edit</button><button class="no" name="action" value="reject">Reject</button></div></form>`,
    )
    .join("");
  const n = Number(tot[0].n);
  const more = n > rows.length ? `<p class="meta">Showing ${rows.length} of ${n}, highest score first.</p>` : "";
  const all = `<form method="post" action="/approve-all" onsubmit="return confirm('Approve all ${n} drafts without reading them?')">${hidden(c, "drafts")}<button>Approve all ${n} remaining</button></form>`;
  return more + cards + all;
}

// ---------- Inbox ----------

async function inboxView(c: number): Promise<string> {
  const rows = await listInbox(c);
  if (!rows.length) return `<div class="card">Nothing needs you. Use Check replies on the Run tab to read the mailbox.</div>`;
  return rows
    .map(
      (r) => `<form class="card" method="post" action="/handled">${hidden(c, "inbox")}<input type="hidden" name="id" value="${r.id}">
<div><b>${esc(r.company)}</b> <span class="score">${esc(r.category)}</span> <span class="meta">&lt;${esc(r.email)}&gt;</span></div>
<div class="meta">${esc(r.summary)}</div><blockquote>${esc(String(r.body).slice(0, 800))}</blockquote>
${r.suggested_reply ? `<div class="meta">Suggested reply (edit it, then send from your mailbox):</div><textarea readonly onclick="this.select()">${esc(r.suggested_reply)}</textarea>` : ""}
<div class="row"><button class="go">Mark handled</button></div></form>`,
    )
    .join("");
}

// ---------- Stats ----------

async function statsView(c: number): Promise<string> {
  const q = async (sql: string, params: (string | number)[] = [c]) => (await pool.query(sql, params)).rows;
  const leads = await q("SELECT status, count(*) n FROM leads WHERE campaign_id=$1 GROUP BY 1 ORDER BY 1");
  const msgs = await q("SELECT m.status, count(*) n FROM messages m JOIN leads l ON l.id=m.lead_id WHERE l.campaign_id=$1 GROUP BY 1 ORDER BY 1");
  const reps = await q("SELECT r.category status, count(*) n FROM replies r JOIN leads l ON l.id=r.lead_id WHERE l.campaign_id=$1 GROUP BY 1 ORDER BY 1");
  const today = (await q("SELECT count(*) n FROM messages WHERE status='sent' AND sent_at >= strftime('%Y-%m-%dT00:00:00Z','now')", []))[0].n;
  const table = (title: string, rows: { status: string; n: number }[]) =>
    `<div class="card"><b>${title}</b><table>${rows.map((r) => `<tr><td>${esc(r.status)}</td><td>${r.n}</td></tr>`).join("") || "<tr><td>none</td></tr>"}</table></div>`;
  return `<div class="card">Sent today: <b>${today}</b> of ${config.dailyCap} (all campaigns)</div>${table("Leads", leads)}${table("Messages", msgs)}${table("Replies", reps)}`;
}

// ---------- Campaign ----------

async function campaignView(c: number): Promise<string> {
  const { rows } = await pool.query("SELECT * FROM campaigns WHERE id=$1", [c]);
  const cur = rows[0];
  const edit = cur
    ? `<form class="card" method="post" action="/campaign/update">${hidden(c, "campaign")}<input type="hidden" name="id" value="${cur.id}">
<h3>Edit: ${esc(cur.name)}</h3>
<label>What you offer <span class="meta">Claude uses this in every email</span></label><input type="text" name="offer" value="${esc(cur.offer)}">
<label>Minimum score to keep a lead <span class="meta">0 to 100. Higher means stricter.</span></label><input type="number" name="min_score" value="${cur.min_score}" min="0" max="100">
<label>Who to target <span class="meta">Segments with their own pitch and pain. Change it any time.</span></label>
<textarea class="tall" name="icp" spellcheck="false">${esc(JSON.stringify(JSON.parse(cur.icp), null, 2))}</textarea>
<div class="row"><button class="go">Save campaign</button></div></form>`
    : "";
  const create = `<form class="card" method="post" action="/campaign/create">${hidden(c, "campaign")}
<h3>${cur ? "New campaign" : "Create your first campaign"}</h3>
<label>Name</label><input type="text" name="name" value="${esc(DEFAULT_NAME)}">
<label>What you offer</label><input type="text" name="offer" value="${esc(DEFAULT_OFFER)}">
<label>Minimum score to keep a lead</label><input type="number" name="min_score" value="60" min="0" max="100">
<label>Who to target <span class="meta">Starts from the VATcube template. Edit the text, especially every pitch and pain line.</span></label>
<textarea class="tall" name="icp" spellcheck="false">${esc(DEFAULT_ICP)}</textarea>
<div class="row"><button class="go">Create campaign</button></div></form>`;
  return edit + create;
}

// ---------- Settings ----------

function settingsView(c: number): string {
  const groups = FIELDS.map(
    (g) => `<div class="card"><h3>${esc(g.group)}</h3>${g.fields
      .map((f) => {
        const value = f.secret ? "" : process.env[f.key] ?? "";
        const ph = f.secret ? (isSet(f.key) ? "set, leave empty to keep" : "not set") : "";
        return `<label>${esc(f.label)} ${f.hint ? `<span class="meta">${esc(f.hint)}</span>` : ""}</label>
<input type="${f.secret ? "password" : "text"}" name="${f.key}" value="${esc(value)}" placeholder="${esc(ph)}" autocomplete="off">`;
      })
      .join("")}</div>`,
  ).join("");
  return `<form method="post" action="/settings">${hidden(c, "settings")}${groups}<div class="row"><button class="go">Save settings</button></div></form>
<div class="card"><h3>Test your mailbox</h3><div class="meta">Save first. The sending test emails your own mailbox.</div>
<form method="post" action="/test" class="row">${hidden(c, "settings")}<button name="what" value="smtp">Test sending</button><button name="what" value="imap">Test reading replies</button></form></div>`;
}

// ---------- Server ----------

const flashUrl = (c: number, tab: string, msg: string) => `/?c=${c}&tab=${tab}&msg=${encodeURIComponent(msg)}`;

async function post(url: URL, f: URLSearchParams, res: ServerResponse): Promise<void> {
  const c = Number(f.get("c")) || 0;
  const tab = TABS.includes(f.get("tab") as Tab) ? (f.get("tab") as string) : "run";
  const id = Number(f.get("id"));
  let go = flashUrl(c, tab, "");
  try {
    switch (url.pathname) {
      case "/draft": {
        const action = f.get("action");
        if (action === "save" || action === "approve") await editDraft(id, f.get("subject") ?? "", f.get("body") ?? "");
        if (action === "approve") await approve(id);
        if (action === "reject") await reject(id);
        go = `/?c=${c}&tab=drafts`;
        break;
      }
      case "/approve-all":
        await approve("all", c);
        go = `/?c=${c}&tab=drafts`;
        break;
      case "/handled":
        await markHandled(id);
        go = `/?c=${c}&tab=inbox`;
        break;
      case "/run": {
        const step = f.get("step") ?? "";
        const fn = STEPS[step];
        if (!fn || !c) throw new Error("Create a campaign first (Campaign tab)");
        const ok = startJob(step.replace("_", " "), () => fn(c, f));
        go = flashUrl(c, "run", ok ? "" : "A job is still running. Wait for it to finish.");
        break;
      }
      case "/campaign/create": {
        const newId = await createCampaign(f.get("name") ?? "", f.get("offer") ?? "", JSON.parse(f.get("icp") ?? "{}"), Number(f.get("min_score")) || 60);
        go = flashUrl(newId, "run", "Campaign created.");
        break;
      }
      case "/campaign/update":
        await updateCampaign(id, f.get("offer") ?? "", Number(f.get("min_score")) || 60, JSON.parse(f.get("icp") ?? "{}"));
        go = flashUrl(c, "campaign", "Saved.");
        break;
      case "/settings": {
        const values: Record<string, string> = {};
        for (const g of FIELDS) for (const fld of g.fields) values[fld.key] = f.get(fld.key) ?? "";
        saveSettings(values);
        go = flashUrl(c, "settings", "Saved.");
        break;
      }
      case "/test":
        go = flashUrl(c, "settings", f.get("what") === "imap" ? await testImap() : await testSmtp());
        break;
      default:
        res.writeHead(404).end();
        return;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    go = flashUrl(c, tab, `Error: ${msg.slice(0, 300)}`);
  }
  res.writeHead(303, { Location: go }).end();
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // Blocks DNS rebinding: a hostile website cannot reach a localhost-only dashboard under its own name.
  if (isLoopback(config.dashboardHost) && !/^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(req.headers.host ?? "")) {
    res.writeHead(403).end("Bad host");
    return;
  }
  if (!authorized(req)) {
    res.writeHead(401, { "WWW-Authenticate": 'Basic realm="lead-agent"' }).end("Login required");
    return;
  }
  const url = new URL(req.url ?? "/", "http://localhost");

  if (req.method === "POST") {
    const f = await readForm(req);
    if (f.get("_t") !== csrf()) {
      res.writeHead(403).end("Bad token");
      return;
    }
    await post(url, f, res);
    return;
  }

  if (url.pathname !== "/") {
    res.writeHead(404).end();
    return;
  }
  const campaigns = (await pool.query("SELECT id, name FROM campaigns ORDER BY id")).rows as { id: number; name: string }[];
  const c = campaigns.find((x) => x.id === Number(url.searchParams.get("c")))?.id ?? campaigns[0]?.id ?? 0;
  const asked = url.searchParams.get("tab") as Tab | null;
  let tab: Tab = asked && TABS.includes(asked) ? asked : c ? "run" : "campaign";
  if (!c && (tab === "run" || tab === "drafts" || tab === "inbox" || tab === "stats")) tab = "campaign";

  let inner = "";
  let refresh = false;
  if (tab === "run") {
    const r = await runView(c);
    inner = r.html;
    refresh = r.running;
  } else if (tab === "drafts") inner = await draftsView(c);
  else if (tab === "inbox") inner = await inboxView(c);
  else if (tab === "stats") inner = await statsView(c);
  else if (tab === "campaign") inner = await campaignView(c);
  else inner = settingsView(c);

  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Frame-Options": "DENY" });
  res.end(layout(c, tab, campaigns, inner, url.searchParams.get("msg") ?? "", refresh));
}

function openBrowser(url: string): void {
  const [cmd, args] =
    process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
  try {
    spawn(cmd, args, { stdio: "ignore", detached: true }).on("error", () => {}).unref();
  } catch {
    /* the URL is printed anyway */
  }
}

export function startDashboard(): void {
  if (!isLoopback(config.dashboardHost) && !config.dashboardPassword) {
    throw new Error("Set DASHBOARD_PASSWORD before exposing the dashboard beyond this computer");
  }
  if (config.dashboardPassword && config.dashboardPassword.length < 12) throw new Error("DASHBOARD_PASSWORD needs 12+ characters");

  const url = `http://${config.dashboardHost}:${config.dashboardPort}`;
  const open = process.argv.includes("--open");
  const server = createServer((req, res) => {
    handle(req, res).catch((e) => {
      console.error(e);
      if (!res.headersSent) res.writeHead(500);
      res.end("Server error");
    });
  });
  server.on("error", (e: NodeJS.ErrnoException) => {
    if (e.code === "EADDRINUSE") {
      console.log(`Already running. Opening ${url}`);
      if (open) openBrowser(url);
      process.exit(0);
    }
    throw e;
  });
  server.listen(config.dashboardPort, config.dashboardHost, () => {
    console.log(`Lead agent is running at ${url}\nKeep this window open. Close it to stop the agent.`);
    if (open) openBrowser(url);
  });
}
