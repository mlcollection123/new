import { config } from "./config.js";
import { getMeta, pool } from "./db.js";
import { searchApollo } from "./providers/apollo.js";
import type { Icp, RawLead, Segment } from "./types.js";

// ---------- Custom API connectors ----------

export interface CustomConfig {
  method: "GET" | "POST";
  url: string;
  headers: Record<string, string>;
  body: string;
  resultsPath: string;
  fields: Record<string, string>;
}

export interface Source {
  id: number;
  name: string;
  type: string;
  enabled: number;
  config: CustomConfig;
  secret: string | null;
}

export async function listSources(): Promise<Source[]> {
  const { rows } = await pool.query("SELECT * FROM sources ORDER BY id");
  return rows.map((r) => ({ ...r, config: JSON.parse(r.config) }));
}

export async function apolloEnabled(): Promise<boolean> {
  return (await getMeta("source_apollo_disabled")) !== "1";
}

export function validateConfig(c: CustomConfig): void {
  if (!/^https:\/\//i.test(c.url)) throw new Error("The URL must start with https://");
  if (!["GET", "POST"].includes(c.method)) throw new Error("Method must be GET or POST");
  if (!c.resultsPath.trim()) throw new Error("Say where the list of results is in the response (for example: data.people)");
  if (!c.fields.email) throw new Error('The field mapping needs at least "email"');
}

export async function saveSource(name: string, cfg: CustomConfig, secret: string): Promise<number> {
  if (!name.trim()) throw new Error("Give the source a name");
  validateConfig(cfg);
  const { rows } = await pool.query("INSERT INTO sources (name, type, config, secret) VALUES ($1,'custom',$2,$3) RETURNING id", [name.trim(), cfg, secret || null]);
  return rows[0].id;
}

export async function setSourceEnabled(id: number | "apollo", on: boolean): Promise<void> {
  if (id === "apollo") await pool.query("INSERT INTO meta (key,value) VALUES ('source_apollo_disabled',$1) ON CONFLICT (key) DO UPDATE SET value=excluded.value", [on ? "0" : "1"]);
  else await pool.query("UPDATE sources SET enabled=$2 WHERE id=$1", [id, on ? 1 : 0]);
}

export async function deleteSource(id: number): Promise<void> {
  await pool.query("DELETE FROM sources WHERE id=$1", [id]);
}

// Placeholders: {{key}}, {{limit}}, {{titles}}, {{keywords}}, {{industries}}, {{locations}}, {{employeeRanges}}
// and the same with _json (for example {{titles_json}} gives ["CEO","CFO"]).
function vars(icp: Icp, seg: Segment | undefined, limit: number, key: string): Record<string, string> {
  const lists = {
    titles: [...icp.titles, ...(seg?.titles ?? [])],
    keywords: [...icp.keywords, ...(seg?.keywords ?? [])],
    industries: [...icp.industries, ...(seg?.industries ?? [])],
    locations: icp.locations,
    employeeRanges: icp.employeeRanges,
  };
  const out: Record<string, string> = { key, limit: String(limit) };
  for (const [k, v] of Object.entries(lists)) {
    out[k] = v.join(",");
    out[k + "_json"] = JSON.stringify(v);
  }
  return out;
}

const render = (tpl: string, v: Record<string, string>, encode: boolean) =>
  tpl.replace(/\{\{(\w+)\}\}/g, (_, k: string) => (k in v ? (encode && !k.endsWith("_json") ? encodeURIComponent(v[k]) : v[k]) : ""));

export function getPath(obj: unknown, path: string): unknown {
  return path
    .split(".")
    .filter(Boolean)
    .reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), obj);
}

const str = (x: unknown) => (x === undefined || x === null || x === "" ? undefined : typeof x === "object" ? JSON.stringify(x) : String(x));

export function mapRow(row: unknown, fields: Record<string, string>): RawLead | null {
  const g = (k: string) => (fields[k] ? str(getPath(row, fields[k])) : undefined);
  const email = g("email");
  if (!email || !email.includes("@")) return null;
  return {
    email,
    firstName: g("firstName"), lastName: g("lastName"), title: g("title"), company: g("company"), domain: g("domain"),
    linkedinUrl: g("linkedinUrl"), phone: g("phone"), city: g("city"), country: g("country"), website: g("website"),
    industry: g("industry"), employees: g("employees"), companyLinkedin: g("companyLinkedin"), description: g("description"),
    emailStatus: g("emailStatus"), externalId: g("externalId"), raw: row,
  };
}

async function callOnce(s: Source, icp: Icp, seg: Segment | undefined, limit: number): Promise<{ leads: RawLead[]; preview: string }> {
  const c = s.config;
  const v = vars(icp, seg, limit, s.secret ?? "");
  const headers: Record<string, string> = {};
  for (const [k, val] of Object.entries(c.headers)) headers[k] = render(val, v, false);
  if (c.method === "POST" && !Object.keys(headers).some((h) => h.toLowerCase() === "content-type")) headers["Content-Type"] = "application/json";
  const res = await fetch(render(c.url, v, true), { method: c.method, headers, body: c.method === "POST" ? render(c.body, v, false) : undefined });
  const text = await res.text();
  if (!res.ok) throw new Error(`${s.name} answered ${res.status}: ${text.slice(0, 200)}`);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${s.name} did not return JSON: ${text.slice(0, 120)}`);
  }
  const list = getPath(json, c.resultsPath);
  if (!Array.isArray(list)) throw new Error(`${s.name}: nothing found at "${c.resultsPath}" in the response. Start of response: ${text.slice(0, 200)}`);
  const leads = list.slice(0, limit).map((r) => mapRow(r, c.fields)).filter((l): l is RawLead => !!l).map((l) => ({ ...l, segment: seg?.name }));
  return { leads, preview: text.slice(0, 300) };
}

export async function runCustom(s: Source, icp: Icp, limit: number): Promise<RawLead[]> {
  if (!icp.segments.length) return (await callOnce(s, icp, undefined, limit)).leads;
  const per = Math.ceil(limit / icp.segments.length);
  const out: RawLead[] = [];
  for (const seg of icp.segments) out.push(...(await callOnce(s, icp, seg, per)).leads);
  return out;
}

// Small request for the "Test" button: shows what was mapped, or why nothing was.
export async function testSource(s: Source, icp: Icp): Promise<string> {
  const { leads, preview } = await callOnce(s, icp, icp.segments[0], 3);
  if (!leads.length) return `Connected, but no usable leads were mapped. Check the field mapping. Start of response: ${preview}`;
  return `Works. ${leads.length} sample lead${leads.length === 1 ? "" : "s"}: ${leads.map((l) => `${[l.firstName, l.lastName].filter(Boolean).join(" ") || "?"} <${l.email}>${l.company ? " at " + l.company : ""}`).join("; ")}`;
}

export interface SourceResult {
  source: string;
  leads: RawLead[];
  error?: string;
}

// Runs every enabled source. One failing source never stops the others.
export async function runSources(icp: Icp, limit: number): Promise<SourceResult[]> {
  const out: SourceResult[] = [];
  if (await apolloEnabled()) {
    try {
      out.push({ source: config.apolloKey ? "Apollo" : "Apollo (sample data)", leads: await searchApollo(icp, limit) });
    } catch (e) {
      out.push({ source: "Apollo", leads: [], error: e instanceof Error ? e.message : String(e) });
    }
  }
  for (const s of (await listSources()).filter((x) => x.enabled)) {
    try {
      out.push({ source: s.name, leads: await runCustom(s, icp, limit) });
    } catch (e) {
      out.push({ source: s.name, leads: [], error: e instanceof Error ? e.message : String(e) });
    }
  }
  return out;
}

// ---------- CSV import ----------

export function parseCsv(text: string): string[][] {
  const first = text.split(/\r?\n/, 1)[0] ?? "";
  const delim = [",", ";", "\t"].map((d) => [d, first.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

const HEADERS: Record<string, string[]> = {
  email: ["email", "emailaddress", "workemail", "businessemail"],
  firstName: ["firstname", "first", "givenname"],
  lastName: ["lastname", "last", "surname", "familyname"],
  fullName: ["name", "fullname", "contactname"],
  title: ["title", "jobtitle", "position", "role"],
  company: ["company", "companyname", "organization", "organisation", "employer"],
  domain: ["domain", "companydomain"],
  website: ["website", "websiteurl", "companywebsite", "url"],
  linkedinUrl: ["linkedin", "linkedinurl", "personlinkedinurl", "profileurl"],
  companyLinkedin: ["companylinkedin", "companylinkedinurl"],
  phone: ["phone", "phonenumber", "mobile", "mobilephone", "directphone"],
  city: ["city", "town"],
  country: ["country"],
  industry: ["industry", "sector"],
  employees: ["employees", "employeecount", "companysize", "headcount", "numberofemployees"],
  description: ["description", "about", "bio", "companydescription"],
  emailStatus: ["emailstatus", "verification"],
};

export function csvToLeads(text: string, segment?: string): { leads: RawLead[]; skipped: number } {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error("The list needs a header row and at least one person");
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const header = rows[0].map(norm);
  const col: Record<string, number> = {};
  for (const [field, names] of Object.entries(HEADERS)) {
    const i = header.findIndex((h) => names.includes(h));
    if (i >= 0) col[field] = i;
  }
  if (col.email === undefined) throw new Error('No email column found. Name the column "email".');
  const leads: RawLead[] = [];
  let skipped = 0;
  for (const r of rows.slice(1)) {
    const get = (f: string) => (col[f] === undefined ? undefined : r[col[f]]?.trim() || undefined);
    const email = get("email");
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      skipped++;
      continue;
    }
    let first = get("firstName");
    let last = get("lastName");
    const full = get("fullName");
    if (!first && !last && full) [first, ...[last]] = [full.split(" ")[0], full.split(" ").slice(1).join(" ") || undefined];
    const website = get("website");
    const domain = get("domain") ?? (website ? website.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0] : undefined);
    leads.push({
      email, firstName: first, lastName: last, title: get("title"), company: get("company"), domain, website,
      linkedinUrl: get("linkedinUrl"), companyLinkedin: get("companyLinkedin"), phone: get("phone"), city: get("city"),
      country: get("country"), industry: get("industry"), employees: get("employees"), description: get("description"),
      emailStatus: get("emailStatus"), segment, raw: Object.fromEntries(rows[0].map((h, i) => [h, r[i]])),
    });
  }
  return { leads, skipped };
}
