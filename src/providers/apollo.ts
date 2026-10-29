import { config } from "../config.js";
import type { Icp, RawLead, Segment } from "../types.js";

// Verify endpoint and field names against current Apollo docs before production use.
// Apollo may return people without email addresses from this search; those are skipped.
const URL_SEARCH = "https://api.apollo.io/api/v1/mixed_people/api_search";

interface ApolloPerson {
  id?: string;
  first_name?: string;
  last_name?: string;
  title?: string;
  email?: string;
  email_status?: string;
  linkedin_url?: string;
  city?: string;
  state?: string;
  country?: string;
  phone_numbers?: { sanitized_number?: string }[];
  organization?: {
    name?: string;
    primary_domain?: string;
    website_url?: string;
    industry?: string;
    estimated_num_employees?: number;
    linkedin_url?: string;
    short_description?: string;
    phone?: string;
  };
}

export async function searchApollo(icp: Icp, limit: number): Promise<RawLead[]> {
  if (!config.apolloKey) return sampleLeads(limit);
  if (icp.segments.length === 0) return searchOne(icp, undefined, limit);
  const per = Math.ceil(limit / icp.segments.length);
  const out: RawLead[] = [];
  for (const seg of icp.segments) out.push(...(await searchOne(icp, seg, per)));
  return out;
}

async function searchOne(icp: Icp, seg: Segment | undefined, limit: number): Promise<RawLead[]> {
  const titles = [...icp.titles, ...(seg?.titles ?? [])];
  const tags = [...icp.industries, ...icp.keywords, ...(seg?.industries ?? []), ...(seg?.keywords ?? [])];

  const res = await fetch(URL_SEARCH, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": config.apolloKey },
    body: JSON.stringify({
      person_titles: titles,
      person_locations: icp.locations,
      organization_num_employees_ranges: icp.employeeRanges,
      q_organization_keyword_tags: tags,
      contact_email_status: ["verified"],
      per_page: Math.min(limit, 100),
      page: 1,
    }),
  });
  if (!res.ok) throw new Error(`Apollo ${res.status}: ${(await res.text()).slice(0, 200)}`);

  const data = (await res.json()) as { people?: ApolloPerson[] };
  return (data.people ?? [])
    .filter((p) => p.email)
    .map((p) => ({
      email: p.email!,
      firstName: p.first_name,
      lastName: p.last_name,
      title: p.title,
      segment: seg?.name,
      company: p.organization?.name,
      domain: p.organization?.primary_domain,
      website: p.organization?.website_url,
      industry: p.organization?.industry,
      employees: p.organization?.estimated_num_employees?.toString(),
      companyLinkedin: p.organization?.linkedin_url,
      description: p.organization?.short_description,
      linkedinUrl: p.linkedin_url,
      phone: p.phone_numbers?.[0]?.sanitized_number ?? p.organization?.phone,
      city: p.city,
      country: p.country,
      emailStatus: p.email_status,
      externalId: p.id,
      raw: p,
    }));
}

function sampleLeads(limit: number): RawLead[] {
  const all: RawLead[] = [
    { email: "ana@example-dental.test", firstName: "Ana", lastName: "Costa", title: "Owner", company: "Bright Dental", domain: "example-dental.test", industry: "Dental clinics", employees: "12", city: "Lisbon", country: "Portugal" },
    { email: "tom@example-saas.test", firstName: "Tom", lastName: "Reyes", title: "Head of Growth", company: "Loopwise", domain: "example-saas.test", industry: "Software", employees: "40", city: "Austin", country: "United States" },
    { email: "lea@example-shop.test", firstName: "Lea", lastName: "Novak", title: "Founder", company: "Novak Goods", domain: "example-shop.test", industry: "Retail", employees: "8", city: "Prague", country: "Czechia" },
  ];
  return all.slice(0, limit);
}
