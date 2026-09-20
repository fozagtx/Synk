import * as errore from "errore";

import { assertPublicUrl, normalizeUrl } from "@/lib/audit/discover";
import { InvalidAuditRequestError, InvalidJsonError, isRecord } from "@/lib/audit/errors";
import { auditSteps, runAudit } from "@/lib/audit/run";
import {
  findPreviousAudit,
  findRecentAudit,
  saveAudit,
} from "@/lib/audit/store";
import type { Audit } from "@/lib/audit/types";

function readRequestBody({ value }: { value: unknown }): {
  url: string;
  email: string | null;
  force: boolean;
} | Error {
  if (!isRecord(value) || typeof value.url !== "string") {
    return new InvalidAuditRequestError({
      field: "url",
      reason: "a site URL is required",
    });
  }

  return {
    url: value.url,
    email: typeof value.email === "string" ? value.email.trim() || null : null,
    force: value.force === true,
  };
}

export async function POST(request: Request): Promise<Response> {
  const parsed = await errore.tryAsync({
    try: () => request.json(),
    catch: () => new InvalidJsonError(),
  });

  if (parsed instanceof Error) {
    return Response.json({ error: parsed.message }, { status: 400 });
  }

  const body = readRequestBody({ value: parsed });

  if (body instanceof Error) {
    return Response.json({ error: body.message }, { status: 400 });
  }

  const normalized = normalizeUrl({ value: body.url });

  if (normalized instanceof Error) {
    return Response.json({ error: normalized.message }, { status: 400 });
  }

  const publicUrl = await assertPublicUrl({ url: normalized });

  if (publicUrl instanceof Error) {
    return Response.json({ error: publicUrl.message }, { status: 400 });
  }

  const url = publicUrl.toString();
  const existing = body.force ? null : findRecentAudit({ url });

  if (existing !== null) {
    return Response.json(
      {
        id: existing.id,
        status: existing.status,
        deduped: true,
      },
      { status: 202 },
    );
  }

  const previous = findPreviousAudit({
    url,
    excludingId: "",
  });
  const now = new Date().toISOString();
  const audit: Audit = {
    id: crypto.randomUUID(),
    url,
    email: body.email,
    status: "queued",
    steps: auditSteps.map((step) => ({ ...step })),
    createdAt: now,
    updatedAt: now,
    findings: [],
    scores: null,
    report: null,
    previousAuditId: previous?.id ?? null,
  };

  saveAudit({ audit });
  void runAudit({ audit });

  return Response.json(
    {
      id: audit.id,
      status: audit.status,
    },
    { status: 202 },
  );
}
