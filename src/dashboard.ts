import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { config } from "./config.js";
import { pool } from "./db.js";
import { approve, editDraft, reject } from "./pipeline.js";
import { listInbox, markHandled } from "./replies.js";

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const digest = (s: string) => createHash("sha256").update(s).digest();
const csrf = () => createHmac("sha256", config.dashboardPassword).update("csrf").digest("hex");

function authorized(req: IncomingMessage): boolean {
  const h = req.headers.authorization ?? "";
  if (!h.startsWith("Basic ")) return false;
  const given = Buffer.from(h.slice(6), "base64").toString().split(":").slice(1).join(":");
  return timingSafeEqual(digest(given), digest(config.dashboardPassword));
}

async function readForm(req: IncomingMessage): Promise<URLSearchParams> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const ch of req) {
    size += (ch as Buffer).length;
    if (size > 200_000) throw new Error("body too large");
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
.meta{color:var(--muted);font-size:13px}.score{font-weight:600;color:var(--accent)}
input[type=text],textarea{width:100%;padding:.5rem;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--text);font:inherit}
textarea{min-height:9rem;resize:vertical}
.row{display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.6rem}
button{padding:.45rem .9rem;border-radius:6px;border:1px solid var(--line);background:var(--card);color:var(--text);font:inherit;cursor:pointer}
button.go{background:var(--accent);border-color:var(--accent);color:#fff}button.no{color:var(--danger)}
table{border-collapse:collapse;width:100%}td,th{text-align:left;padding:.35rem .6rem;border-bottom:1px solid var(--line)}
blockquote{margin:.5rem 0;padding-left:.8rem;border-left:3px solid var(--line);color:var(--muted);white-space:pre-wrap}
`;

function layout(c: number, tab: string, campaigns: { id: number; name: string }[], inner: string): string {
  const opts = campaigns.map((x) => `<option value="${x.id}"${x.id === c ? " selected" : ""}>${esc(x.name)}</option>`).join("");
  const link = (t: string, label: string) => `<a href="/?c=${c}&tab=${t}" class="${tab === t ? "on" : ""}">${label}</a>`;
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Lead agent</title><style>${CSS}</style><body><main>
<nav><form method="get"><input type="hidden" name="tab" value="${esc(tab)}"><select name="c" onchange="this.form.submit()">${opts}</select></form>
${link("drafts", "Drafts")}${link("inbox", "Inbox")}${link("stats", "Stats")}</nav>${inner}</main></body></html>`;
}

const hidden = (c: number, tab: string) =>
  `<input type="hidden" name="_t" value="${csrf()}"><input type="hidden" name="c" value="${c}"><input type="hidden" name="tab" value="${tab}">`;

async function draftsView(c: number): Promise<string> {
  const { rows } = await pool.query(
    `SELECT m.id, m.step, m.subject, m.body, l.email, l.first_name, l.last_name, l.title, l.company, l.segment, l.score, l.score_reason
     FROM messages m JOIN leads l ON l.id=m.lead_id
     WHERE l.campaign_id=$1 AND m.status='draft' AND m.channel='email'
     ORDER BY l.score DESC NULLS LAST, m.id LIMIT 50`,
    [c],
  );
  const { rows: tot } = await pool.query(
    "SELECT count(*)::int n FROM messages m JOIN leads l ON l.id=m.lead_id WHERE l.campaign_id=$1 AND m.status='draft'",
    [c],
  );
  if (!rows.length) return `<div class="card">No drafts waiting. Run <code>write</code> or <code>followups</code> first.</div>`;
  const cards = rows
    .map(
      (d) => `<form class="card" method="post" action="/draft">${hidden(c, "drafts")}<input type="hidden" name="id" value="${d.id}">
<div><b>${esc(d.company)}</b> <span class="score">${esc(d.score)}</span> <span class="meta">step ${d.step}${d.segment ? " · " + esc(d.segment) : ""}</span></div>
<div class="meta">${esc(d.first_name)} ${esc(d.last_name)}, ${esc(d.title)} &lt;${esc(d.email)}&gt;</div>
<div class="meta">Why: ${esc(d.score_reason)}</div>
<p><input type="text" name="subject" value="${esc(d.subject)}"></p>
<textarea name="body">${esc(d.body)}</textarea>
<div class="meta">Footer, postal address and unsubscribe link are added when sending.</div>
<div class="row"><button class="go" name="action" value="approve">Approve</button><button name="action" value="save">Save edit</button><button class="no" name="action" value="reject">Reject</button></div></form>`,
    )
    .join("");
  const more = tot[0].n > rows.length ? `<p class="meta">Showing ${rows.length} of ${tot[0].n}, highest score first.</p>` : "";
  const all = `<form method="post" action="/approve-all" onsubmit="return confirm('Approve all ${tot[0].n} drafts without reading them?')">${hidden(c, "drafts")}<button>Approve all ${tot[0].n} remaining</button></form>`;
  return more + cards + all;
}

async function inboxView(c: number): Promise<string> {
  const rows = await listInbox(c);
  if (!rows.length) return `<div class="card">Nothing needs you. Run <code>replies</code> to check the mailbox.</div>`;
  return rows
    .map(
      (r) => `<form class="card" method="post" action="/handled">${hidden(c, "inbox")}<input type="hidden" name="id" value="${r.id}">
<div><b>${esc(r.company)}</b> <span class="score">${esc(r.category)}</span> <span class="meta">&lt;${esc(r.email)}&gt;</span></div>
<div class="meta">${esc(r.summary)}</div><blockquote>${esc(String(r.body).slice(0, 800))}</blockquote>
${r.suggested_reply ? `<div class="meta">Suggested reply (edit, then send from your mailbox):</div><textarea readonly onclick="this.select()">${esc(r.suggested_reply)}</textarea>` : ""}
<div class="row"><button class="go">Mark handled</button></div></form>`,
    )
    .join("");
}

async function statsView(c: number): Promise<string> {
  const q = async (sql: string, params: unknown[] = [c]) => (await pool.query(sql, params)).rows;
  const leads = await q("SELECT status, count(*)::int n FROM leads WHERE campaign_id=$1 GROUP BY 1 ORDER BY 1");
  const msgs = await q("SELECT m.status, count(*)::int n FROM messages m JOIN leads l ON l.id=m.lead_id WHERE l.campaign_id=$1 GROUP BY 1 ORDER BY 1");
  const reps = await q("SELECT r.category status, count(*)::int n FROM replies r JOIN leads l ON l.id=r.lead_id WHERE l.campaign_id=$1 GROUP BY 1 ORDER BY 1");
  const today = (await q("SELECT count(*)::int n FROM messages WHERE status='sent' AND sent_at >= date_trunc('day', now())", []))[0].n;
  const table = (title: string, rows: { status: string; n: number }[]) =>
    `<div class="card"><b>${title}</b><table>${rows.map((r) => `<tr><td>${esc(r.status)}</td><td>${r.n}</td></tr>`).join("") || "<tr><td>none</td></tr>"}</table></div>`;
  return `<div class="card">Sent today: <b>${today}</b> of ${config.dailyCap} (all campaigns)</div>${table("Leads", leads)}${table("Messages", msgs)}${table("Replies", reps)}`;
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!authorized(req)) {
    res.writeHead(401, { "WWW-Authenticate": 'Basic realm="lead-agent"' }).end("Login required");
    return;
  }
  const url = new URL(req.url ?? "/", "http://localhost");
  const campaigns = (await pool.query("SELECT id, name FROM campaigns ORDER BY id")).rows as { id: number; name: string }[];

  if (req.method === "POST") {
    const f = await readForm(req);
    if (f.get("_t") !== csrf()) {
      res.writeHead(403).end("Bad token");
      return;
    }
    const c = Number(f.get("c"));
    const tab = ["drafts", "inbox", "stats"].includes(f.get("tab") ?? "") ? f.get("tab") : "drafts";
    const id = Number(f.get("id"));
    if (url.pathname === "/draft") {
      const action = f.get("action");
      if (action === "save" || action === "approve") await editDraft(id, f.get("subject") ?? "", f.get("body") ?? "");
      if (action === "approve") await approve(id);
      if (action === "reject") await reject(id);
    } else if (url.pathname === "/approve-all") {
      await approve("all", c);
    } else if (url.pathname === "/handled") {
      await markHandled(id);
    } else {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(303, { Location: `/?c=${c}&tab=${tab}` }).end();
    return;
  }

  if (url.pathname !== "/") {
    res.writeHead(404).end();
    return;
  }
  if (!campaigns.length) {
    res.writeHead(200, { "Content-Type": "text/html" }).end(layout(0, "drafts", [], `<div class="card">No campaigns yet. Run <code>campaign:create</code>.</div>`));
    return;
  }
  const c = campaigns.find((x) => x.id === Number(url.searchParams.get("c")))?.id ?? campaigns[0].id;
  const tab = ["drafts", "inbox", "stats"].includes(url.searchParams.get("tab") ?? "") ? url.searchParams.get("tab")! : "drafts";
  const inner = tab === "inbox" ? await inboxView(c) : tab === "stats" ? await statsView(c) : await draftsView(c);
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Frame-Options": "DENY" });
  res.end(layout(c, tab, campaigns, inner));
}

export function startDashboard(): void {
  if (config.dashboardPassword.length < 12) throw new Error("Set DASHBOARD_PASSWORD (12+ characters)");
  createServer((req, res) => {
    handle(req, res).catch((e) => {
      console.error(e);
      if (!res.headersSent) res.writeHead(500);
      res.end("Server error");
    });
  }).listen(config.dashboardPort, config.dashboardHost, () =>
    console.log(`dashboard on http://${config.dashboardHost}:${config.dashboardPort}`),
  );
}
