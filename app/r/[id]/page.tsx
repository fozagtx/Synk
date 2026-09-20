"use client";

import {
  ArrowPathIcon,
  ClipboardDocumentIcon,
  DocumentArrowDownIcon,
} from "@heroicons/react/24/outline";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SiteNav } from "@/components/site-nav";
import { isRecord } from "@/lib/audit/errors";
import type {
  AuditComparison,
  AuditReport,
  Builder,
  Category,
  ReportFinding,
  Scores,
  Severity,
} from "@/lib/audit/types";

interface ResponseShape {
  status: string;
  report: AuditReport | null;
  comparison: AuditComparison | null;
}

const categoryEntries: Array<[Category, keyof Scores]> = [
  ["deploy", "deploy"],
  ["seo", "seo"],
  ["perf", "perf"],
  ["security", "security"],
  ["hygiene", "hygiene"],
];

function readBuilder({ value }: { value: unknown }): Builder {
  if (
    value === "lovable" ||
    value === "bolt" ||
    value === "v0" ||
    value === "cursor"
  ) {
    return value;
  }

  return "unknown";
}

function readSeverity({ value }: { value: unknown }): Severity | null {
  if (
    value === "blocker" ||
    value === "high" ||
    value === "medium" ||
    value === "low" ||
    value === "info"
  ) {
    return value;
  }

  return null;
}

function readCategory({ value }: { value: unknown }): Category | null {
  if (
    value === "deploy" ||
    value === "seo" ||
    value === "perf" ||
    value === "security" ||
    value === "hygiene"
  ) {
    return value;
  }

  return null;
}

function readFinding({ value }: { value: unknown }): ReportFinding | null {
  if (!isRecord(value)) {
    return null;
  }

  const severity = readSeverity({ value: value.severity });
  const category = readCategory({ value: value.category });

  if (
    typeof value.id !== "string" ||
    typeof value.checkId !== "string" ||
    category === null ||
    severity === null ||
    typeof value.title !== "string" ||
    typeof value.summary !== "string" ||
    typeof value.whyItMatters !== "string" ||
    typeof value.exactFix !== "string" ||
    !Array.isArray(value.evidence)
  ) {
    return null;
  }

  return {
    id: value.id,
    checkId: value.checkId,
    category,
    severity,
    title: value.title,
    summary: value.summary,
    whyItMatters: value.whyItMatters,
    exactFix: value.exactFix,
    evidence: value.evidence
      .filter((item) => isRecord(item))
      .map((item) => ({
        request: typeof item.request === "string" ? item.request : "",
        status: typeof item.status === "number" ? item.status : null,
        redacted:
          typeof item.redacted === "string" ? item.redacted : undefined,
        table: typeof item.table === "string" ? item.table : null,
        columns: Array.isArray(item.columns)
          ? item.columns.filter((column): column is string => typeof column === "string")
          : [],
      })),
    whatToDo:
      typeof value.whatToDo === "string" ? value.whatToDo : value.exactFix,
    effort: readEffort({
      value: typeof value.effort === "string" ? value.effort : "15 min",
    }),
  };
}

function readEffort({
  value,
}: {
  value: string;
}): ReportFinding["effort"] {
  if (
    value === "15 min" ||
    value === "30 min" ||
    value === "1 hour" ||
    value === "2+ hours"
  ) {
    return value;
  }

  return "15 min";
}

function isCategoryScore(value: unknown): value is number | null {
  return typeof value === "number" || value === null;
}

function readScores({ value }: { value: unknown }): Scores | null {
  if (
    !isRecord(value) ||
    !isCategoryScore(value.deploy) ||
    !isCategoryScore(value.seo) ||
    !isCategoryScore(value.perf) ||
    !isCategoryScore(value.security) ||
    !isCategoryScore(value.hygiene) ||
    typeof value.overall !== "number" ||
    typeof value.launchBlocked !== "boolean"
  ) {
    return null;
  }

  return {
    deploy: value.deploy,
    seo: value.seo,
    perf: value.perf,
    security: value.security,
    hygiene: value.hygiene,
    overall: value.overall,
    launchBlocked: value.launchBlocked,
  };
}

function readReport({ value }: { value: unknown }): AuditReport | null {
  if (
    !isRecord(value) ||
    typeof value.headline !== "string" ||
    typeof value.verdict !== "string" ||
    typeof value.resolvedUrl !== "string" ||
    !Array.isArray(value.findings) ||
    !Array.isArray(value.prioritizedFixes) ||
    typeof value.fixPrompt !== "string" ||
    typeof value.safeFixPrompt !== "string"
  ) {
    return null;
  }

  const scores = readScores({ value: value.scores });
  const findings = value.findings
    .map((finding) => readFinding({ value: finding }))
    .filter((finding): finding is ReportFinding => finding !== null);
  const prioritizedFixes = value.prioritizedFixes
    .map((finding) => readFinding({ value: finding }))
    .filter((finding): finding is ReportFinding => finding !== null);

  if (scores === null) {
    return null;
  }

  return {
    headline: value.headline,
    verdict: value.verdict,
    builder: readBuilder({ value: value.builder }),
    resolvedUrl: value.resolvedUrl,
    scores,
    findings,
    prioritizedFixes,
    fixPrompt: value.fixPrompt,
    safeFixPrompt: value.safeFixPrompt,
  };
}

function readComparison({
  value,
}: {
  value: unknown;
}): AuditComparison | null {
  if (!isRecord(value)) {
    return null;
  }

  const fixed = Array.isArray(value.fixed)
    ? value.fixed
        .map((finding) => readFinding({ value: finding }))
        .filter((finding): finding is ReportFinding => finding !== null)
    : [];
  const stillOpen = Array.isArray(value.stillOpen)
    ? value.stillOpen
        .map((finding) => readFinding({ value: finding }))
        .filter((finding): finding is ReportFinding => finding !== null)
    : [];
  const newlyFound = Array.isArray(value.new)
    ? value.new
        .map((finding) => readFinding({ value: finding }))
        .filter((finding): finding is ReportFinding => finding !== null)
    : [];

  return {
    fixed,
    stillOpen,
    new: newlyFound,
  };
}

function readResponse({ value }: { value: unknown }): ResponseShape | null {
  if (!isRecord(value) || typeof value.status !== "string") {
    return null;
  }

  return {
    status: value.status,
    report: readReport({ value: value.report }),
    comparison: readComparison({ value: value.comparison }),
  };
}

function severityClass({ severity }: { severity: Severity }): string {
  return {
    blocker: "severity-blocker",
    high: "severity-high",
    medium: "severity-medium",
    low: "severity-low",
    info: "severity-info",
  }[severity];
}

function ScorePanel({ report }: { report: AuditReport }) {
  return (
    <aside className="rounded-xl bg-surface-deep p-8 text-white">
      <p className="text-xs uppercase tracking-[0.18em] text-white/50">
        Launch score
      </p>
      <p className="font-display text-[80px] font-black leading-none tracking-[-0.08em]">
        {report.scores.overall}
      </p>
      <p className="mt-2 text-white/70">
        {report.scores.launchBlocked ? "Launch blocked" : "No blocker found"}
      </p>
    </aside>
  );
}

function FindingCard({ finding }: { finding: ReportFinding }) {
  return (
    <article className={`finding-card ${severityClass({ severity: finding.severity })}`}>
      <div className="flex items-start justify-between gap-4">
        <h3 className="font-display text-lg font-semibold text-ink">
          {finding.title}
        </h3>
        <span className="severity-chip">{finding.severity}</span>
      </div>
      <p className="mt-3 text-ink-muted">{finding.summary}</p>
      <p className="mt-3 text-sm text-ink-muted">
        <strong>Why it matters:</strong> {finding.whyItMatters}
      </p>
      <p className="mt-3 text-sm text-ink">
        <strong>Exact fix:</strong> {finding.exactFix}
      </p>
      {finding.evidence.length > 0 ? (
        <div className="mt-4 border-t border-hairline pt-3 text-xs text-caption-muted">
          {finding.evidence.map((evidence) => (
            <p key={evidence.request}>
              {evidence.request} → HTTP {evidence.status ?? "unavailable"}
              {evidence.redacted ? ` · ${evidence.redacted}` : ""}
            </p>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function ComparisonCard({ comparison }: { comparison: AuditComparison }) {
  return (
    <section className="rounded-xl border border-hairline p-6">
      <h2 className="font-display text-xl font-semibold text-ink">
        Since your last audit
      </h2>
      <div className="mt-4 grid gap-4 text-sm text-ink-muted md:grid-cols-3">
        <p>
          <strong className="text-primary">{comparison.fixed.length}</strong>{" "}
          fixed
        </p>
        <p>
          <strong className="text-ink">{comparison.stillOpen.length}</strong>{" "}
          still open
        </p>
        <p>
          <strong className="text-tertiary">{comparison.new.length}</strong>{" "}
          new
        </p>
      </div>
    </section>
  );
}

function FixPromptPanel({
  report,
  onCopySafe,
  onDownload,
  copied,
}: {
  report: AuditReport;
  onCopySafe: () => void;
  onDownload: () => void;
  copied: "full" | "safe" | null;
}) {
  return (
    <aside>
      <h2 className="font-display text-3xl font-bold text-ink">Fix Prompt</h2>
      <p className="mt-3 text-ink-muted">
        Full fixes are copied by default. Safe-only fixes avoid UX changes.
      </p>
      <pre className="mt-5 max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-xl bg-surface-1 p-5 text-xs leading-6 text-ink-soft">
        {report.fixPrompt}
      </pre>
      <div className="mt-4 flex flex-wrap items-center gap-4 text-sm font-semibold">
        <button className="text-primary" onClick={onDownload}>
          Download .md
        </button>
        <details>
          <summary className="cursor-pointer text-ink">
            Show safe-only prompt
          </summary>
          <pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap border border-hairline p-4 text-xs text-ink-soft">
            {report.safeFixPrompt}
          </pre>
        </details>
        <button className="text-primary" onClick={onCopySafe}>
          {copied === "safe" ? "Copied safe-only prompt" : "Copy safe-only prompt"}
        </button>
      </div>
    </aside>
  );
}

export default function ReportPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<ResponseShape | null>(null);
  const [copied, setCopied] = useState<"full" | "safe" | null>(null);

  useEffect(() => {
    void fetch(`/api/audits/${id}`, { cache: "no-store" })
      .then(async (response) => readResponse({ value: await response.json() }))
      .then((value) => setData(value));
  }, [id]);

  async function copyPrompt({ safe }: { safe: boolean }): Promise<void> {
    const report = data?.report;

    if (!report) {
      return;
    }

    await navigator.clipboard.writeText(
      safe ? report.safeFixPrompt : report.fixPrompt,
    );
    setCopied(safe ? "safe" : "full");
    window.setTimeout(() => setCopied(null), 1800);
  }

  function downloadPrompt(): void {
    const report = data?.report;

    if (!report) {
      return;
    }

    const blob = new Blob([report.fixPrompt], { type: "text/markdown" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "synk-fix-prompt.md";
    link.click();
    URL.revokeObjectURL(link.href);
  }

  async function recheck(): Promise<void> {
    const report = data?.report;

    if (!report) {
      return;
    }

    const response = await fetch("/api/audits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: report.resolvedUrl, force: true }),
    });
    const parsed: unknown = await response.json();

    if (isRecord(parsed) && typeof parsed.id === "string") {
      router.push(`/a/${parsed.id}`);
    }
  }

  const report = data?.report;

  if (!report) {
    return (
      <main className="mx-auto flex min-h-screen max-w-5xl items-center justify-center px-6">
        <p className="text-ink-muted">Loading your report…</p>
      </main>
    );
  }

  return (
    <main className="bg-canvas pb-20">
      <SiteNav variant="light" />
      <header className="mx-auto flex max-w-6xl items-center justify-end px-6">
        <span className="text-sm text-caption-muted">{report.resolvedUrl}</span>
      </header>
      <section className="mx-auto grid max-w-6xl gap-8 px-6 pt-12 lg:grid-cols-[1.3fr_0.7fr]">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-caption-muted">
            Vibe-Code Rescue Audit
          </p>
          <h1 className="mt-4 max-w-3xl font-display text-5xl font-bold leading-tight tracking-[-0.05em] text-ink">
            {report.headline}
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-ink-muted">
            {report.verdict}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button
              onClick={() => void copyPrompt({ safe: false })}
              className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-white"
            >
              <ClipboardDocumentIcon className="size-4" />
              {copied === "full" ? "Copied" : "Copy Fix Prompt"}
            </button>
            <button
              onClick={() => window.print()}
              className="inline-flex h-11 items-center gap-2 rounded-full border border-hairline-cool px-5 text-sm font-semibold text-ink"
            >
              <DocumentArrowDownIcon className="size-4" />
              Download PDF (print)
            </button>
            <button
              onClick={() => void recheck()}
              className="inline-flex h-11 items-center gap-2 rounded-full border border-hairline-cool px-5 text-sm font-semibold text-ink"
            >
              <ArrowPathIcon className="size-4" />
              Re-check
            </button>
          </div>
        </div>
        <ScorePanel report={report} />
      </section>
      <section className="mx-auto max-w-6xl px-6 pt-16">
        <div className="grid gap-3 sm:grid-cols-5">
          {categoryEntries.map(([name, key]) => (
            <div
              key={name}
              className="rounded-xl border border-hairline p-4"
            >
              <p className="text-xs uppercase tracking-widest text-caption-muted">
                {name}
              </p>
              {report.scores[key] === null ? (
                <>
                  <p className="mt-2 font-display text-3xl font-bold text-ink">
                    —
                  </p>
                  <p className="text-xs text-caption-muted">not checked</p>
                </>
              ) : (
                <p className="mt-2 font-display text-3xl font-bold text-ink">
                  {report.scores[key]}
                </p>
              )}
            </div>
          ))}
        </div>
        {data?.comparison ? (
          <div className="mt-8">
            <ComparisonCard comparison={data.comparison} />
          </div>
        ) : null}
        <div className="mt-12 grid gap-8 lg:grid-cols-[1fr_0.8fr]">
          <div>
            <h2 className="font-display text-3xl font-bold text-ink">
              What we found
            </h2>
            <div className="mt-6 flex flex-col gap-4">
              {report.findings.map((finding) => (
                <FindingCard key={finding.id} finding={finding} />
              ))}
            </div>
          </div>
          <FixPromptPanel
            report={report}
            copied={copied}
            onCopySafe={() => void copyPrompt({ safe: true })}
            onDownload={downloadPrompt}
          />
        </div>
      </section>
    </main>
  );
}
