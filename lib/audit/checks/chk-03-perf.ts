import { finding, requestEvidence } from "@/lib/audit/checks/helpers";
import { scriptSources, stylesheetLinks } from "@/lib/audit/html";
import type { Check } from "@/lib/audit/types";

export const perfCheck: Check = {
  id: "chk-03-perf",
  category: "perf",
  timeoutMs: 20_000,
  async run(ctx) {
    const scripts = scriptSources({ html: ctx.html });
    const styles = stylesheetLinks({ html: ctx.html });
    const bytes = ctx.bundles.reduce((total, bundle) => total + new TextEncoder().encode(bundle).byteLength, 0);
    const findings = [];
    if (bytes > 1_000_000) findings.push(finding({ id: "perf-js-weight", checkId: "chk-03-perf", category: "perf", severity: "high", title: "JavaScript bundles are heavy", summary: `The sampled JavaScript weighs about ${Math.round(bytes / 1000)} KB.`, whyItMatters: "Visitors on mobile networks wait longer before they can use the site.", exactFix: "Remove unused packages, split route-specific code, and lazy-load non-critical features.", evidence: [requestEvidence({ request: `GET ${ctx.resolvedUrl}`, status: ctx.status })] }));
    if (scripts.length + styles.length > 8) findings.push(finding({ id: "perf-render-blocking", checkId: "chk-03-perf", category: "perf", severity: "medium", title: "The head loads many render-blocking assets", summary: `${scripts.length} scripts and ${styles.length} stylesheets were referenced.`, whyItMatters: "The first screen can wait for too many network requests.", exactFix: "Defer non-critical scripts, inline only critical styles, and consolidate duplicate assets.", evidence: [requestEvidence({ request: `GET ${ctx.resolvedUrl}`, status: ctx.status })] }));
    const htmlBytes = new TextEncoder().encode(ctx.html).byteLength;
    if (htmlBytes > 500_000) findings.push(finding({ id: "perf-html-size", checkId: "chk-03-perf", category: "perf", severity: "medium", title: "The HTML document is large", summary: `The initial HTML is about ${Math.round(htmlBytes / 1000)} KB.`, whyItMatters: "Every visitor downloads this before the page can settle.", exactFix: "Trim inline data and unused markup; fetch large data after the first screen renders.", evidence: [requestEvidence({ request: `GET ${ctx.resolvedUrl}`, status: ctx.status })] }));
    if (!ctx.headers["content-encoding"]) findings.push(finding({ id: "perf-compression", checkId: "chk-03-perf", category: "perf", severity: "low", title: "Compression was not advertised", summary: "The response did not include a content-encoding header.", whyItMatters: "Text assets can cost more bandwidth than necessary.", exactFix: "Enable Brotli or gzip compression at the hosting layer.", evidence: [requestEvidence({ request: `GET ${ctx.resolvedUrl}`, status: ctx.status })] }));
    if (!ctx.headers["cache-control"]) findings.push(finding({ id: "perf-cache", checkId: "chk-03-perf", category: "perf", severity: "low", title: "Caching guidance is missing", summary: "The home response did not include cache-control.", whyItMatters: "Repeat visitors may download unchanged assets again.", exactFix: "Set long-lived immutable caching for hashed assets and a short explicit policy for HTML.", evidence: [requestEvidence({ request: `GET ${ctx.resolvedUrl}`, status: ctx.status })] }));
    return findings;
  },
};
