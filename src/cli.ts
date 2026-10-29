import { readFileSync } from "node:fs";
import { pool, initDb } from "./db.js";
import * as p from "./pipeline.js";
import { sendApproved } from "./sender.js";
import { draftFollowups } from "./followups.js";
import { listInbox, markHandled, processReplies } from "./replies.js";
import { serve } from "./unsubscribe.js";

const USAGE = `Commands:
  db:init
  campaign:create <name> <offer> <icp.json> [minScore]
  campaign:icp <id> <icp.json>      change targeting any time
  source <id> [limit]               pull leads from Apollo (sample data without a key)
  score <id>                        Claude scores leads against the ICP
  write <id>                        Claude drafts emails for kept leads
  review <id>                       list drafts
  approve <messageId|all> [campaignId]
  send <campaignId> [--live]        send approved emails (dry run unless --live)
  replies [days]                    read the inbox, classify new replies, stop sequences when needed
  inbox [campaignId]                replies that need you, with a suggested answer
  handled <replyId>                 mark a reply as dealt with
  followups <campaignId>            draft due follow-ups (then review and approve)
  serve                             run the unsubscribe server
  suppress <email>`;

async function main(): Promise<boolean> {
  const [cmd, ...a] = process.argv.slice(2);
  switch (cmd) {
    case "db:init":
      await initDb();
      console.log("schema applied");
      break;
    case "campaign:create": {
      const [name, offer, file, min] = a;
      if (!name || !offer || !file) throw new Error(USAGE);
      const id = await p.createCampaign(name, offer, JSON.parse(readFileSync(file, "utf8")), min ? Number(min) : 60);
      console.log(`campaign ${id} created`);
      break;
    }
    case "campaign:icp":
      await p.updateIcp(Number(a[0]), JSON.parse(readFileSync(a[1], "utf8")));
      console.log("icp updated");
      break;
    case "source":
      console.log(`${await p.sourceLeads(Number(a[0]), Number(a[1] ?? 25))} new leads`);
      break;
    case "score":
      console.log(await p.scoreLeads(Number(a[0])));
      break;
    case "write":
      console.log(`${await p.writeDrafts(Number(a[0]))} drafts`);
      break;
    case "review":
      for (const d of await p.listDrafts(Number(a[0]))) {
        console.log(`\n#${d.id} step ${d.step} [${d.score}] ${d.company} <${d.email}>\nSubject: ${d.subject}\n${d.body}`);
      }
      break;
    case "approve":
      console.log(`${await p.approve(a[0] === "all" ? "all" : Number(a[0]), a[1] ? Number(a[1]) : undefined)} approved`);
      break;
    case "send":
      console.log(await sendApproved(Number(a[0]), a.includes("--live")));
      break;
    case "replies":
      console.log(await processReplies(a[0] ? Number(a[0]) : 14));
      break;
    case "inbox":
      for (const r of await listInbox(a[0] ? Number(a[0]) : undefined)) {
        console.log(`\n#${r.id} [${r.category}] ${r.company} <${r.email}>\n${r.summary}\n> ${r.body.slice(0, 400).replace(/\n/g, "\n> ")}`);
        if (r.suggested_reply) console.log(`\nSuggested reply:\n${r.suggested_reply}`);
      }
      break;
    case "handled":
      await markHandled(Number(a[0]));
      console.log("ok");
      break;
    case "followups":
      console.log(`${await draftFollowups(Number(a[0]))} follow-ups drafted`);
      break;
    case "serve":
      serve();
      return true;
    case "suppress":
      await p.suppress(a[0]);
      console.log("suppressed");
      break;
    default:
      console.log(USAGE);
  }
  return false;
}

// serve keeps running, so it keeps the pool open
main()
  .then((keepAlive) => (keepAlive ? undefined : pool.end()))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
    return pool.end();
  });
