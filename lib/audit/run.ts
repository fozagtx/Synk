import { discoverSite } from "@/lib/audit/discover";
import { buildFixPrompts } from "@/lib/audit/fix-prompt";
import { buildReport } from "@/lib/audit/report";
import { checks } from "@/lib/audit/registry";
import { scoreFindings } from "@/lib/audit/score";
import { getAudit, updateAudit } from "@/lib/audit/store";
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

function completeAudit({
  audit,
  findings,
  builder,
  resolvedUrl,
  projectRef,
}: {
  audit: Audit;
  findings: Finding[];
  builder: Parameters<typeof buildFixPrompts>[0]["builder"];
  resolvedUrl: string;
  projectRef: string | null;
}): void {
  const scores = scoreFindings({ findings });
  const prompts = buildFixPrompts({
    findings,
    builder,
    resolvedUrl,
    projectRef,
  });
  const report = buildReport({
    findings,
    scores,
    builder,
    resolvedUrl,
    fixPrompt: prompts.full,
    safeFixPrompt: prompts.safe,
  });

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
    completeAudit({
      audit,
      findings: failed,
      builder: "unknown",
      resolvedUrl: audit.url,
      projectRef: null,
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
  completeAudit({
    audit,
    findings: result.flat(),
    builder: context.builder,
    resolvedUrl: context.resolvedUrl,
    projectRef: context.supabaseProjectRef,
  });
}
