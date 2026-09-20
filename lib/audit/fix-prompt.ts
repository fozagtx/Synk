import type { Builder, Finding } from "@/lib/audit/types";

function builderInstructions({ builder }: { builder: Builder }): string {
  if (builder === "lovable") return "Use Lovable's editor and Settings → Domains when a domain change is needed. Run the Supabase SQL in the connected project's SQL editor.";
  if (builder === "cursor") return "Make these changes in the named files, preserve the current UI, and show the diff before applying it.";
  if (builder === "v0") return "Apply the changes in the Next.js app and verify the production headers and metadata after deployment.";
  if (builder === "bolt") return "Apply the changes in the generated app, then run its build and preview checks.";
  return "Apply the smallest production-safe changes in the existing app and verify each request after deployment.";
}

function sqlFix({ finding }: { finding: Finding }): string {
  const table = finding.evidence[0]?.redacted?.match(/table[:=]\s*([a-z0-9_]+)/i)?.[1] ?? "your_table";
  return `alter table ${table} enable row level security;\ncreate policy "Users can read their own rows" on ${table} for select using (auth.uid() = user_id);`;
}

function item({ finding, builder }: { finding: Finding; builder: Builder }): string {
  const fix = finding.category === "security" && /table|data|read/i.test(finding.title) ? sqlFix({ finding }) : finding.exactFix;
  return `[${finding.severity.toUpperCase()}] ${finding.title}\nFinding: ${finding.summary}\nEvidence: ${finding.evidence.map((evidence) => `${evidence.request} → HTTP ${evidence.status ?? "unavailable"}${evidence.redacted ? `; ${evidence.redacted}` : ""}`).join(" | ")}\nFix: ${fix}\n${builderInstructions({ builder })}`;
}

export function buildFixPrompts({ findings, builder, resolvedUrl, projectRef }: { findings: Finding[]; builder: Builder; resolvedUrl: string; projectRef: string | null }): { full: string; safe: string } {
  const preamble = "You are fixing a production web app. Do not redesign anything. Preserve the existing UI, routes, behavior, and data model unless an item below requires a security fix.";
  const context = `Context: builder=${builder}; framework=web app; Supabase project ref=${projectRef ?? "not detected"}; resolved URL=${resolvedUrl}.`;
  const ordered = [...findings].sort((a, b) => ({ blocker: 0, high: 1, medium: 2, low: 3, info: 4 }[a.severity] - { blocker: 0, high: 1, medium: 2, low: 3, info: 4 }[b.severity]));
  const safeFindings = ordered.filter((finding) => finding.category === "security" || finding.category === "seo" || finding.category === "hygiene");
  const format = (selected: Finding[]): string => `${preamble}\n\n${context}\n\n${selected.map((finding, index) => `${index + 1}. ${item({ finding, builder })}`).join("\n\n")}`;
  return { full: format(ordered), safe: format(safeFindings) };
}
