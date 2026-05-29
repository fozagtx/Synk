import * as errore from "errore";

import { normalizeFindingsWithAI } from "@/lib/scan/ai-normalizer";
import {
  buildRiskQueries,
  enrichRiskQueriesWithBrightData,
} from "@/lib/scan/bright-data";
import type {
  AIProviderCallError,
  AIProviderConfigurationError,
  AIProviderResponseShapeError,
  NoManifestFilesError,
  RemoteConfigurationError,
  RemoteFetchError,
  RemoteJsonShapeError,
  RemoteResponseError,
  UnsupportedGithubUrlError,
} from "@/lib/scan/errors";
import { fetchAvailableManifests } from "@/lib/scan/github";
import {
  buildFindingsFromQueries,
  buildReportSummary,
  groupFindings,
  sortRisks,
} from "@/lib/scan/risk-sorter";
import { extractStack } from "@/lib/scan/stack-extractor";
import type { AgentTraceStep, ScanReport, ScanRequest } from "@/lib/types/scan";

export async function runScan({
  request,
}: {
  request: ScanRequest;
}): Promise<
  | NoManifestFilesError
  | AIProviderCallError
  | AIProviderConfigurationError
  | AIProviderResponseShapeError
  | RemoteConfigurationError
  | RemoteFetchError
  | RemoteJsonShapeError
  | RemoteResponseError
  | UnsupportedGithubUrlError
  | ScanReport
> {
  const scannedAt = new Date().toISOString();
  const manifestsResult = await fetchAvailableManifests({
    githubUrl: request.githubUrl,
  });

  if (errore.isError(manifestsResult)) {
    return manifestsResult;
  }

  const stack = extractStack({
    repo: manifestsResult.repo,
    manifests: manifestsResult.manifests,
  });
  const riskQueries = buildRiskQueries({ stack, scannedAt });
  const enrichedRiskQueries = await enrichRiskQueriesWithBrightData({
    queries: riskQueries,
    scannedAt,
  });

  if (errore.isError(enrichedRiskQueries)) {
    return enrichedRiskQueries;
  }

  const normalizedFindings = await normalizeFindingsWithAI({
    findings: buildFindingsFromQueries({ queries: enrichedRiskQueries, scannedAt }),
    scannedAt,
    stack,
  });

  if (errore.isError(normalizedFindings)) {
    return normalizedFindings;
  }

  const findings = sortRisks({
    findings: normalizedFindings,
  });
  const groups = groupFindings({ findings });
  const summary = buildReportSummary({ findings, stack });
  const agentTrace = buildAgentTrace({
    brightDataEvidenceCount: enrichedRiskQueries.reduce((count, query) => {
      return count + query.evidence.length;
    }, 0),
    findingCount: findings.length,
    manifestCount: manifestsResult.manifests.length,
    riskQueryCount: riskQueries.length,
  });

  return {
    agentTrace,
    scanId: createScanId({
      repoUrl: manifestsResult.repo.url,
      scannedAt,
    }),
    scannedAt,
    repo: manifestsResult.repo,
    stack,
    summary,
    groups,
  };
}

function createScanId({
  repoUrl,
  scannedAt,
}: {
  repoUrl: string;
  scannedAt: string;
}): string {
  return `${repoUrl}:${scannedAt}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
      .slice(0, 80);
}

function buildAgentTrace({
  brightDataEvidenceCount,
  findingCount,
  manifestCount,
  riskQueryCount,
}: {
  brightDataEvidenceCount: number;
  findingCount: number;
  manifestCount: number;
  riskQueryCount: number;
}): AgentTraceStep[] {
  return [
    {
      detail: `Read ${manifestCount} public dependency manifest${manifestCount === 1 ? "" : "s"} from GitHub.`,
      name: "GitHub manifest reader",
      status: "completed",
    },
    {
      detail: `Built ${riskQueryCount} CVE, advisory, exploit, deprecation, and release checks with ${brightDataEvidenceCount} evidence links.`,
      name: "Bright Data evidence collector",
      status: "completed",
    },
    {
      detail: `Normalized ${findingCount} stack-matched finding${findingCount === 1 ? "" : "s"} with AI/ML API structured output.`,
      name: "AI/ML API normalizer",
      status: "completed",
    },
  ];
}
