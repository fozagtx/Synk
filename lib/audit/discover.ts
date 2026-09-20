import dns from "node:dns/promises";

import * as errore from "errore";

import {
  hasEmptyRoot,
  htmlLinks,
  metaContent,
  modulePreloadSources,
  scriptSources,
} from "@/lib/audit/html";
import { isRecord } from "@/lib/audit/errors";
import type { Builder, SiteContext, SitePage } from "@/lib/audit/types";

const USER_AGENT = "Synk Rescue Audit/1.0 (+https://synk.dev)";
const REQUEST_TIMEOUT_MS = 9000;
const HOME_BODY_BYTES = 2_000_000;
const BUNDLE_BODY_BYTES = 3_000_000;
const BUNDLE_TOTAL_BYTES = 8_000_000;

export function normalizeUrl({ value }: { value: string }): URL | Error {
  const candidate = /^https?:\/\//i.test(value.trim())
    ? value.trim()
    : `https://${value.trim()}`;
  const parsed = errore.try({
    try: () => new URL(candidate),
    catch: (cause) => new Error("Invalid URL", { cause }),
  });

  if (parsed instanceof Error) {
    return parsed;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return new Error("Only HTTP and HTTPS URLs are supported");
  }

  return parsed;
}

export async function assertPublicUrl({
  url,
}: {
  url: URL;
}): Promise<URL | Error> {
  const hostname = url.hostname.toLowerCase();

  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "0.0.0.0"
  ) {
    return new Error("Local URLs cannot be audited");
  }

  const addresses = await errore.tryAsync({
    try: () => dns.lookup(hostname, { all: true }),
    catch: (cause) => new Error("Could not resolve hostname", { cause }),
  });

  if (addresses instanceof Error) {
    return addresses;
  }

  return addresses.some(({ address }) => isPrivateAddress({ address }))
    ? new Error("Private and local network URLs cannot be audited")
    : url;
}

function isPrivateAddress({ address }: { address: string }): boolean {
  const value = address.toLowerCase();

  if (
    value === "::1" ||
    value.startsWith("fc") ||
    value.startsWith("fd") ||
    value.startsWith("fe80:")
  ) {
    return true;
  }

  const parts = value.split(".").map(Number);

  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
    return false;
  }

  const first = parts[0] ?? 0;
  const second = parts[1] ?? 0;

  return (
    first === 10 ||
    first === 127 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 169 && second === 254)
  );
}

async function readResponseBody({
  response,
  maxBytes,
}: {
  response: Response;
  maxBytes: number;
}): Promise<string> {
  const contentLength = Number(response.headers.get("content-length") ?? "");

  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return "";
  }

  const body = await response.arrayBuffer();
  const bytes = new Uint8Array(body).slice(0, maxBytes);
  return new TextDecoder().decode(bytes);
}

async function fetchText({
  url,
  maxBytes,
}: {
  url: URL;
  maxBytes: number;
}): Promise<SitePage | Error> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(new Error("request timeout"));
  }, REQUEST_TIMEOUT_MS);
  const response = await fetch(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml,text/plain,*/*",
      "User-Agent": USER_AGENT,
    },
    redirect: "follow",
    signal: controller.signal,
  }).catch((cause) => {
    return new Error(`Could not fetch ${url.toString()}`, { cause });
  });

  clearTimeout(timeout);

  if (response instanceof Error) {
    return response;
  }

  const resolvedCheck = await assertPublicUrl({
    url: new URL(response.url),
  });

  if (resolvedCheck instanceof Error) {
    return resolvedCheck;
  }

  const headers = Array.from(response.headers.entries()).reduce<
    Record<string, string>
  >((result, [key, value]) => {
    return { ...result, [key]: value };
  }, {});

  return {
    url: response.url,
    status: response.status,
    html: await readResponseBody({ response, maxBytes }),
    headers,
  };
}

async function fetchBundleBatch({
  urls,
  index,
  results,
}: {
  urls: URL[];
  index: number;
  results: string[];
}): Promise<string[]> {
  if (index >= urls.length) {
    return results;
  }

  const batch = urls.slice(index, index + 4);
  const batchResults = await Promise.all(
    batch.map(async (url) => {
      const bundle = await fetchText({
        url,
        maxBytes: BUNDLE_BODY_BYTES,
      });
      return bundle instanceof Error ? "" : bundle.html;
    }),
  );

  return fetchBundleBatch({
    urls,
    index: index + batch.length,
    results: [...results, ...batchResults],
  });
}

function limitBundleBudget({ bundles }: { bundles: string[] }): string[] {
  return bundles.reduce<{ bundles: string[]; remaining: number }>(
    (result, bundle) => {
      const bytes = new TextEncoder().encode(bundle);
      const allowed = Math.min(bytes.byteLength, result.remaining);
      const limited = new TextDecoder().decode(bytes.slice(0, allowed));

      return {
        bundles: [...result.bundles, limited],
        remaining: result.remaining - allowed,
      };
    },
    { bundles: [], remaining: BUNDLE_TOTAL_BYTES },
  ).bundles;
}

function detectBuilder({
  url,
  html,
  bundles,
}: {
  url: string;
  html: string;
  bundles: string[];
}): Builder {
  const hostname = new URL(url).hostname.toLowerCase();
  const generator = metaContent({ html, name: "generator" }).toLowerCase();
  const source = bundles.join("\n").toLowerCase();

  if (
    hostname.endsWith(".lovable.app") ||
    hostname.endsWith(".lovableproject.com")
  ) {
    return "lovable";
  }

  if (hostname.endsWith(".bolt.host")) {
    return "bolt";
  }

  if (hostname.endsWith(".v0.app") || hostname.endsWith(".v0.dev")) {
    return "v0";
  }

  if (/lovable|gptengineer/.test(generator)) {
    return "lovable";
  }

  if (/bolt/.test(generator)) {
    return "bolt";
  }

  if (/v0/.test(generator)) {
    return "v0";
  }

  if (
    source.includes("gptengineer.js") ||
    source.includes("lovable-tagger") ||
    source.includes("lovable.dev")
  ) {
    return "lovable";
  }

  if (source.includes("bolt.new")) {
    return "bolt";
  }

  if (source.includes("v0.dev") || source.includes("v0.app")) {
    return "v0";
  }

  return "unknown";
}

function decodeJwtRole({ token }: { token: string }): string | null {
  const payload = token.split(".")[1];

  if (!payload) {
    return null;
  }

  const parsed = errore.try({
    try: () => {
      return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    },
    catch: () => new Error("JWT payload is not JSON"),
  });

  if (parsed instanceof Error || !isRecord(parsed)) {
    return null;
  }

  return typeof parsed.role === "string" ? parsed.role : null;
}

function extractSupabase({
  bundles,
}: {
  bundles: string[];
}): Pick<
  SiteContext,
  | "supabaseProjectUrl"
  | "supabaseAnonKey"
  | "supabaseProjectRef"
  | "supabaseTables"
  | "supabaseBuckets"
  | "serviceRoleTokens"
  | "analytics"
> {
  const source = bundles.join("\n");
  const projectUrl = source.match(/https:\/\/[a-z0-9-]+\.supabase\.co/i)?.[0] ?? null;
  const jwtCandidates = source.match(
    /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  ) ?? [];
  const publishableKeys = source.match(/sb_publishable_[A-Za-z0-9_-]+/g) ?? [];
  const secretKeys = source.match(/sb_secret_[A-Za-z0-9_-]+/g) ?? [];
  const anonKey =
    publishableKeys[0] ??
    jwtCandidates.find((token) => decodeJwtRole({ token }) === "anon") ??
    null;
  const serviceRoleTokens = [
    ...secretKeys,
    ...jwtCandidates.filter(
      (token) => decodeJwtRole({ token }) === "service_role",
    ),
  ];
  const tables = Array.from(
    source.matchAll(/\.from\(["']([^"']+)["']\)|table:\s*["']([^"']+)["']/g),
  )
    .map((match) => match[1] ?? match[2] ?? "")
    .filter((value) => value.length > 0);
  const buckets = Array.from(
    source.matchAll(/\.storage\.from\(["']([^"']+)["']\)/g),
  )
    .map((match) => match[1] ?? "")
    .filter((value) => value.length > 0);
  const analytics = [
    "gtag(",
    "googleanalytics",
    "plausible",
    "posthog",
    "segment",
    "mixpanel",
  ].filter((tag) => source.toLowerCase().includes(tag));

  return {
    supabaseProjectUrl: projectUrl,
    supabaseAnonKey: anonKey,
    supabaseProjectRef: projectUrl?.split(".")[0]?.replace("https://", "") ?? null,
    supabaseTables: [...new Set(tables)].slice(0, 25),
    supabaseBuckets: [...new Set(buckets)].slice(0, 25),
    serviceRoleTokens: [...new Set(serviceRoleTokens)],
    analytics,
  };
}

export async function discoverSite({
  inputUrl,
}: {
  inputUrl: string;
}): Promise<SiteContext | Error> {
  const normalized = normalizeUrl({ value: inputUrl });

  if (normalized instanceof Error) {
    return normalized;
  }

  const publicUrl = await assertPublicUrl({ url: normalized });

  if (publicUrl instanceof Error) {
    return publicUrl;
  }

  const home = await fetchText({
    url: publicUrl,
    maxBytes: HOME_BODY_BYTES,
  });

  if (home instanceof Error) {
    return home;
  }

  const resolved = new URL(home.url);
  const origin = resolved.origin;
  const links = htmlLinks({ html: home.html })
    .map((href) => errore.try({
      try: () => new URL(href, resolved),
      catch: () => new Error("Invalid linked URL"),
    }))
    .filter((url): url is URL => url instanceof URL)
    .filter((url) => url.origin === origin && url.pathname !== resolved.pathname);
  const uniqueLinks = [
    ...new Map(links.map((url) => [url.pathname, url])).values(),
  ].slice(0, 10);
  const pages = await Promise.all(
    uniqueLinks.map(async (url): Promise<SitePage | null> => {
      const page = await fetchText({ url, maxBytes: 300_000 });
      return page instanceof Error ? null : page;
    }),
  );
  const bundleUrls = [
    ...scriptSources({ html: home.html }),
    ...modulePreloadSources({ html: home.html }),
  ]
    .map((source) => errore.try({
      try: () => new URL(source, resolved),
      catch: () => new Error("Invalid bundle URL"),
    }))
    .filter((url): url is URL => url instanceof URL)
    .filter((url) => url.origin === origin)
    .filter((url, index, all) => {
      return all.findIndex((candidate) => candidate.toString() === url.toString()) === index;
    })
    .slice(0, 40);
  const bundles = limitBundleBudget({
    bundles: await fetchBundleBatch({
      urls: bundleUrls,
      index: 0,
      results: [],
    }),
  });
  const robots = await fetchText({
    url: new URL("/robots.txt", origin),
    maxBytes: 100_000,
  });
  const sitemap = await fetchText({
    url: new URL("/sitemap.xml", origin),
    maxBytes: 500_000,
  });
  const extraction = extractSupabase({ bundles });

  return {
    inputUrl,
    resolvedUrl: resolved.toString(),
    origin,
    status: home.status,
    html: home.html,
    headers: home.headers,
    pages: pages.filter((page): page is SitePage => page !== null),
    robots: robots instanceof Error ? null : robots.html,
    sitemap: sitemap instanceof Error ? null : sitemap.html,
    bundles,
    builder: detectBuilder({
      url: resolved.toString(),
      html: home.html,
      bundles,
    }),
    ...extraction,
  };
}

export { hasEmptyRoot };
