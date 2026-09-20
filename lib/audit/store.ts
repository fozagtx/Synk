import type { Audit } from "@/lib/audit/types";

const audits = new Map<string, Audit>();

export function saveAudit({ audit }: { audit: Audit }): Audit {
  audits.set(audit.id, audit);
  return audit;
}

export function getAudit({ id }: { id: string }): Audit | null {
  return audits.get(id) ?? null;
}

export function updateAudit({ id, changes }: { id: string; changes: Partial<Audit> }): Audit | null {
  const audit = getAudit({ id });
  if (audit === null) return null;
  const updated: Audit = { ...audit, ...changes, updatedAt: new Date().toISOString() };
  audits.set(id, updated);
  return updated;
}

export function findRecentAudit({ url }: { url: string }): Audit | null {
  const cutoff = Date.now() - 15 * 60 * 1000;
  return [...audits.values()].find((audit) => audit.url === url && Date.parse(audit.createdAt) >= cutoff) ?? null;
}

export function findPreviousAudit({ url, excludingId }: { url: string; excludingId: string }): Audit | null {
  return [...audits.values()]
    .filter((audit) => audit.url === url && audit.id !== excludingId && audit.status === "done")
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0] ?? null;
}
