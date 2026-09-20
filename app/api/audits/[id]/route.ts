import {
  compareAudits,
  getAudit,
} from "@/lib/audit/store";

export async function GET(
  _: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  const audit = getAudit({ id });

  if (audit === null) {
    return Response.json({ error: "Audit not found" }, { status: 404 });
  }

  const previous = audit.previousAuditId
    ? getAudit({ id: audit.previousAuditId })
    : null;
  const comparison =
    previous === null ? null : compareAudits({ current: audit, previous });

  return Response.json({
    id: audit.id,
    status: audit.status,
    steps: audit.steps,
    report: audit.report,
    previousAuditId: audit.previousAuditId,
    comparison,
  });
}
