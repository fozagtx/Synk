import { finding, requestEvidence, timedFetch } from "@/lib/audit/checks/helpers";
import type { Check } from "@/lib/audit/types";

export const hygieneCheck: Check = {
  id: "chk-05-hygiene",
  category: "hygiene",
  timeoutMs: 20_000,
  async run(ctx) {
    const findings = [];
    const missingHeaders = [
      ["content-security-policy", "CSP", "high"],
      ["strict-transport-security", "HSTS", "medium"],
      ["x-frame-options", "X-Frame-Options", "medium"],
      ["x-content-type-options", "X-Content-Type-Options", "low"],
    ] as const;
    missingHeaders.filter(([header]) => !ctx.headers[header]).forEach(([header, label, severity]) => findings.push(finding({ id: `hygiene-${header}`, checkId: "chk-05-hygiene", category: "hygiene", severity, title: `${label} header is missing`, summary: `The home page response did not include ${label}.`, whyItMatters: `${label} reduces a common class of browser-side attacks.`, exactFix: `Configure ${label} at your hosting layer with a policy appropriate for your app, then verify the production response.`, evidence: [requestEvidence({ request: `GET ${ctx.resolvedUrl}`, status: ctx.status })] })));
    const exposedPaths = ["/.env", "/.git/config"];
    const exposed = await Promise.all(exposedPaths.map(async (path) => ({ path, response: await timedFetch({ url: `${ctx.origin}${path}` }) })));
    exposed.filter(({ response }) => response instanceof Response && response.ok).forEach(({ path, response }) => {
      if (!(response instanceof Response)) return;
      findings.push(finding({ id: `hygiene-exposed-${path}`, checkId: "chk-05-hygiene", category: "hygiene", severity: "blocker", title: `A sensitive ${path} file is publicly reachable`, summary: `The server returned HTTP ${response.status} for ${path}.`, whyItMatters: "Configuration or repository data can expose credentials and source code.", exactFix: `Remove ${path} from the deployed site and add a hosting rule that denies access to dot-files.`, evidence: [requestEvidence({ request: `GET ${ctx.origin}${path}`, status: response.status })] }));
    });
    const sourceMaps = Array.from(ctx.html.matchAll(/(?:src|href)=["']([^"']+\.map)["']/gi)).map((match) => new URL(match[1] ?? "", ctx.resolvedUrl).toString());
    const sourceMapResults = await Promise.all(sourceMaps.slice(0, 10).map(async (url) => ({ url, response: await timedFetch({ url }) })));
    sourceMapResults.filter(({ response }) => response instanceof Response && response.ok).forEach(({ url, response }) => {
      if (!(response instanceof Response)) return;
      findings.push(finding({ id: `hygiene-source-map-${url}`, checkId: "chk-05-hygiene", category: "hygiene", severity: "medium", title: "A production source map is reachable", summary: "A .map file was returned publicly.", whyItMatters: "Source maps can reveal implementation details and internal URLs.", exactFix: "Do not publish source maps in production, or restrict access to them.", evidence: [requestEvidence({ request: `GET ${url}`, status: response.status })] }));
    });
    if (/src=["']http:\/\//i.test(ctx.html) || /href=["']http:\/\//i.test(ctx.html)) findings.push(finding({ id: "hygiene-mixed-content", checkId: "chk-05-hygiene", category: "hygiene", severity: "high", title: "The page contains mixed-content assets", summary: "At least one asset is loaded over HTTP on the HTTPS page.", whyItMatters: "Browsers can block those assets or expose visitors to tampering.", exactFix: "Change every production asset URL to HTTPS or a root-relative path.", evidence: [requestEvidence({ request: `GET ${ctx.resolvedUrl}`, status: ctx.status })] }));
    if (ctx.analytics.length > 0) findings.push(finding({ id: "hygiene-analytics", checkId: "chk-05-hygiene", category: "hygiene", severity: "info", title: "Analytics scripts are present", summary: `Detected ${ctx.analytics.join(", ")}.`, whyItMatters: "Analytics can be useful, but it should be intentional and covered by your privacy notice.", exactFix: "Confirm the analytics vendor is intentional, minimize collection, and publish the matching privacy disclosure.", evidence: [requestEvidence({ request: "GET public JavaScript bundle", status: 200 })] }));
    return findings;
  },
};
