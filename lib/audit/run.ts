import { discoverSite } from "@/lib/audit/discover";
import { buildFixPrompts } from "@/lib/audit/fix-prompt";
import { buildReport, overlayReportProse } from "@/lib/audit/report";
import { checks } from "@/lib/audit/registry";
import { scoreFindings } from "@/lib/audit/score";
import { getAudit, updateAudit } from "@/lib/audit/store";
import { env } from "@/lib/env";
import { writeReportProse } from "@/lib/llm/nebius";
import type {
  Audit,
  AuditStep,
  Check,
  Finding,
  StepState,
} from "@/lib/audit/types";

const discoveryStep: AuditStep = {
  id: "discover",
  label: "discovering your site",
  state: "pending",
};

export const auditSteps: AuditStep[] = [
  discoveryStep,
  ...checks.map((check) => ({
    id: check.id,
    label: checkLabel({ id: check.id }),
    state: "pending" as const,
  })),
  ...(env.nebiusApiKey === null
    ? []
    : [
        {
          id: "writing-report",
          label: "writing your report",
          state: "pending" as const,
        },
      ]),
];

function updateStep({
  audit,
  stepId,
  state,
}: {
  audit: Audit;
  stepId: string;
  state: StepState;
}): void {
  const current = getAudit({ id: audit.id });

  if (current === null) {
    return;
  }

  const steps = current.steps.map((step) => {
    return step.id === stepId ? { ...step, state } : step;
  });
  updateAudit({ id: audit.id, changes: { steps } });
}

function unavailableFinding({
  check,
  reason,
}: {
  check: Pick<Check, "id" | "category">;
  reason: string;
}): Finding {
  return {
    id: `${check.id}-unavailable`,
    checkId: check.id,
    category: check.category,
    severity: "info",
    title: "This check could not complete",
    summary: `The audit could not safely finish this check: ${reason}`,
    whyItMatters:
      "No passing conclusion is claimed when a check is unavailable.",
    exactFix: "Re-run the audit after the site is reachable.",
    evidence: [],
  };
}

async function checkWithTimeout({
  check,
  context,
}: {
  check: Check;
  context: Parameters<Check["run"]>[0];
}): Promise<Finding[]> {
  const result = await Promise.race([
    check.run(context).then(
      (findings) => ({ findings, timedOut: false }),
      (error: unknown) => ({
        error: error instanceof Error ? error.message : "unknown check error",
        timedOut: false,
      }),
    ),
    new Promise<{ timedOut: true }>((resolve) => {
      setTimeout(() => {
        resolve({ timedOut: true });
      }, check.timeoutMs);
    }),
  ]);

  if ("timedOut" in result && result.timedOut) {
    return [
      unavailableFinding({
        check,
        reason: `the ${check.timeoutMs / 1000}-second time limit was reached`,
      }),
    ];
  }

  if ("error" in result) {
    return [
      unavailableFinding({
        check,
        reason: result.error,
      }),
    ];
  }

  return result.findings;
}

function checkLabel({ id }: { id: string }): string {
  return (
    {
      "chk-01-deploy": "checking deployment and HTTPS",
      "chk-02-seo": "checking your search and page structure",
      "chk-03-perf": "checking performance signals",
      "chk-04-supabase": "checking your Supabase tables (read-only)",
      "chk-05-hygiene": "checking security headers and launch hygiene",
    }[id] ?? "checking your site"
  );
}

async function completeAudit({
  audit,
  findings,
  builder,
  resolvedUrl,
  projectRef,
  crawlSource,
}: {
  audit: Audit;
  findings: Finding[];
  builder: Parameters<typeof buildFixPrompts>[0]["builder"];
  resolvedUrl: string;
  projectRef: string | null;
  crawlSource: "firecrawl" | "fetch";
}): Promise<void> {
  const scores = scoreFindings({ findings });
  const deterministicReport = buildReport({
    findings,
    builder,
    resolvedUrl,
    scores,
    fixPrompt: "",
    safeFixPrompt: "",
    crawlSource,
  });
  const reportWithProse =
    env.nebiusApiKey === null
      ? deterministicReport
      : await writeProse({
          audit,
          report: deterministicReport,
          findings,
          scores,
          builder,
          resolvedUrl,
        });
  const prompts = buildFixPrompts({
    findings: reportWithProse.findings,
    builder,
    resolvedUrl,
    projectRef,
  });
  const report = {
    ...reportWithProse,
    fixPrompt: prompts.full,
    safeFixPrompt: prompts.safe,
  };

  updateAudit({
    id: audit.id,
    changes: {
      status: "done",
      findings,
      scores,
      report,
      steps: (getAudit({ id: audit.id })?.steps ?? audit.steps).map((step) => ({
        ...step,
        state: step.state === "unavailable" ? "unavailable" : "done",
      })),
    },
  });
}

async function writeProse({
  audit,
  report,
  findings,
  scores,
  builder,
  resolvedUrl,
}: {
  audit: Audit;
  report: ReturnType<typeof buildReport>;
  findings: Finding[];
  scores: ReturnType<typeof scoreFindings>;
  builder: Parameters<typeof buildFixPrompts>[0]["builder"];
  resolvedUrl: string;
}): Promise<ReturnType<typeof buildReport>> {
  updateStep({ audit, stepId: "writing-report", state: "running" });
  const prose = await writeReportProse({
    findings,
    scores,
    builder,
    resolvedUrl,
  });

  if (prose instanceof Error) {
    console.warn(
      JSON.stringify({
        event: "nebius_prose_unavailable",
        auditId: audit.id,
        error: prose.message,
      }),
    );
    updateStep({ audit, stepId: "writing-report", state: "unavailable" });
    return report;
  }

  updateStep({ audit, stepId: "writing-report", state: "done" });
  return overlayReportProse({ report, prose });
}

export async function runAudit({ audit }: { audit: Audit }): Promise<void> {
  updateAudit({ id: audit.id, changes: { status: "running" } });
  updateStep({ audit, stepId: "discover", state: "running" });
  const context = await discoverSite({ inputUrl: audit.url });

  if (context instanceof Error) {
    const failed = [
      unavailableFinding({
        check: { id: "discover", category: "deploy" },
        reason: context.message,
      }),
    ];
    updateStep({ audit, stepId: "discover", state: "unavailable" });
    checks.map((check) => {
      updateStep({ audit, stepId: check.id, state: "unavailable" });
      return check.id;
    });
    await completeAudit({
      audit,
      findings: failed,
      builder: "unknown",
      resolvedUrl: audit.url,
      projectRef: null,
      crawlSource: "fetch",
    });
    return;
  }

  updateStep({ audit, stepId: "discover", state: "done" });
  const result = await Promise.all(
    checks.map(async (check) => {
      updateStep({ audit, stepId: check.id, state: "running" });
      const findings = await checkWithTimeout({
        check,
        context,
      });
      const unavailable = findings.some(
        (finding) => finding.severity === "info" &&
          finding.id === `${check.id}-unavailable`,
      );
      updateStep({
        audit,
        stepId: check.id,
        state: unavailable ? "unavailable" : "done",
      });
      return findings;
    }),
  );
  await completeAudit({
    audit,
    findings: result.flat(),
    builder: context.builder,
    resolvedUrl: context.resolvedUrl,
    projectRef: context.supabaseProjectRef,
    crawlSource: context.crawlSource,
  });
}
