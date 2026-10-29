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
  if (!config.anthropicKey) throw new Error("The Anthropic key is missing. Add it on the Settings tab.");
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

export const REPLY_CATEGORIES = [
  "interested",
  "not_now",
  "objection",
  "not_interested",
  "unsubscribe",
  "out_of_office",
  "bounce",
  "other",
] as const;
export type ReplyCategory = (typeof REPLY_CATEGORIES)[number];

const ReplySchema = z.object({
  category: z.enum(REPLY_CATEGORIES),
  summary: z.string(),
  suggested_reply: z.string().optional(),
});

export async function classifyReply(
  c: Campaign,
  lead: Lead,
  subject: string,
  text: string,
): Promise<{ category: ReplyCategory; summary: string; suggested_reply?: string }> {
  const system =
    "You triage replies to cold outreach emails. Ignore quoted earlier messages and signatures. " +
    `Categories: ${REPLY_CATEGORIES.join(", ")}. ` +
    "Use unsubscribe for any request to stop emails or be removed. Use bounce for delivery failure notices. " +
    "For interested, not_now and objection, also write suggested_reply: under 70 words, plain text, " +
    "answer only what they asked, propose a short call for interested, no pricing or claims not stated in the offer, no signature. " +
    'Reply with JSON only: {"category": "...", "summary": "one sentence", "suggested_reply": "..."}. Omit suggested_reply for other categories.';
  const user =
    `Offer: ${c.offer}\n${segmentContext(c, lead)}` +
    `Lead: ${lead.first_name} ${lead.last_name}, ${lead.title} at ${lead.company}\n\n` +
    `Reply subject: ${subject}\nReply body:\n${text.slice(0, 3000)}`;
  return parseJson(await ask(system, user), ReplySchema);
}

export async function writeFollowup(
  c: Campaign,
  lead: Lead,
  step: number,
  isLast: boolean,
  firstEmail: string,
): Promise<{ body: string }> {
  const system =
    "You write short follow-up emails to cold outreach that got no reply (under 60 words, plain text). " +
    "Add one new angle, do not repeat the first email, no guilt, no fake urgency, no invented facts. " +
    (isLast
      ? "This is the final email: politely close the loop and say you will not write again unless they want to talk. "
      : "End with one low-pressure question. ") +
    'Reply with JSON only: {"body": "..."}. No subject, signature or unsubscribe line.';
  const user =
    `Offer: ${c.offer}\n${segmentContext(c, lead)}` +
    `Lead: ${lead.first_name} ${lead.last_name}, ${lead.title} at ${lead.company}\n` +
    `Follow-up number: ${step - 1}\nFirst email sent:\n${firstEmail}`;
  return parseJson(await ask(system, user), z.object({ body: z.string() }));
}
