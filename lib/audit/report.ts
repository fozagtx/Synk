import type {
  AuditReport,
  Builder,
  Finding,
  ReportFinding,
  ReportProse,
  Scores,
} from "@/lib/audit/types";

function effortFor({ severity }: { severity: Finding["severity"] }): ReportFinding["effort"] {
  if (severity === "blocker") return "1 hour";
  if (severity === "high") return "30 min";
  if (severity === "medium") return "30 min";
  if (severity === "low") return "15 min";
  return "15 min";
}

function enrich({ finding }: { finding: Finding }): ReportFinding {
  return {
    ...finding,
    whatToDo: finding.exactFix,
    effort: effortFor({ severity: finding.severity }),
  };
}

export function buildReport({
  findings,
  scores,
  builder,
  resolvedUrl,
  fixPrompt,
  safeFixPrompt,
  crawlSource,
}: {
  findings: Finding[];
  scores: Scores;
  builder: Builder;
  resolvedUrl: string;
  fixPrompt: string;
  safeFixPrompt: string;
  crawlSource: "firecrawl" | "fetch";
}): AuditReport {
  const reportFindings = findings.map((finding) => enrich({ finding }));
  const prioritizedFixes = [...reportFindings].sort((a, b) => severityRank({ severity: a.severity }) - severityRank({ severity: b.severity }));
  const headline = scores.launchBlocked ? "Your site is not ready to launch" : scores.overall >= 85 ? "Your site looks ready to launch" : "Your site needs a focused rescue";
  const verdict = scores.launchBlocked ? "We found at least one issue that can expose data or break the launch." : "No launch-blocking issue was found in this deterministic audit.";
  return {
    headline,
    verdict,
    builder,
    resolvedUrl,
    scores,
    findings: reportFindings,
    prioritizedFixes,
    fixPrompt,
    safeFixPrompt,
    proseSource: "deterministic",
    crawlSource,
  };
}

export function overlayReportProse({
  report,
  prose,
}: {
  report: AuditReport;
  prose: ReportProse;
}): AuditReport {
  const proseById = new Map(
    prose.findings.map((finding) => [finding.id, finding]),
  );
  const overlay = (finding: ReportFinding): ReportFinding => {
    const rewritten = proseById.get(finding.id);

    if (rewritten === undefined) {
      return finding;
    }

    return {
      ...finding,
      summary: rewritten.summary,
      whyItMatters: rewritten.whyItMatters,
      whatToDo: rewritten.whatToDo,
    };
  };
  const findings = report.findings.map((finding) => overlay(finding));

  return {
    ...report,
    headline: prose.headline,
    verdict: prose.verdict,
    findings,
    prioritizedFixes: report.prioritizedFixes.map((finding) =>
      overlay(finding),
    ),
    proseSource: "nebius",
  };
}

function severityRank({ severity }: { severity: Finding["severity"] }): number {
  return { blocker: 0, high: 1, medium: 2, low: 3, info: 4 }[severity];
}
