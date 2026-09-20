import type { Category, Evidence, Finding, Severity, SiteContext } from "@/lib/audit/types";

export function finding({ id, checkId, category, severity, title, summary, whyItMatters, exactFix, evidence = [] }: { id: string; checkId: string; category: Category; severity: Severity; title: string; summary: string; whyItMatters: string; exactFix: string; evidence?: Evidence[] }): Finding {
  return { id, checkId, category, severity, title, summary, whyItMatters, exactFix, evidence };
}

export function requestEvidence({ request, status, redacted }: { request: string; status: number | null; redacted?: string }): Evidence {
  return { request, status, redacted };
}

export async function timedFetch({ url, headers = {} }: { url: string; headers?: Record<string, string> }): Promise<Response | Error> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("request timeout")), 7000);
  const response = await fetch(url, { headers: { "User-Agent": "Synk Rescue Audit/1.0", ...headers }, signal: controller.signal, redirect: "follow" }).catch((cause) => new Error(`Request failed for ${url}`, { cause }));
  clearTimeout(timeout);
  return response;
}

export function assetUrls({ ctx }: { ctx: SiteContext }): string[] {
  return [...ctx.bundles.flatMap(() => []), ...Array.from(ctx.html.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css|png|jpe?g|webp|avif))["']/gi)).map((match) => new URL(match[1] ?? "", ctx.resolvedUrl).toString())];
}
