import type { Builder, Finding, ReportFinding } from "@/lib/audit/types";

function builderInstructions({ builder }: { builder: Builder }): string {
  if (builder === "lovable") {
    return "Use Lovable's editor and Settings → Domains when a domain change is needed. Run Supabase SQL in the connected project's SQL editor.";
  }

  if (builder === "cursor") {
    return "Make these changes in the named files, preserve the current UI, and show the diff before applying it.";
  }

  if (builder === "v0") {
    return "Apply the changes in the Next.js app and verify production headers and metadata after deployment.";
  }

  if (builder === "bolt") {
    return "Apply the changes in the generated app, then run its build and preview checks.";
  }

  return "Apply the smallest production-safe changes in the existing app and verify each request after deployment.";
}

function sqlFix({ finding }: { finding: Finding }): string {
  const evidence = finding.evidence.find((item) => item.table);
  const table = evidence?.table;

  if (!table) {
    return "Choose the affected table and enable Row Level Security before adding an owner-based SELECT policy.";
  }

  const columns = evidence?.columns ?? [];
  const ownerColumn = columns.includes("user_id")
    ? "user_id"
    : columns.includes("id")
      ? "id"
      : null;
  const policy = ownerColumn
    ? `create policy "Users can read their own rows" on public.${table} for select using (auth.uid() = ${ownerColumn});`
    : "-- Choose the owner column before creating the SELECT policy.";

  return [
    `alter table public.${table} enable row level security;`,
    policy,
  ].join("\n");
}

function findingFix({
  finding,
}: {
  finding: Finding | ReportFinding;
}): string {
  if (
    finding.category === "security" &&
    finding.evidence.some((evidence) => evidence.table)
  ) {
    return sqlFix({ finding });
  }

  return "whatToDo" in finding ? finding.whatToDo : finding.exactFix;
}

function formatItem({
  finding,
}: {
  finding: Finding | ReportFinding;
}): string {
  const evidence = finding.evidence
    .map((item) => {
      const status = item.status ?? "unavailable";
      const redacted = item.redacted ? `; ${item.redacted}` : "";
      return `${item.request} → HTTP ${status}${redacted}`;
    })
    .join(" | ");

  return [
    `[${finding.severity.toUpperCase()}] ${finding.title}`,
    `Finding: ${finding.summary}`,
    `Evidence: ${evidence || "No request evidence was available."}`,
    `Fix: ${findingFix({ finding })}`,
  ].join("\n");
}

function severityRank({ severity }: { severity: Finding["severity"] }): number {
  return {
    blocker: 0,
    high: 1,
    medium: 2,
    low: 3,
    info: 4,
  }[severity];
}

function isSafeFinding({
  finding,
}: {
  finding: Finding | ReportFinding;
}): boolean {
  if (!["security", "seo", "hygiene"].includes(finding.category)) {
    return false;
  }

  return !/image|h1|root|layout|design|visible|ui/i.test(
    `${finding.title} ${
      "whatToDo" in finding ? finding.whatToDo : finding.exactFix
    }`,
  );
}

export function buildFixPrompts({
  findings,
  builder,
  resolvedUrl,
  projectRef,
}: {
  findings: Array<Finding | ReportFinding>;
  builder: Builder;
  resolvedUrl: string;
  projectRef: string | null;
}): { full: string; safe: string } {
  const preamble =
    "You are fixing a production web app. Do not redesign anything. Preserve the existing UI, routes, behavior, and data model unless an item below requires a security fix.";
  const context = [
    `Context: builder=${builder}; framework=web app; Supabase project ref=${projectRef ?? "not detected"}; resolved URL=${resolvedUrl}.`,
    `Builder instructions: ${builderInstructions({ builder })}`,
  ].join("\n");
  const ordered = findings
    .filter((finding) => finding.severity !== "info")
    .sort(
      (first, second) =>
        severityRank({ severity: first.severity }) -
        severityRank({ severity: second.severity }),
    );
  const safeFindings = ordered.filter((finding) =>
    isSafeFinding({ finding }),
  );
  const format = (selected: Array<Finding | ReportFinding>): string => {
    const items = selected
      .map((finding, index) => {
        return `${index + 1}. ${formatItem({ finding })}`;
      })
      .join("\n\n");

    return `${preamble}\n\n${context}\n\n${items}`;
  };

  return {
    full: format(ordered),
    safe: format(safeFindings),
  };
}
