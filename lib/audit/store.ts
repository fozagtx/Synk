import type {
  Audit,
  AuditComparison,
  Finding,
} from "@/lib/audit/types";

const audits = new Map<string, Audit>();

export function saveAudit({ audit }: { audit: Audit }): Audit {
  audits.set(audit.id, audit);
  return audit;
}

export function getAudit({ id }: { id: string }): Audit | null {
  return audits.get(id) ?? null;
}

export function updateAudit({
  id,
  changes,
}: {
  id: string;
  changes: Partial<Audit>;
}): Audit | null {
  const audit = getAudit({ id });

  if (audit === null) {
    return null;
  }

  const updated: Audit = {
    ...audit,
    ...changes,
    updatedAt: new Date().toISOString(),
  };
  audits.set(id, updated);
  return updated;
}

export function findRecentAudit({ url }: { url: string }): Audit | null {
  const cutoff = Date.now() - 15 * 60 * 1000;

  return (
    [...audits.values()].find((audit) => {
      return (
        audit.url === url &&
        Date.parse(audit.createdAt) >= cutoff &&
        audit.status !== "failed"
      );
    }) ?? null
  );
}

export function findPreviousAudit({
  url,
  excludingId,
}: {
  url: string;
  excludingId: string;
}): Audit | null {
  return (
    [...audits.values()]
      .filter((audit) => {
        return (
          audit.url === url &&
          audit.id !== excludingId &&
          audit.status === "done"
        );
      })
      .sort(
        (first, second) =>
          Date.parse(second.createdAt) - Date.parse(first.createdAt),
      )[0] ?? null
  );
}

function byId({ findings }: { findings: Finding[] }): Map<string, Finding> {
  return new Map(findings.map((finding) => [finding.id, finding]));
}

export function compareAudits({
  current,
  previous,
}: {
  current: Audit;
  previous: Audit;
}): AuditComparison {
  const currentFindings = byId({ findings: current.findings });
  const previousFindings = byId({ findings: previous.findings });

  return {
    fixed: [...previousFindings.entries()]
      .filter(([id]) => !currentFindings.has(id))
      .map(([, finding]) => finding),
    stillOpen: [...currentFindings.entries()]
      .filter(([id]) => previousFindings.has(id))
      .map(([, finding]) => finding),
    new: [...currentFindings.entries()]
      .filter(([id]) => !previousFindings.has(id))
      .map(([, finding]) => finding),
  };
}
