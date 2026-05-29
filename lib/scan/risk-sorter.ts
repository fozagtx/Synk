import type {
  DetectedStack,
  Finding,
  FindingType,
  ReportGroups,
  ReportSummary,
  Severity,
} from "@/lib/types/scan";
import type { RiskQuery } from "@/lib/scan/bright-data";

const TYPE_SEVERITY: Record<FindingType, Severity> = {
  cve: "high",
  security_advisory: "high",
  exploit_chatter: "medium",
  vendor_deprecation: "medium",
  breaking_release: "medium",
};

const SEVERITY_SCORE: Record<Severity, number> = {
  critical: 50,
  high: 40,
  medium: 30,
  low: 20,
  info: 10,
};

export function buildFindingsFromQueries({
  queries,
  scannedAt,
}: {
  queries: RiskQuery[];
  scannedAt: string;
}): Finding[] {
  return queries.map((query) => {
    const severity = TYPE_SEVERITY[query.type];

    return {
      id: stableFindingId({ query }),
      type: query.type,
      title: titleForQuery({ query }),
      affectedDependency: query.dependency.name,
      installedVersion: query.dependency.version,
      severity,
      confidence: query.dependency.version ? "medium" : "low",
      matchLabel: query.dependency.version ? "possible_match" : "stack_level_risk",
      evidence: query.evidence,
      recommendedAction: recommendedActionForType({ query }),
      score: scoreFinding({ severity, hasVersion: Boolean(query.dependency.version) }),
      firstSeen: scannedAt,
    };
  });
}

export function sortRisks({ findings }: { findings: Finding[] }): Finding[] {
  return dedupeFindings({ findings })
    .filter((finding) => {
      return finding.matchLabel !== "not_applicable";
    })
    .sort((left, right) => {
      return right.score - left.score || left.title.localeCompare(right.title);
    });
}

export function groupFindings({ findings }: { findings: Finding[] }): ReportGroups {
  return {
    vulnerabilities: findings.filter((finding) => {
      return finding.type === "cve" || finding.type === "security_advisory";
    }),
    exploitChatter: findings.filter((finding) => {
      return finding.type === "exploit_chatter";
    }),
    deprecations: findings.filter((finding) => {
      return finding.type === "vendor_deprecation";
    }),
    breakingReleases: findings.filter((finding) => {
      return finding.type === "breaking_release";
    }),
  };
}

export function buildReportSummary({
  findings,
  stack,
}: {
  findings: Finding[];
  stack: DetectedStack;
}): ReportSummary {
  return {
    totalFindings: findings.length,
    critical: countSeverity({ findings, severity: "critical" }),
    high: countSeverity({ findings, severity: "high" }),
    medium: countSeverity({ findings, severity: "medium" }),
    low: countSeverity({ findings, severity: "low" }),
    info: countSeverity({ findings, severity: "info" }),
    topAction: topAction({ findings, stack }),
  };
}

function dedupeFindings({ findings }: { findings: Finding[] }): Finding[] {
  const byId: Record<string, Finding> = findings.reduce(
    (accumulator, finding) => {
      if (accumulator[finding.id]) {
        return accumulator;
      }

      return {
        ...accumulator,
        [finding.id]: finding,
      };
    },
    {} as Record<string, Finding>
  );

  return Object.values(byId);
}

function scoreFinding({
  severity,
  hasVersion,
}: {
  severity: Severity;
  hasVersion: boolean;
}): number {
  const versionBoost = hasVersion ? 8 : 0;
  return SEVERITY_SCORE[severity] + versionBoost;
}

function countSeverity({
  findings,
  severity,
}: {
  findings: Finding[];
  severity: Severity;
}): number {
  return findings.filter((finding) => {
    return finding.severity === severity;
  }).length;
}

function topAction({
  findings,
  stack,
}: {
  findings: Finding[];
  stack: DetectedStack;
}): string {
  const firstFinding = findings[0];

  if (!firstFinding) {
    return `No relevant external risks were matched against ${stack.dependencies.length} detected dependencies. This does not prove the repo is safe.`;
  }

  return firstFinding.recommendedAction;
}

function stableFindingId({ query }: { query: RiskQuery }): string {
  return [
    query.type,
    query.dependency.ecosystem,
    query.dependency.name,
    query.dependency.version || "unknown",
  ]
    .join(":")
    .toLowerCase()
    .replace(/[^a-z0-9:._-]+/g, "-");
}

function titleForQuery({ query }: { query: RiskQuery }): string {
  if (query.type === "cve") {
    return `Check CVEs affecting ${dependencyLabel({ query })}`;
  }

  if (query.type === "security_advisory") {
    return `Review advisories for ${dependencyLabel({ query })}`;
  }

  if (query.type === "exploit_chatter") {
    return `Watch exploit chatter for ${dependencyLabel({ query })}`;
  }

  if (query.type === "vendor_deprecation") {
    return `Check deprecations for ${dependencyLabel({ query })}`;
  }

  return `Check breaking releases for ${dependencyLabel({ query })}`;
}

function recommendedActionForType({ query }: { query: RiskQuery }): string {
  if (query.type === "cve" || query.type === "security_advisory") {
    return `Open the evidence links and verify whether ${dependencyLabel({
      query,
    })} is affected before upgrading or pinning a patched version.`;
  }

  if (query.type === "exploit_chatter") {
    return `Review recent public chatter for ${query.dependency.name}; escalate only if evidence mentions active exploitation against your version or deployment pattern.`;
  }

  if (query.type === "vendor_deprecation") {
    return `Check the vendor migration notes for ${query.dependency.name} and schedule work before support or API compatibility disappears.`;
  }

  return `Read the release notes for ${query.dependency.name}, compare breaking changes with this repo, and create a migration task if an impacted API is used.`;
}

function dependencyLabel({ query }: { query: RiskQuery }): string {
  if (!query.dependency.version) {
    return query.dependency.name;
  }

  return `${query.dependency.name}@${query.dependency.version}`;
}
