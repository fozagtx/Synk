import { discoverSite } from "@/lib/audit/discover";
import { buildFixPrompts } from "@/lib/audit/fix-prompt";
import { buildReport } from "@/lib/audit/report";
import { checks } from "@/lib/audit/registry";
import { scoreFindings } from "@/lib/audit/score";
import { updateAudit } from "@/lib/audit/store";
import type { Audit, Finding } from "@/lib/audit/types";

function checkTimeout({ promise, timeoutMs }: { promise: Promise<Finding[]>; timeoutMs: number }): Promise<Finding[]> {
  return Promise.race([promise, new Promise<Finding[]>((resolve) => setTimeout(() => resolve([]), timeoutMs))]);
}

export async function runAudit({ audit }: { audit: Audit }): Promise<void> {
  updateAudit({ id: audit.id, changes: { status: "running", currentStep: "discovering your site" } });
  const context = await discoverSite({ inputUrl: audit.url });
  if (context instanceof Error) {
    const failed = [{ id: "discover-failed", checkId: "discover", category: "deploy" as const, severity: "info" as const, title: "The site could not be fully discovered", summary: context.message, whyItMatters: "Some checks cannot make a reliable conclusion without a reachable site.", exactFix: "Confirm the URL is public, then run the audit again.", evidence: [] }];
    const scores = scoreFindings({ findings: failed });
    updateAudit({ id: audit.id, changes: { status: "done", currentStep: "complete", findings: failed, scores, report: buildReport({ findings: failed, scores, builder: "unknown", resolvedUrl: audit.url, fixPrompt: "", safeFixPrompt: "" }) } });
    return;
  }
  updateAudit({ id: audit.id, changes: { currentStep: "running checks" } });
  const result = await Promise.allSettled(checks.map(async (check) => {
    updateAudit({ id: audit.id, changes: { currentStep: checkLabel({ id: check.id }) } });
    return checkTimeout({ promise: check.run(context), timeoutMs: check.timeoutMs });
  }));
  const findings = result.flatMap((item, index) => item.status === "fulfilled" ? item.value : [{ id: `${checks[index]?.id ?? "check"}-failed`, checkId: checks[index]?.id ?? "check", category: checks[index]?.category ?? "hygiene", severity: "info" as const, title: "This check could not complete", summary: "The audit could not safely finish this check.", whyItMatters: "No passing conclusion is claimed when a check is unavailable.", exactFix: "Re-run the audit after the site is reachable.", evidence: [] }]);
  const scores = scoreFindings({ findings });
  const prompts = buildFixPrompts({ findings, builder: context.builder, resolvedUrl: context.resolvedUrl, projectRef: context.supabaseProjectRef });
  const report = buildReport({ findings, scores, builder: context.builder, resolvedUrl: context.resolvedUrl, fixPrompt: prompts.full, safeFixPrompt: prompts.safe });
  updateAudit({ id: audit.id, changes: { status: "done", currentStep: "complete", findings, scores, report } });
}

function checkLabel({ id }: { id: string }): string {
  return ({ "chk-01-deploy": "checking deployment and HTTPS", "chk-02-seo": "checking your search and page structure", "chk-03-perf": "checking performance signals", "chk-04-supabase": "checking your Supabase tables (read-only)", "chk-05-hygiene": "checking security headers and launch hygiene" } as Record<string, string>)[id] ?? "checking your site";
}
