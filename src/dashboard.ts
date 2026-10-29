import { spawn } from "node:child_process";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { config } from "./config.js";
import { getMeta, pool, setMeta } from "./db.js";
import { draftFollowups } from "./followups.js";
import { testImap, testSmtp } from "./health.js";
import { currentJob, startJob } from "./jobs.js";
import { approve, createCampaign, editDraft, reject, scoreLeads, sourceLeads, updateCampaign, writeDrafts } from "./pipeline.js";
import { markHandled, markUnhandled, processReplies } from "./replies.js";
import { sendApproved } from "./sender.js";
import { saveSettings, FIELDS } from "./settings.js";
import { shell } from "./ui/kit.js";
import { activityView, campaignView, helpView, leadsView, settingsView } from "./ui/more.js";
import { conversationsView, outboxView, todayView } from "./ui/work.js";

const TABS = ["today", "outbox", "conversations", "leads", "campaign", "activity", "settings", "help"] as const;
type Tab = (typeof TABS)[number];

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

const STEPS: Record<string, (c: number, f: URLSearchParams) => Promise<unknown>> = {
  source: (c, f) => sourceLeads(c, Math.min(100, Math.max(1, Number(f.get("limit")) || 10))).then((n) => `${n} new leads`),
  score: (c) => scoreLeads(c),
  write: (c) => writeDrafts(c).then((n) => `${n} drafts written`),
  send_dry: (c) => sendApproved(c, false),
  send_live: (c) => sendApproved(c, true),
  replies: () => processReplies(14),
  followups: (c) => draftFollowups(c).then((n) => `${n} follow-ups drafted`),
};

// ---------- Server ----------

const flashUrl = (c: number, tab: string, msg: string) => `/?c=${c}&tab=${tab}&msg=${encodeURIComponent(msg)}`;

async function post(url: URL, f: URLSearchParams, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const c = Number(f.get("c")) || 0;
  const tab = TABS.includes(f.get("tab") as Tab) ? (f.get("tab") as string) : "today";
  const id = Number(f.get("id"));
  const ajax = req.headers["x-requested-with"] === "fetch";
  let go = flashUrl(c, tab, "");
  try {
    switch (url.pathname) {
      case "/draft": {
        const action = f.get("action");
        // Only touch the text when the form actually carries it, so a plain approve never blanks a draft.
        if ((action === "save" || action === "approve") && f.has("subject") && f.has("body")) await editDraft(id, f.get("subject")!, f.get("body")!);
        if (action === "approve") await approve(id);
        if (action === "reject") await reject(id);
        go = `/?c=${c}&tab=outbox`;
        break;
      }
      case "/approve-all":
        await approve("all", c);
        go = flashUrl(c, "outbox", "All drafts approved.");
        break;
      case "/pause": {
        const paused = (await getMeta("paused")) === "1";
        await setMeta("paused", paused ? "0" : "1");
        go = flashUrl(c, "outbox", paused ? "Sending resumed." : "Sending paused.");
        break;
      }
      case "/handled":
        await markHandled(id);
        go = `/?c=${c}&tab=conversations&f=${encodeURIComponent(f.get("f") ?? "needs")}`;
        break;
      case "/unhandled":
        await markUnhandled(id);
        go = `/?c=${c}&tab=conversations&f=${encodeURIComponent(f.get("f") ?? "needs")}`;
        break;
      case "/run": {
        const step = f.get("step") ?? "";
        const fn = STEPS[step];
        if (!fn || !c) throw new Error("Create a campaign first (Campaign tab)");
        const ok = startJob(step.replace("_", " "), () => fn(c, f));
        go = flashUrl(c, "today", ok ? "" : "A job is still running. Wait for it to finish.");
        break;
      }
      case "/campaign/create": {
        const newId = await createCampaign(f.get("name") ?? "", f.get("offer") ?? "", JSON.parse(f.get("icp") ?? "{}"), Number(f.get("min_score")) || 60);
        go = flashUrl(newId, "today", "Campaign created.");
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
    if (ajax) {
      res.writeHead(400, { "Content-Type": "text/plain" }).end(msg.slice(0, 300));
      return;
    }
    go = flashUrl(c, tab, `Error: ${msg.slice(0, 300)}`);
  }
  if (ajax) {
    res.writeHead(204).end();
    return;
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
    res.writeHead(401, { "WWW-Authenticate": 'Basic realm="VATcube Leads Generator"' }).end("Login required");
    return;
  }
  const url = new URL(req.url ?? "/", "http://localhost");

  if (req.method === "POST") {
    const f = await readForm(req);
    if (f.get("_t") !== csrf()) {
      res.writeHead(403).end("Bad token");
      return;
    }
    await post(url, f, req, res);
    return;
  }

  if (url.pathname !== "/") {
    res.writeHead(404).end();
    return;
  }
  const q = url.searchParams;
  const campaigns = (await pool.query("SELECT id, name FROM campaigns ORDER BY id")).rows as { id: number; name: string }[];
  const c = campaigns.find((x) => x.id === Number(q.get("c")))?.id ?? campaigns[0]?.id ?? 0;
  const asked = q.get("tab") as Tab | null;
  let tab: Tab = asked && TABS.includes(asked) ? asked : c ? "today" : "campaign";
  if (!c && !["campaign", "settings", "help", "activity"].includes(tab)) tab = "campaign";

  const x = { c, token: csrf() };
  const job = currentJob();
  const scalar = async (sql: string) => (c ? Number((await pool.query(sql, [c])).rows[0].n) : 0);
  const drafts = await scalar("SELECT count(*) n FROM messages m JOIN leads l ON l.id=m.lead_id WHERE l.campaign_id=$1 AND m.status='draft'");
  const unread = await scalar("SELECT count(*) n FROM replies r JOIN leads l ON l.id=r.lead_id WHERE l.campaign_id=$1 AND r.handled=0");

  let body: string;
  switch (tab) {
    case "today": body = await todayView(x, job); break;
    case "outbox": body = await outboxView(x); break;
    case "conversations": body = await conversationsView(x, q.get("f") ?? "needs"); break;
    case "leads": body = await leadsView(x, q.get("f") ?? "all", q.get("q") ?? ""); break;
    case "campaign": body = await campaignView(x); break;
    case "activity": body = c ? await activityView(x) : '<div class="card empty">Create a campaign first.</div>'; break;
    case "settings": body = settingsView(x); break;
    default: body = helpView();
  }

  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Frame-Options": "DENY" });
  res.end(
    shell({
      c, tab, campaigns,
      counts: { today: drafts + unread, outbox: drafts, convo: unread },
      paused: (await getMeta("paused")) === "1",
      running: job?.status === "running",
      msg: q.get("msg") ?? "",
      body,
    }),
  );
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
    console.log(`VATcube Leads Generator is running at ${url}\nKeep this window open. Close it to stop the agent.`);
    if (open) openBrowser(url);
  });
}
