export type Severity = "blocker" | "high" | "medium" | "low" | "info";
export type Category = "deploy" | "seo" | "perf" | "security" | "hygiene";
export type Builder = "lovable" | "bolt" | "v0" | "cursor" | "unknown";
export type AuditStatus = "queued" | "running" | "done" | "failed";
export type StepState = "pending" | "running" | "done" | "unavailable";

export interface Evidence {
  request: string;
  status: number | null;
  redacted?: string;
  table?: string | null;
  columns?: string[];
}

export interface Finding {
  id: string;
  checkId: string;
  category: Category;
  severity: Severity;
  title: string;
  summary: string;
  whyItMatters: string;
  exactFix: string;
  evidence: Evidence[];
}

export interface SitePage {
  url: string;
  status: number;
  html: string;
  headers: Record<string, string>;
}

export interface SiteContext {
  inputUrl: string;
  resolvedUrl: string;
  origin: string;
  status: number;
  html: string;
  renderedHtml: string | null;
  crawlSource: "firecrawl" | "fetch";
  headers: Record<string, string>;
  pages: SitePage[];
  robots: string | null;
  sitemap: string | null;
  bundles: string[];
  builder: Builder;
  supabaseProjectUrl: string | null;
  supabaseAnonKey: string | null;
  supabaseProjectRef: string | null;
  supabaseTables: string[];
  supabaseBuckets: string[];
  serviceRoleTokens: string[];
  analytics: string[];
}

export interface Check {
  id: string;
  category: Category;
  timeoutMs: number;
  run: (ctx: SiteContext) => Promise<Finding[]>;
}

export interface AuditStep {
  id: string;
  label: string;
  state: StepState;
}

export interface Scores {
  deploy: number | null;
  seo: number | null;
  perf: number | null;
  security: number | null;
  hygiene: number | null;
  overall: number;
  launchBlocked: boolean;
}

export interface ReportFinding extends Finding {
  whatToDo: string;
  effort: "15 min" | "30 min" | "1 hour" | "2+ hours";
}

export interface AuditReport {
  headline: string;
  verdict: string;
  builder: Builder;
  resolvedUrl: string;
  scores: Scores;
  findings: ReportFinding[];
  prioritizedFixes: ReportFinding[];
  fixPrompt: string;
  safeFixPrompt: string;
  proseSource: "nebius" | "deterministic";
  crawlSource: "firecrawl" | "fetch";
}

export interface ReportProse {
  headline: string;
  verdict: string;
  findings: Array<{
    id: string;
    summary: string;
    whyItMatters: string;
    whatToDo: string;
  }>;
}

export interface AuditComparison {
  fixed: Finding[];
  stillOpen: Finding[];
  new: Finding[];
}

export interface Audit {
  id: string;
  url: string;
  email: string | null;
  status: AuditStatus;
  steps: AuditStep[];
  createdAt: string;
  updatedAt: string;
  findings: Finding[];
  scores: Scores | null;
  report: AuditReport | null;
  previousAuditId: string | null;
}
