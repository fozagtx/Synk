import * as errore from "errore";

import {
  buildRiskQueries,
  enrichRiskQueriesWithBrightData,
} from "@/lib/scan/bright-data";
import type {
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
import type { ScanReport, ScanRequest } from "@/lib/types/scan";

export async function runScan({
  request,
}: {
  request: ScanRequest;
}): Promise<
  | NoManifestFilesError
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

  const findings = sortRisks({
    findings: buildFindingsFromQueries({ queries: enrichedRiskQueries, scannedAt }),
  });
  const groups = groupFindings({ findings });
  const summary = buildReportSummary({ findings, stack });
  return {
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
