import { z } from "zod";

// The ICP is data, not code. Edit it per campaign without touching the agent.
export const IcpSchema = z.object({
  industries: z.array(z.string()).default([]),
  keywords: z.array(z.string()).default([]),
  titles: z.array(z.string()).default([]),
  // Apollo format: "1,10", "11,50", "51,200"
  employeeRanges: z.array(z.string()).default([]),
  locations: z.array(z.string()).default([]),
  excludeDomains: z.array(z.string()).default([]),
  // Free text the scorer uses: good fit signals, deal breakers
  notes: z.string().default(""),
});
export type Icp = z.infer<typeof IcpSchema>;

export interface Campaign {
  id: number;
  name: string;
  offer: string;
  icp: Icp;
  min_score: number;
}

export interface RawLead {
  email: string;
  firstName?: string;
  lastName?: string;
  title?: string;
  company?: string;
  domain?: string;
  linkedinUrl?: string;
  raw?: unknown;
}

export interface Lead {
  id: number;
  campaign_id: number;
  email: string;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  company: string | null;
  domain: string | null;
  linkedin_url: string | null;
  score: number | null;
}
