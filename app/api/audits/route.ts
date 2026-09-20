import * as errore from "errore";

import { assertPublicUrl, normalizeUrl } from "@/lib/audit/discover";
import { InvalidAuditRequestError, InvalidJsonError } from "@/lib/audit/errors";
import { runAudit } from "@/lib/audit/run";
import { findPreviousAudit, findRecentAudit, saveAudit } from "@/lib/audit/store";
import type { Audit } from "@/lib/audit/types";

interface AuditRequest {
  url?: unknown;
  email?: unknown;
}

export async function POST(request: Request): Promise<Response> {
  const body = await errore.tryAsync({
    try: () => request.json() as Promise<AuditRequest>,
    catch: () => new InvalidJsonError(),
  });
  if (body instanceof Error) return Response.json({ error: body.message }, { status: 400 });
  if (typeof body.url !== "string") return Response.json({ error: new InvalidAuditRequestError({ field: "url", reason: "a site URL is required" }).message }, { status: 400 });
  const normalized = normalizeUrl({ value: body.url });
  if (normalized instanceof Error) return Response.json({ error: normalized.message }, { status: 400 });
  const publicUrl = await assertPublicUrl({ url: normalized });
  if (publicUrl instanceof Error) return Response.json({ error: publicUrl.message }, { status: 400 });
  const url = publicUrl.toString();
  const existing = findRecentAudit({ url });
  if (existing !== null) return Response.json({ id: existing.id, status: existing.status, deduped: true }, { status: 202 });
  const previous = findPreviousAudit({ url, excludingId: "" });
  const now = new Date().toISOString();
  const audit: Audit = { id: crypto.randomUUID(), url, email: typeof body.email === "string" ? body.email.trim() || null : null, status: "queued", currentStep: "queued", createdAt: now, updatedAt: now, findings: [], scores: null, report: null, previousAuditId: previous?.id ?? null };
  saveAudit({ audit });
  void runAudit({ audit });
  return Response.json({ id: audit.id, status: audit.status }, { status: 202 });
}
