import * as errore from "errore";

import { env } from "@/lib/env";
import {
  RemoteConfigurationError,
  RemoteFetchError,
  RemoteResponseError,
} from "@/lib/scan/errors";
import type {
  DetectedDependency,
  DetectedStack,
  Evidence,
  FindingType,
} from "@/lib/types/scan";

export interface RiskQuery {
  id: string;
  type: FindingType;
  dependency: DetectedDependency;
  query: string;
  evidence: Evidence[];
}

interface BrightDataRequestPayload {
  zone: string;
  url: string;
  format: "raw";
}

interface BrightDataEvidenceResult {
  queryId: string;
  evidence: Evidence[];
}

const BRIGHT_DATA_REQUEST_URL = "https://api.brightdata.com/request";
const BRIGHT_DATA_QUERY_LIMIT = 4;
const BRIGHT_DATA_RESULT_LIMIT = 2;
const BRIGHT_DATA_ATTEMPTS = 3;

const VENDOR_EVIDENCE_URLS: Record<string, string> = {
  "Next.js": "https://github.com/vercel/next.js/security/advisories",
  React: "https://react.dev/blog",
  Vue: "https://blog.vuejs.org/",
  Nuxt: "https://nuxt.com/blog",
  Svelte: "https://svelte.dev/blog",
  SvelteKit: "https://svelte.dev/blog",
  Express: "https://expressjs.com/en/advanced/security-updates.html",
  Fastify: "https://github.com/fastify/fastify/security/advisories",
  Django: "https://www.djangoproject.com/weblog/",
  Flask: "https://flask.palletsprojects.com/en/stable/changes/",
  Rails: "https://rubyonrails.org/category/releases",
  Laravel: "https://laravel-news.com/category/releases",
  Spring: "https://spring.io/security",
  "Spring Boot": "https://spring.io/security",
  Terraform: "https://developer.hashicorp.com/terraform/language/upgrade-guides",
};

export async function enrichRiskQueriesWithBrightData({
  queries,
  scannedAt,
}: {
  queries: RiskQuery[];
  scannedAt: string;
}): Promise<
  RemoteConfigurationError | RemoteFetchError | RemoteResponseError | RiskQuery[]
> {
  const serpApiKey: string | null = env.brightDataSerpApiKey;
  const webUnlockerApiKey: string | null = env.brightDataWebUnlockerApiKey;

  if (!serpApiKey || !webUnlockerApiKey) {
    return queries;
  }

  const credentialError = validateBrightDataCredentials({
    serpApiKey,
    webUnlockerApiKey,
  });

  if (credentialError) {
    return credentialError;
  }

  const liveQueries: RiskQuery[] = queries.slice(0, BRIGHT_DATA_QUERY_LIMIT);
  const evidenceResults = await Promise.all(
    liveQueries.map((query) => {
      return fetchBrightDataEvidence({
        query,
        scannedAt,
        serpApiKey,
        webUnlockerApiKey,
      });
    })
  );
  const firstError:
    | BrightDataEvidenceResult
    | RemoteFetchError
    | RemoteResponseError
    | undefined = evidenceResults.find((result) => {
    return result instanceof Error;
  });

  if (firstError instanceof Error) {
    return firstError;
  }

  const successfulEvidenceResults: BrightDataEvidenceResult[] =
    evidenceResults.filter(isBrightDataEvidenceResult);
  const evidenceByQueryId: Record<string, Evidence[]> = successfulEvidenceResults.reduce(
    (accumulator, result) => {
      return {
        ...accumulator,
        [result.queryId]: result.evidence,
      };
    },
    {} as Record<string, Evidence[]>
  );

  return queries.map((query) => {
    const liveEvidence: Evidence[] = evidenceByQueryId[query.id] || [];

    if (liveEvidence.length === 0) {
      return query;
    }

    return {
      ...query,
      evidence: liveEvidence.concat(query.evidence),
    };
  });
}

function validateBrightDataCredentials({
  serpApiKey,
  webUnlockerApiKey,
}: {
  serpApiKey: string;
  webUnlockerApiKey: string;
}): RemoteConfigurationError | null {
  const invalidNames: string[] = [
    isAsciiCredential({ value: serpApiKey }) ? null : "SERP_API_KEY",
    isAsciiCredential({ value: webUnlockerApiKey })
      ? null
      : "WEBUNLOCKER_API_KEY",
  ].filter(isString);

  if (invalidNames.length === 0) {
    return null;
  }

  return new RemoteConfigurationError({
    provider: "Bright Data",
    reason: `${invalidNames.join(", ")} must contain only ASCII characters`,
  });
}

function isAsciiCredential({ value }: { value: string }): boolean {
  return /^[\x20-\x7E]+$/.test(value);
}

export function buildRiskQueries({
  stack,
  scannedAt,
}: {
  stack: DetectedStack;
  scannedAt: string;
}): RiskQuery[] {
  const dependencyTargets: DetectedDependency[] = stack.dependencies.slice(0, 8);
  const frameworkTargets: DetectedDependency[] = stack.frameworks
    .map((framework) => {
      return stack.dependencies.find((dependency) => {
        return dependencyMatchesFramework({ dependency, framework });
      });
    })
    .filter(isDetectedDependency)
    .slice(0, 4);

  const cveQueries: RiskQuery[] = dependencyTargets.map((dependency) => {
    return buildDependencyRiskQuery({
      dependency,
      type: "cve",
      scannedAt,
    });
  });

  const advisoryQueries: RiskQuery[] = dependencyTargets.slice(0, 5).map((dependency) => {
    return buildDependencyRiskQuery({
      dependency,
      type: "security_advisory",
      scannedAt,
    });
  });

  const exploitQueries: RiskQuery[] = dependencyTargets.slice(0, 5).map((dependency) => {
    return buildDependencyRiskQuery({
      dependency,
      type: "exploit_chatter",
      scannedAt,
    });
  });

  const deprecationQueries: RiskQuery[] = frameworkTargets.map((dependency) => {
    return buildDependencyRiskQuery({
      dependency,
      type: "vendor_deprecation",
      scannedAt,
    });
  });

  const breakingReleaseQueries: RiskQuery[] = frameworkTargets.map((dependency) => {
    return buildDependencyRiskQuery({
      dependency,
      type: "breaking_release",
      scannedAt,
    });
  });

  return [
    ...cveQueries,
    ...advisoryQueries,
    ...exploitQueries,
    ...deprecationQueries,
    ...breakingReleaseQueries,
  ];
}

function buildDependencyRiskQuery({
  dependency,
  type,
  scannedAt,
}: {
  dependency: DetectedDependency;
  type: FindingType;
  scannedAt: string;
}): RiskQuery {
  const query = [
    dependency.name,
    dependency.version || "",
    querySuffixForType({ type }),
  ]
    .filter((part) => {
      return part.length > 0;
    })
    .join(" ");

  return {
    id: [type, dependency.ecosystem, dependency.name, dependency.version || "unknown"]
      .join(":")
      .toLowerCase(),
    type,
    dependency,
    query,
    evidence: buildEvidenceForQuery({ dependency, type, query, scannedAt }),
  };
}

function buildEvidenceForQuery({
  dependency,
  type,
  query,
  scannedAt,
}: {
  dependency: DetectedDependency;
  type: FindingType;
  query: string;
  scannedAt: string;
}): Evidence[] {
  if (type === "cve") {
    return [
      {
        sourceName: "NVD CVE Search",
        sourceType: "cve_database",
        url: buildUrl({
          baseUrl: "https://nvd.nist.gov/vuln/search/results",
          searchParam: "query",
          value: query,
        }),
        observedAt: scannedAt,
        summary: `CVE search prepared for ${dependency.name} ${dependency.version || ""}`.trim(),
      },
    ];
  }

  if (type === "security_advisory") {
    return [
      {
        sourceName: "GitHub Security Advisories",
        sourceType: "official_advisory",
        url: buildUrl({
          baseUrl: "https://github.com/advisories",
          searchParam: "query",
          value: dependency.name,
        }),
        observedAt: scannedAt,
        summary: `Advisory search prepared for ${dependency.name}`,
      },
    ];
  }

  if (type === "exploit_chatter") {
    return [
      {
        sourceName: "BleepingComputer Search",
        sourceType: "news",
        url: buildUrl({
          baseUrl: "https://www.bleepingcomputer.com/search/",
          searchParam: "q",
          value: query,
        }),
        observedAt: scannedAt,
        summary: `Exploit and incident chatter search prepared for ${dependency.name}`,
      },
      {
        sourceName: "X Search",
        sourceType: "social_chatter",
        url: buildUrl({
          baseUrl: "https://x.com/search",
          searchParam: "q",
          value: query,
        }),
        observedAt: scannedAt,
        summary: `Social exploit chatter search prepared for ${dependency.name}`,
      },
    ];
  }

  return [
    {
      sourceName: "Vendor Release Notes",
      sourceType: "vendor_changelog",
      url: vendorEvidenceUrl({ dependency }),
      observedAt: scannedAt,
      summary: `Release and deprecation search prepared for ${dependency.name}`,
    },
  ];
}

function isBrightDataEvidenceResult(
  value: BrightDataEvidenceResult | RemoteFetchError | RemoteResponseError
): value is BrightDataEvidenceResult {
  return !(value instanceof Error);
}

function isEvidence(
  value: Evidence | RemoteFetchError | RemoteResponseError
): value is Evidence {
  return !(value instanceof Error);
}

async function fetchBrightDataEvidence({
  query,
  scannedAt,
  serpApiKey,
  webUnlockerApiKey,
}: {
  query: RiskQuery;
  scannedAt: string;
  serpApiKey: string;
  webUnlockerApiKey: string;
}): Promise<BrightDataEvidenceResult | RemoteFetchError | RemoteResponseError> {
  const searchUrl: string = createGoogleSearchUrl({ query: query.query });
  const serpRaw = await fetchBrightDataRawWithRetry({
    attempt: 1,
    operation: "Bright Data SERP search",
    payload: {
      zone: env.brightDataSerpZone,
      url: searchUrl,
      format: "raw",
    },
    apiKey: serpApiKey,
  });

  if (serpRaw instanceof Error) {
    return serpRaw;
  }

  const resultUrls: string[] = extractResultUrls({
    limit: BRIGHT_DATA_RESULT_LIMIT,
    raw: serpRaw,
  });

  if (resultUrls.length === 0) {
    return {
      queryId: query.id,
      evidence: [
        {
          sourceName: "Bright Data SERP",
          sourceType: "search_query",
          url: searchUrl,
          observedAt: scannedAt,
          summary: `Bright Data returned raw SERP content for "${query.query}", but no external result URL was extracted.`,
        },
      ],
    };
  }

  const scrapedEvidence = await Promise.all(
    resultUrls.map((url) => {
      return scrapeBrightDataResultUrl({
        query,
        scannedAt,
        url,
        webUnlockerApiKey,
      });
    })
  );
  const firstError:
    | Evidence
    | RemoteFetchError
    | RemoteResponseError
    | undefined = scrapedEvidence.find((result) => {
    return result instanceof Error;
  });

  if (firstError instanceof Error) {
    return firstError;
  }

  const successfulEvidence: Evidence[] = scrapedEvidence.filter(isEvidence);

  return {
    queryId: query.id,
    evidence: successfulEvidence,
  };
}

async function scrapeBrightDataResultUrl({
  query,
  scannedAt,
  url,
  webUnlockerApiKey,
}: {
  query: RiskQuery;
  scannedAt: string;
  url: string;
  webUnlockerApiKey: string;
}): Promise<Evidence | RemoteFetchError | RemoteResponseError> {
  const raw = await fetchBrightDataRawWithRetry({
    attempt: 1,
    operation: "Bright Data page extraction",
    payload: {
      zone: env.brightDataWebUnlockerZone,
      url,
      format: "raw",
    },
    apiKey: webUnlockerApiKey,
  });

  if (raw instanceof Error) {
    return raw;
  }

  return {
    sourceName: sourceNameForFindingType({ type: query.type }),
    sourceType: sourceTypeForFindingType({ type: query.type }),
    url,
    observedAt: scannedAt,
    summary: summarizeRawEvidence({
      raw,
      query: query.query,
    }),
  };
}

async function fetchBrightDataRawWithRetry({
  apiKey,
  attempt,
  operation,
  payload,
}: {
  apiKey: string;
  attempt: number;
  operation: string;
  payload: BrightDataRequestPayload;
}): Promise<RemoteFetchError | RemoteResponseError | string> {
  const result = await fetchBrightDataRaw({
    apiKey,
    operation,
    payload,
  });

  if (!(result instanceof Error)) {
    return result;
  }

  if (attempt >= BRIGHT_DATA_ATTEMPTS) {
    return result;
  }

  console.warn("bright_data_request_retry", {
    attempt,
    operation,
    url: payload.url,
    zone: payload.zone,
    error: result.message,
  });

  await delay({
    ms: brightDataRetryDelay({ attempt }),
  });

  return fetchBrightDataRawWithRetry({
    apiKey,
    attempt: attempt + 1,
    operation,
    payload,
  });
}

async function fetchBrightDataRaw({
  apiKey,
  operation,
  payload,
}: {
  apiKey: string;
  operation: string;
  payload: BrightDataRequestPayload;
}): Promise<RemoteFetchError | RemoteResponseError | string> {
  const response = await fetch(BRIGHT_DATA_REQUEST_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  }).catch((cause: unknown) => {
    return new RemoteFetchError({
      operation,
      url: BRIGHT_DATA_REQUEST_URL,
      cause,
    });
  });

  if (response instanceof Error) {
    return response;
  }

  const body = await response.text().catch((cause: unknown) => {
    return new RemoteFetchError({
      operation,
      url: payload.url,
      cause,
    });
  });

  if (body instanceof Error) {
    return body;
  }

  if (!response.ok) {
    return new RemoteResponseError({
      operation,
      status: response.status,
      url: BRIGHT_DATA_REQUEST_URL,
      body: brightDataErrorBody({
        body,
        operation,
        status: response.status,
      }),
    });
  }

  return body;
}

function brightDataErrorBody({
  body,
  operation,
  status,
}: {
  body: string;
  operation: string;
  status: number;
}): string {
  const compactBody: string = body.slice(0, 800);

  if (
    status === 401 &&
    compactBody.toLowerCase().includes("auth method is not supported")
  ) {
    return `${compactBody}. Use the Bright Data API key for this product in ${brightDataEnvNameFromOperation({ operation })}; proxy credentials, webhook secrets, and zone ids are rejected by /request.`;
  }

  return compactBody;
}

function brightDataEnvNameFromOperation({
  operation,
}: {
  operation: string;
}): string {
  if (operation.includes("Web Unlocker")) {
    return "WEBUNLOCKER_API_KEY";
  }

  return "SERP_API_KEY";
}

function createGoogleSearchUrl({ query }: { query: string }): string {
  const url = new URL("https://www.google.com/search");
  url.searchParams.set("q", query);
  return url.toString();
}

function extractResultUrls({
  limit,
  raw,
}: {
  limit: number;
  raw: string;
}): string[] {
  const rawUrls: string[] = extractRawResultCandidates({ raw });
  const normalizedUrls: string[] = rawUrls
    .map((url) => {
      return normalizeResultUrl({ url });
    })
    .filter(isString)
    .filter((url) => {
      return isExternalResultUrl({ url });
    });

  return dedupeStrings({ values: normalizedUrls }).slice(0, limit);
}

function extractRawResultCandidates({ raw }: { raw: string }): string[] {
  const decodedRaw: string = decodeHtmlEntities({ value: raw });
  const hrefMatches: string[] = Array.from(
    decodedRaw.matchAll(/\bhref=["']([^"']+)["']/g)
  ).map((match) => {
    return match[1] || "";
  });
  const urlMatches: RegExpMatchArray | null = decodedRaw.match(
    /https?:\/\/[^\s"'<>)]*/g
  );
  const absoluteUrls: string[] = urlMatches ? Array.from(urlMatches) : [];

  return hrefMatches.concat(absoluteUrls).filter((value) => {
    return value.length > 0;
  });
}

function normalizeResultUrl({ url }: { url: string }): string | null {
  const trimmedUrl: string = decodeHtmlEntities({ value: url }).replace(
    /[\\.,;:\]]+$/g,
    ""
  );
  const parsedUrl = safeUrl({
    url: isRelativeGoogleResultUrl({ url: trimmedUrl })
      ? new URL(trimmedUrl, "https://www.google.com").toString()
      : trimmedUrl,
  });

  if (parsedUrl instanceof Error) {
    return null;
  }

  const nestedUrl: string | null =
    parsedUrl.searchParams.get("q") || parsedUrl.searchParams.get("url");

  if (!nestedUrl) {
    return parsedUrl.toString();
  }

  const decodedNestedUrl = safeDecodeUriComponent({ value: nestedUrl });
  const nestedParsedUrl = safeUrl({
    url: decodedNestedUrl instanceof Error ? nestedUrl : decodedNestedUrl,
  });

  if (nestedParsedUrl instanceof Error) {
    return parsedUrl.toString();
  }

  return nestedParsedUrl.toString();
}

function decodeHtmlEntities({ value }: { value: string }): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("\\u0026", "&")
    .replaceAll("\\u003d", "=")
    .replaceAll("\\u003f", "?")
    .replaceAll("\\u002f", "/");
}

function safeDecodeUriComponent({
  value,
}: {
  value: string;
}): URIError | string {
  const decodedValue = errore.try({
    try: () => {
      return decodeURIComponent(value);
    },
    catch: (cause) => {
      return new URIError("URL component could not be decoded", { cause });
    },
  });

  return decodedValue;
}

function isRelativeGoogleResultUrl({ url }: { url: string }): boolean {
  return url.startsWith("/url?") || url.startsWith("/interstitial?");
}

function safeUrl({ url }: { url: string }): TypeError | URL {
  const parsedUrl = errore.try({
    try: () => {
      return new URL(url);
    },
    catch: (cause) => {
      return new TypeError("URL could not be parsed", { cause });
    },
  });

  return parsedUrl;
}

function isExternalResultUrl({ url }: { url: string }): boolean {
  const parsedUrl = safeUrl({ url });

  if (parsedUrl instanceof Error) {
    return false;
  }

  const hostname: string = parsedUrl.hostname.toLowerCase();

  if (
    hostname.startsWith("google.") ||
    hostname.includes(".google.") ||
    hostname.endsWith(".gstatic.com") ||
    hostname === "gstatic.com" ||
    hostname.endsWith(".googleusercontent.com") ||
    hostname === "googleusercontent.com" ||
    hostname === "schema.org"
  ) {
    return false;
  }

  if (parsedUrl.pathname.startsWith("/websearch/answer/181196")) {
    return false;
  }

  return parsedUrl.protocol === "https:" || parsedUrl.protocol === "http:";
}

function sourceNameForFindingType({ type }: { type: FindingType }): string {
  if (type === "cve") {
    return "Live CVE source";
  }

  if (type === "security_advisory") {
    return "Live advisory source";
  }

  if (type === "exploit_chatter") {
    return "Live exploit source";
  }

  if (type === "vendor_deprecation") {
    return "Live deprecation source";
  }

  return "Live release source";
}

function sourceTypeForFindingType({
  type,
}: {
  type: FindingType;
}): Evidence["sourceType"] {
  if (type === "cve") {
    return "cve_database";
  }

  if (type === "security_advisory") {
    return "official_advisory";
  }

  if (type === "exploit_chatter") {
    return "news";
  }

  return "vendor_changelog";
}

function summarizeRawEvidence({
  query,
  raw,
}: {
  query: string;
  raw: string;
}): string {
  const compactText: string = raw
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);

  if (compactText.length === 0) {
    return `Bright Data unlocked a candidate evidence page for "${query}".`;
  }

  return compactText;
}

function dedupeStrings({ values }: { values: string[] }): string[] {
  return values.reduce((accumulator, value) => {
    if (accumulator.includes(value)) {
      return accumulator;
    }

    return accumulator.concat(value);
  }, [] as string[]);
}

function isString(value: string | null): value is string {
  return typeof value === "string";
}

function brightDataRetryDelay({ attempt }: { attempt: number }): number {
  return Math.min(1000 * 2 ** (attempt - 1), 4000);
}

function delay({ ms }: { ms: number }): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function querySuffixForType({ type }: { type: FindingType }): string {
  if (type === "cve") {
    return "CVE vulnerability";
  }

  if (type === "security_advisory") {
    return "security advisory";
  }

  if (type === "exploit_chatter") {
    return "exploit attack incident";
  }

  if (type === "vendor_deprecation") {
    return "deprecated end of life migration";
  }

  return "breaking release migration";
}

function vendorEvidenceUrl({
  dependency,
}: {
  dependency: DetectedDependency;
}): string {
  const framework =
    Object.keys(VENDOR_EVIDENCE_URLS).find((candidate) => {
      return dependencyMatchesFramework({ dependency, framework: candidate });
    }) || "";

  if (framework) {
    return VENDOR_EVIDENCE_URLS[framework] || "https://github.com/advisories";
  }

  return buildUrl({
    baseUrl: "https://github.com/search",
    searchParam: "q",
    value: `${dependency.name} releases deprecation`,
  });
}

function dependencyMatchesFramework({
  dependency,
  framework,
}: {
  dependency: DetectedDependency;
  framework: string;
}): boolean {
  const dependencyName = dependency.name.toLowerCase();
  const normalizedFramework = framework.toLowerCase();

  if (normalizedFramework === "next.js") {
    return dependencyName === "next";
  }

  if (normalizedFramework === "spring boot") {
    return dependencyName.includes("spring-boot");
  }

  return (
    dependencyName === normalizedFramework ||
    dependencyName.includes(normalizedFramework.replaceAll(" ", "-"))
  );
}

function buildUrl({
  baseUrl,
  searchParam,
  value,
}: {
  baseUrl: string;
  searchParam: string;
  value: string;
}): string {
  const url = new URL(baseUrl);
  url.searchParams.set(searchParam, value);
  return url.toString();
}

function isDetectedDependency(
  value: DetectedDependency | undefined
): value is DetectedDependency {
  return Boolean(value);
}
