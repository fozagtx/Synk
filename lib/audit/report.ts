import type { AuditReport, Builder, Finding, ReportFinding, Scores } from "@/lib/audit/types";

function effortFor({ severity }: { severity: Finding["severity"] }): ReportFinding["effort"] {
  if (severity === "blocker") return "1 hour";
  if (severity === "high") return "30 min";
  if (severity === "medium") return "30 min";
  if (severity === "low") return "15 min";
  return "15 min";
}

function enrich({ finding }: { finding: Finding }): ReportFinding {
  return { ...finding, whatToDo: finding.exactFix, effort: effortFor({ severity: finding.severity }) };
}

export function buildReport({ findings, scores, builder, resolvedUrl, fixPrompt, safeFixPrompt }: { findings: Finding[]; scores: Scores; builder: Builder; resolvedUrl: string; fixPrompt: string; safeFixPrompt: string }): AuditReport {
  const reportFindings = findings.map((finding) => enrich({ finding }));
  const prioritizedFixes = [...reportFindings].sort((a, b) => severityRank({ severity: a.severity }) - severityRank({ severity: b.severity }));
  const headline = scores.launchBlocked ? "Your site is not ready to launch" : scores.overall >= 85 ? "Your site looks ready to launch" : "Your site needs a focused rescue";
  const verdict = scores.launchBlocked ? "We found at least one issue that can expose data or break the launch." : "No launch-blocking issue was found in this deterministic audit.";
  return { headline, verdict, builder, resolvedUrl, scores, findings: reportFindings, prioritizedFixes, fixPrompt, safeFixPrompt };
}

function severityRank({ severity }: { severity: Finding["severity"] }): number {
  return { blocker: 0, high: 1, medium: 2, low: 3, info: 4 }[severity];
}
