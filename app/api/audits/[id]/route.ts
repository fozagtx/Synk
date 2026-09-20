import { getAudit } from "@/lib/audit/store";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  const audit = getAudit({ id });
  if (audit === null) return Response.json({ error: "Audit not found" }, { status: 404 });
  return Response.json({ id: audit.id, status: audit.status, currentStep: audit.currentStep, report: audit.report, previousAuditId: audit.previousAuditId });
}
