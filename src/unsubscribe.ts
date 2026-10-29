import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { config } from "./config.js";
import { suppress } from "./pipeline.js";

function sign(email: string): string {
  return createHmac("sha256", config.unsubSecret).update(email.toLowerCase()).digest("hex");
}

function valid(email: string, token: string): boolean {
  if (!config.unsubSecret || !email || !token) return false;
  const a = Buffer.from(sign(email));
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function unsubscribeUrl(email: string): string {
  const q = new URLSearchParams({ e: email.toLowerCase(), t: sign(email) });
  return `${config.publicUrl}/unsubscribe?${q}`;
}

const page = (body: string) =>
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem">${body}</body>`;

// GET shows a confirm button so link scanners do not unsubscribe people by accident.
// POST does the work, including RFC 8058 one-click requests from mail clients.
export function serve(): void {
  if (!config.unsubSecret) throw new Error("UNSUB_SECRET is not set");
  createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", config.publicUrl);
    if (url.pathname !== "/unsubscribe") {
      res.writeHead(404).end();
      return;
    }
    const email = url.searchParams.get("e") ?? "";
    const token = url.searchParams.get("t") ?? "";
    if (!valid(email, token)) {
      res.writeHead(400, { "Content-Type": "text/html" }).end(page("<p>Invalid link.</p>"));
      return;
    }
    if (req.method === "POST") {
      req.resume();
      await suppress(email, "unsubscribe");
      res.writeHead(200, { "Content-Type": "text/html" }).end(page("<p>You are unsubscribed. You will not hear from us again.</p>"));
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html" }).end(
      page(`<p>Unsubscribe <b>${email.replace(/[<>&"]/g, "")}</b>?</p><form method="post"><button>Unsubscribe</button></form>`),
    );
  }).listen(config.port, () => console.log(`listening on :${config.port}`));
}
