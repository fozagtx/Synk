import dns from "node:dns/promises";

import * as errore from "errore";

import {
  hasEmptyRoot,
  htmlLinks,
  scriptSources,
} from "@/lib/audit/html";
import type { Builder, SiteContext, SitePage } from "@/lib/audit/types";

const USER_AGENT = "Synk Rescue Audit/1.0 (+https://synk.dev)";
const REQUEST_TIMEOUT_MS = 9000;
const MAX_BODY_BYTES = 2_000_000;

export function normalizeUrl({ value }: { value: string }): URL | Error {
  const candidate = value.trim().match(/^https?:\/\//i) ? value.trim() : `https://${value.trim()}`;
  const parsed = errore.try({
    try: () => new URL(candidate),
    catch: (cause) => new Error("Invalid URL", { cause }),
  });
  if (parsed instanceof Error) return parsed;
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return new Error("Only HTTP and HTTPS URLs are supported");
  return parsed;
}

export async function assertPublicUrl({ url }: { url: URL }): Promise<URL | Error> {
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname === "0.0.0.0") return new Error("Local URLs cannot be audited");
  const addresses = await errore.tryAsync({
    try: () => dns.lookup(hostname, { all: true }),
    catch: (cause) => new Error("Could not resolve hostname", { cause }),
  });
  if (addresses instanceof Error) return addresses;
  const privateAddress = addresses.some(({ address }) => isPrivateAddress({ address }));
  return privateAddress ? new Error("Private and local network URLs cannot be audited") : url;
}

function isPrivateAddress({ address }: { address: string }): boolean {
  const value = address.toLowerCase();
  if (value === "::1" || value.startsWith("fc") || value.startsWith("fd") || value.startsWith("fe80:")) return true;
  const parts = value.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return false;
  const [first, second] = parts;
  return first === 10 || first === 127 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168) || (first === 169 && second === 254);
}

async function readResponseBody({ response, maxBytes }: { response: Response; maxBytes: number }): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return response.text();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let done = false;
  while (!done && total < maxBytes) {
    const chunk = await reader.read();
    done = chunk.done;
    if (chunk.value) {
      const remaining = maxBytes - total;
      const value = chunk.value.slice(0, remaining);
      chunks.push(value);
      total += value.byteLength;
    }
  }
  const bytes = new Uint8Array(total);
  chunks.reduce((offset, chunk) => {
    bytes.set(chunk, offset);
    return offset + chunk.byteLength;
  }, 0);
  return new TextDecoder().decode(bytes);
}

async function fetchText({ url, maxBytes = MAX_BODY_BYTES }: { url: URL; maxBytes?: number }): Promise<SitePage | Error> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("request timeout")), REQUEST_TIMEOUT_MS);
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml,text/plain,*/*" },
    signal: controller.signal,
    redirect: "follow",
  }).catch((cause) => new Error(`Could not fetch ${url.toString()}`, { cause }));
  clearTimeout(timeout);
  if (response instanceof Error) return response;
  const resolvedCheck = await assertPublicUrl({ url: new URL(response.url) });
  if (resolvedCheck instanceof Error) return resolvedCheck;
  const body = await readResponseBody({ response, maxBytes });
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => { headers[key] = value; });
  return { url: response.url, status: response.status, html: body, headers };
}

function detectBuilder({ url, html, bundles }: { url: string; html: string; bundles: string[] }): Builder {
  const sample = `${url} ${html} ${bundles.join(" ")}`.toLowerCase();
  if (sample.includes("lovable")) return "lovable";
  if (sample.includes("bolt.new") || sample.includes("stackblitz")) return "bolt";
  if (sample.includes("v0.dev") || sample.includes("vercel")) return "v0";
  if (sample.includes("cursor")) return "cursor";
  return "unknown";
}

function extractSupabase({ bundles }: { bundles: string[] }): Pick<SiteContext, "supabaseProjectUrl" | "supabaseAnonKey" | "supabaseProjectRef" | "supabaseTables" | "supabaseBuckets" | "serviceRoleTokens" | "analytics"> {
  const source = bundles.join("\n");
  const projectUrl = source.match(/https:\/\/[a-z0-9-]+\.supabase\.co/gi)?.[0] ?? null;
  const anonKey = source.match(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g)?.find((value) => !value.toLowerCase().includes("service_role")) ?? null;
  const serviceRoleTokens = source.match(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g)?.filter((value) => /service_role/i.test(value)) ?? [];
  const tables = Array.from(source.matchAll(/\.from\(["']([^"']+)["']\)|table:\s*["']([^"']+)["']/g)).map((match) => match[1] ?? match[2] ?? "").filter(Boolean);
  const buckets = Array.from(source.matchAll(/\.storage\.from\(["']([^"']+)["']\)/g)).map((match) => match[1] ?? "").filter(Boolean);
  const analytics = ["gtag(", "GoogleAnalytics", "plausible", "posthog", "segment", "mixpanel"].filter((tag) => source.includes(tag));
  return { supabaseProjectUrl: projectUrl, supabaseAnonKey: anonKey, supabaseProjectRef: projectUrl?.split(".")[0]?.replace("https://", "") ?? null, supabaseTables: [...new Set(tables)].slice(0, 25), supabaseBuckets: [...new Set(buckets)].slice(0, 25), serviceRoleTokens, analytics };
}

export async function discoverSite({ inputUrl }: { inputUrl: string }): Promise<SiteContext | Error> {
  const normalized = normalizeUrl({ value: inputUrl });
  if (normalized instanceof Error) return normalized;
  const publicUrl = await assertPublicUrl({ url: normalized });
  if (publicUrl instanceof Error) return publicUrl;
  const home = await fetchText({ url: publicUrl });
  if (home instanceof Error) return home;
  const resolved = new URL(home.url);
  const origin = resolved.origin;
  const links = htmlLinks({ html: home.html }).map((href) => new URL(href, resolved)).filter((url) => url.origin === origin && url.pathname !== resolved.pathname);
  const pages = await Promise.all([...new Map(links.map((url) => [url.pathname, url])).values()].slice(0, 10).map(async (url): Promise<SitePage | null> => {
    const page = await fetchText({ url, maxBytes: 300_000 });
    return page instanceof Error ? null : page;
  }));
  const bundleUrls = scriptSources({ html: home.html }).map((src) => new URL(src, resolved)).filter((url) => url.origin === origin).slice(0, 20);
  const bundles = await Promise.all(bundleUrls.map(async (url) => {
    const bundle = await fetchText({ url, maxBytes: 100_000 });
    return bundle instanceof Error ? "" : bundle.html;
  }));
  const extraction = extractSupabase({ bundles });
  const robots = await fetchText({ url: new URL("/robots.txt", origin), maxBytes: 100_000 });
  const sitemap = await fetchText({ url: new URL("/sitemap.xml", origin), maxBytes: 500_000 });
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
    builder: detectBuilder({ url: resolved.toString(), html: home.html, bundles }),
    ...extraction,
  };
}

export { hasEmptyRoot };
