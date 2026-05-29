import * as errore from "errore";
import dedent from "string-dedent";

import { env } from "@/lib/env";
import type { ScanMemoryStatus, ScanReport } from "@/lib/types/scan";

class CogneeConfigurationError extends errore.createTaggedError({
  name: "CogneeConfigurationError",
  message: "Cognee memory is not configured: $missing",
}) {}

class CogneeFetchError extends errore.createTaggedError({
  name: "CogneeFetchError",
  message: "$operation failed for $url",
}) {}

class CogneeResponseError extends errore.createTaggedError({
  name: "CogneeResponseError",
  message: "$operation returned HTTP $status for $url: $bodySummary",
}) {}

type CogneeError =
  | CogneeConfigurationError
  | CogneeFetchError
  | CogneeResponseError;

const COGNEE_REMEMBER_TIMEOUT_MS: number = 30_000;
const COGNEE_WAKE_ATTEMPTS: number = 6;
const COGNEE_WAKE_TIMEOUT_MS: number = 10_000;
const COGNEE_WAKE_DELAY_MS: number = 2_000;
const COGNEE_RESPONSE_BODY_LIMIT: number = 600;

interface CogneeConfig {
  apiKey: string | null;
  datasetName: string;
  serviceUrl: string;
}

interface CogneeRememberResponse {
  entryId: string | null;
}

interface CogneeQAEntry {
  type: "qa";
  question: string;
  answer: string;
  context: string;
}

interface CogneeRememberEntryRequest {
  entry: CogneeQAEntry;
  dataset_name: string;
  session_id: string;
}

export async function rememberScanReport({
  report,
}: {
  report: ScanReport;
}): Promise<ScanMemoryStatus> {
  const config = getCogneeConfig();

  if (config instanceof Error) {
    return {
      provider: "cognee",
      status: "not_configured",
      missingEnv: getMissingCogneeEnvNames(),
    };
  }

  const result = await postCogneeRememberEntry({
    config,
    report,
  });

  if (errore.isError(result)) {
    return {
      provider: "cognee",
      status: "failed",
      message: result.message,
    };
  }

  return {
    provider: "cognee",
    status: "remembered",
    datasetName: config.datasetName,
    entryId: result.entryId,
  };
}

function getCogneeConfig(): CogneeConfig | CogneeConfigurationError {
  const serviceUrl: string | null = env.cogneeServiceUrl;
  const missingEnv: string[] = getMissingCogneeEnvNames();

  if (missingEnv.length > 0) {
    return new CogneeConfigurationError({
      missing: missingEnv.join(", "),
    });
  }

  if (serviceUrl === null) {
    return new CogneeConfigurationError({
      missing: "COGNEE_SERVICE_URL",
    });
  }

  return {
    apiKey: env.cogneeApiKey,
    datasetName: env.cogneeDatasetName,
    serviceUrl,
  };
}

function getMissingCogneeEnvNames(): string[] {
  if (env.cogneeServiceUrl === null) {
    return ["COGNEE_SERVICE_URL"];
  }

  return [];
}

async function postCogneeRememberEntry({
  config,
  report,
}: {
  config: CogneeConfig;
  report: ScanReport;
}): Promise<CogneeError | CogneeRememberResponse> {
  const url: string = new URL(
    "/api/v1/remember/entry",
    config.serviceUrl
  ).toString();
  const body: CogneeRememberEntryRequest = {
    dataset_name: config.datasetName,
    entry: buildQAEntry({ report }),
    session_id: report.scanId,
  };
  const wakeResult = await waitForCogneeService({
    attempt: 1,
    config,
  });

  if (errore.isError(wakeResult)) {
    console.warn("Cognee memory service wake failed", {
      error: wakeResult.message,
      scanId: report.scanId,
    });

    return wakeResult;
  }

  const firstAttempt = await postCogneeJsonOnce({
    body,
    config,
    operation: "Cognee remember scan report",
    url,
  });

  if (!errore.isError(firstAttempt)) {
    return firstAttempt;
  }

  console.warn("Cognee memory write failed", {
    attempt: 1,
    error: firstAttempt.message,
    scanId: report.scanId,
  });

  const secondAttempt = await postCogneeJsonOnce({
    body,
    config,
    operation: "Cognee remember scan report",
    url,
  });

  if (!errore.isError(secondAttempt)) {
    return secondAttempt;
  }

  console.warn("Cognee memory write failed", {
    attempt: 2,
    error: secondAttempt.message,
    scanId: report.scanId,
  });

  return secondAttempt;
}

async function postCogneeJsonOnce({
  body,
  config,
  operation,
  url,
}: {
  body: CogneeRememberEntryRequest;
  config: CogneeConfig;
  operation: string;
  url: string;
}): Promise<CogneeFetchError | CogneeResponseError | CogneeRememberResponse> {
  const response = await requestCognee({
    body: JSON.stringify(body),
    config,
    method: "POST",
    operation,
    timeoutMs: COGNEE_REMEMBER_TIMEOUT_MS,
    url,
  });

  if (errore.isError(response)) {
    return response;
  }

  const bodyText = await readCogneeResponseText({
    operation,
    response,
    url,
  });

  if (errore.isError(bodyText)) {
    return bodyText;
  }

  if (!response.ok) {
    return new CogneeResponseError({
      bodySummary: summarizeCogneeResponseBody({ bodyText }),
      operation,
      status: response.status,
      url,
    });
  }

  return {
    entryId: parseRememberEntryId({ bodyText }),
  };
}

async function waitForCogneeService({
  attempt,
  config,
}: {
  attempt: number;
  config: CogneeConfig;
}): Promise<CogneeError | null> {
  const url: string = new URL("/", config.serviceUrl).toString();
  const operation: string = "Cognee memory service wake";
  const response = await requestCognee({
    body: null,
    config,
    method: "GET",
    operation,
    timeoutMs: COGNEE_WAKE_TIMEOUT_MS,
    url,
  });

  if (errore.isError(response)) {
    if (attempt >= COGNEE_WAKE_ATTEMPTS) {
      return response;
    }

    await delay({ milliseconds: COGNEE_WAKE_DELAY_MS });

    return waitForCogneeService({
      attempt: attempt + 1,
      config,
    });
  }

  if (response.ok) {
    return null;
  }

  const bodyText = await readCogneeResponseText({
    operation,
    response,
    url,
  });

  if (errore.isError(bodyText)) {
    return bodyText;
  }

  const responseError = new CogneeResponseError({
    bodySummary: summarizeCogneeResponseBody({ bodyText }),
    operation,
    status: response.status,
    url,
  });

  if (attempt >= COGNEE_WAKE_ATTEMPTS) {
    return responseError;
  }

  await delay({ milliseconds: COGNEE_WAKE_DELAY_MS });

  return waitForCogneeService({
    attempt: attempt + 1,
    config,
  });
}

async function requestCognee({
  body,
  config,
  method,
  operation,
  timeoutMs,
  url,
}: {
  body: string | null;
  config: CogneeConfig;
  method: "GET" | "POST";
  operation: string;
  timeoutMs: number;
  url: string;
}): Promise<CogneeFetchError | Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(
      new Error(`${operation} timed out after ${timeoutMs.toString()}ms`)
    );
  }, timeoutMs);
  const response = await errore.tryAsync({
    try: () => {
      return fetch(url, {
        method,
        headers: buildCogneeHeaders({ config }),
        body,
        signal: controller.signal,
      });
    },
    catch: (cause) => {
      return new CogneeFetchError({
        operation,
        url,
        cause,
      });
    },
  });

  clearTimeout(timeout);

  return response;
}

async function readCogneeResponseText({
  operation,
  response,
  url,
}: {
  operation: string;
  response: Response;
  url: string;
}): Promise<CogneeFetchError | string> {
  return errore.tryAsync({
    try: () => {
      return response.text();
    },
    catch: (cause) => {
      return new CogneeFetchError({
        operation,
        url,
        cause,
      });
    },
  });
}

async function delay({
  milliseconds,
}: {
  milliseconds: number;
}): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function summarizeCogneeResponseBody({ bodyText }: { bodyText: string }): string {
  const compactBody: string = bodyText.replace(/\s+/g, " ").trim();

  if (compactBody.length === 0) {
    return "empty response body";
  }

  if (/<!doctype html|<html/i.test(compactBody)) {
    return `HTML error page from upstream service (${bodyText.length.toString()} chars)`;
  }

  if (compactBody.length > COGNEE_RESPONSE_BODY_LIMIT) {
    return `${compactBody.slice(0, COGNEE_RESPONSE_BODY_LIMIT)}... (${bodyText.length.toString()} chars total)`;
  }

  return compactBody;
}

function buildCogneeHeaders({ config }: { config: CogneeConfig }): Headers {
  const headers = new Headers({
    "content-type": "application/json",
  });

  if (config.apiKey) {
    headers.set("X-Api-Key", config.apiKey);
  }

  return headers;
}

function parseRememberEntryId({ bodyText }: { bodyText: string }): string | null {
  if (bodyText.trim().length === 0) {
    return null;
  }

  const parsed = errore.try({
    try: () => {
      return JSON.parse(bodyText) as unknown;
    },
    catch: () => {
      return null;
    },
  });

  if (parsed === null || errore.isError(parsed) || !isRecord(parsed)) {
    return null;
  }

  const entryId = parsed.entry_id;

  if (typeof entryId === "string") {
    return entryId;
  }

  return null;
}

function buildQAEntry({ report }: { report: ScanReport }): CogneeQAEntry {
  return {
    type: "qa",
    question: `What external change risks did Synk find for ${report.repo.owner}/${report.repo.repo}?`,
    answer: buildReportMemorySummary({ report }),
    context: buildReportMemoryContext({ report }),
  };
}

function buildReportMemorySummary({ report }: { report: ScanReport }): string {
  return dedent`
    Synk scan ${report.scanId} checked ${report.repo.owner}/${report.repo.repo}.

    Total findings: ${report.summary.totalFindings}
    Critical: ${report.summary.critical}
    High: ${report.summary.high}
    Medium: ${report.summary.medium}
    Low: ${report.summary.low}
    Info: ${report.summary.info}

    Top action: ${report.summary.topAction}
    Dependencies checked: ${report.stack.dependencies.length}
    Frameworks: ${report.stack.frameworks.join(", ") || "none detected"}
    Vendors: ${report.stack.vendors.join(", ") || "none detected"}
  `;
}

function buildReportMemoryContext({ report }: { report: ScanReport }): string {
  return dedent`
    Repo URL: ${report.repo.url}
    Branch: ${report.repo.branch}
    Scan time: ${report.scannedAt}

    Manifests:
    ${report.stack.manifests.map((manifest) => {
      return `- ${manifest.path} (${manifest.kind})`;
    }).join("\n")}

    Highest priority findings:
    ${[
      ...report.groups.vulnerabilities,
      ...report.groups.exploitChatter,
      ...report.groups.deprecations,
      ...report.groups.breakingReleases,
    ]
      .slice(0, 8)
      .map((finding) => {
        return `- ${finding.severity}: ${finding.title} -> ${finding.recommendedAction}`;
      })
      .join("\n")}
  `;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
