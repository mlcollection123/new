import { z } from "zod";

export const SegmentSchema = z.object({
  name: z.string(),
  industries: z.array(z.string()).default([]),
  keywords: z.array(z.string()).default([]),
  titles: z.array(z.string()).default([]),
  // What you offer this segment and the problem it solves. Drives scoring and copy.
  pitch: z.string().default(""),
  pain: z.string().default(""),
});
export type Segment = z.infer<typeof SegmentSchema>;

// The ICP is data, not code. Edit it per campaign without touching the agent.
export const IcpSchema = z.object({
  // Each segment is searched separately and gets its own pitch. Empty means one generic search.
  segments: z.array(SegmentSchema).default([]),
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
  segment?: string;
  company?: string;
  domain?: string;
  linkedinUrl?: string;
  phone?: string;
  city?: string;
  country?: string;
  website?: string;
  industry?: string;
  employees?: string;
  companyLinkedin?: string;
  description?: string;
  emailStatus?: string;
  externalId?: string;
  raw?: unknown;
}

export interface Lead {
  id: number;
  campaign_id: number;
  email: string;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  segment: string | null;
  company: string | null;
  domain: string | null;
  linkedin_url: string | null;
  phone: string | null;
  city: string | null;
  country: string | null;
  website: string | null;
  industry: string | null;
  employees: string | null;
  description: string | null;
  source: string | null;
  score: number | null;
}
