import { config } from "../config.js";
import type { Icp, RawLead } from "../types.js";

// Verify endpoint and field names against current Apollo docs before production use.
const URL_SEARCH = "https://api.apollo.io/api/v1/mixed_people/api_search";

interface ApolloPerson {
  first_name?: string;
  last_name?: string;
  title?: string;
  email?: string;
  linkedin_url?: string;
  organization?: { name?: string; primary_domain?: string };
}

export async function searchLeads(icp: Icp, limit: number): Promise<RawLead[]> {
  if (!config.apolloKey) return sampleLeads(limit);

  const res = await fetch(URL_SEARCH, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": config.apolloKey },
    body: JSON.stringify({
      person_titles: icp.titles,
      person_locations: icp.locations,
      organization_num_employees_ranges: icp.employeeRanges,
      q_organization_keyword_tags: [...icp.industries, ...icp.keywords],
      contact_email_status: ["verified"],
      per_page: Math.min(limit, 100),
      page: 1,
    }),
  });
  if (!res.ok) throw new Error(`Apollo ${res.status}: ${await res.text()}`);

  const data = (await res.json()) as { people?: ApolloPerson[] };
  return (data.people ?? [])
    .filter((p) => p.email)
    .map((p) => ({
      email: p.email!,
      firstName: p.first_name,
      lastName: p.last_name,
      title: p.title,
      company: p.organization?.name,
      domain: p.organization?.primary_domain,
      linkedinUrl: p.linkedin_url,
      raw: p,
    }));
}

function sampleLeads(limit: number): RawLead[] {
  const all: RawLead[] = [
    { email: "ana@example-dental.test", firstName: "Ana", lastName: "Costa", title: "Owner", company: "Bright Dental", domain: "example-dental.test" },
    { email: "tom@example-saas.test", firstName: "Tom", lastName: "Reyes", title: "Head of Growth", company: "Loopwise", domain: "example-saas.test" },
    { email: "lea@example-shop.test", firstName: "Lea", lastName: "Novak", title: "Founder", company: "Novak Goods", domain: "example-shop.test" },
  ];
  return all.slice(0, limit);
}
