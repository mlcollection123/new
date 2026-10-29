import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { config } from "./config.js";
import type { Campaign, Lead } from "./types.js";

let client: Anthropic | undefined;

function segmentContext(c: Campaign, lead: Lead): string {
  const seg = c.icp.segments.find((s) => s.name === lead.segment);
  return seg ? `Segment: ${seg.name}\nPitch for this segment: ${seg.pitch}\nTheir pain: ${seg.pain}\n` : "";
}

async function ask(system: string, user: string): Promise<string> {
  if (!config.anthropicKey) throw new Error("ANTHROPIC_API_KEY is not set");
  client ??= new Anthropic({ apiKey: config.anthropicKey });
  const res = await client.messages.create({
    model: config.model,
    max_tokens: 1024,
    system,
    messages: [{ role: "user", content: user }],
  });
  return res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
}

function parseJson<T>(text: string, schema: z.ZodType<T>): T {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`No JSON in model output: ${text.slice(0, 200)}`);
  return schema.parse(JSON.parse(match[0]));
}

const ScoreSchema = z.object({ score: z.number().min(0).max(100), reason: z.string() });

export async function scoreLead(c: Campaign, lead: Lead): Promise<{ score: number; reason: string }> {
  const system =
    "You qualify sales leads against an ideal customer profile. Be strict. " +
    'Reply with JSON only: {"score": 0-100, "reason": "one sentence"}.';
  const user =
    `Offer: ${c.offer}\nICP: ${JSON.stringify(c.icp)}\n${segmentContext(c, lead)}\n` +
    `Lead: ${lead.first_name} ${lead.last_name}, ${lead.title} at ${lead.company} (${lead.domain})`;
  return parseJson(await ask(system, user), ScoreSchema);
}

const DraftSchema = z.object({ subject: z.string(), body: z.string() });

export async function writeEmail(c: Campaign, lead: Lead): Promise<{ subject: string; body: string }> {
  const system =
    "You write short cold emails (under 90 words). Plain text, no hype, no fake familiarity, " +
    "one clear low-pressure question at the end. Use only facts given. Do not invent details about the company. " +
    'Reply with JSON only: {"subject": "...", "body": "..."}. Do not include a signature or unsubscribe line.';
  const user =
    `Offer: ${c.offer}\n${segmentContext(c, lead)}` +
    `Why this lead fits: ${c.icp.notes}\n` +
    `Lead: ${lead.first_name} ${lead.last_name}, ${lead.title} at ${lead.company} (${lead.domain})`;
  return parseJson(await ask(system, user), DraftSchema);
}
