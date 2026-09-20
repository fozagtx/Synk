import { finding, requestEvidence } from "@/lib/audit/checks/helpers";
import type { Check } from "@/lib/audit/types";

export const deployCheck: Check = {
  id: "chk-01-deploy",
  category: "deploy",
  timeoutMs: 15_000,
  async run(ctx) {
    const findings = [];
    if (!ctx.resolvedUrl.startsWith("https://")) {
      findings.push(finding({ id: "deploy-https", checkId: "chk-01-deploy", category: "deploy", severity: "high", title: "The site is not using HTTPS", summary: "The resolved site URL starts with HTTP instead of HTTPS.", whyItMatters: "Visitors can have their connection intercepted and browsers may block secure features.", exactFix: "Enable HTTPS at your hosting provider and redirect every HTTP request to the HTTPS URL.", evidence: [requestEvidence({ request: `GET ${ctx.resolvedUrl}`, status: ctx.status })] }));
    }
    if (ctx.status >= 400) findings.push(finding({ id: "deploy-home-status", checkId: "chk-01-deploy", category: "deploy", severity: "blocker", title: "The home page returns an error", summary: `The home page returned HTTP ${ctx.status}.`, whyItMatters: "People cannot reliably open the product.", exactFix: "Fix the deployment error, then verify the final URL returns HTTP 200.", evidence: [requestEvidence({ request: `GET ${ctx.resolvedUrl}`, status: ctx.status })] }));
    if (/\.(lovable\.app|vercel\.app|bolt\.new)$/i.test(new URL(ctx.resolvedUrl).hostname)) findings.push(finding({ id: "deploy-preview-domain", checkId: "chk-01-deploy", category: "deploy", severity: "medium", title: "The site is still on a builder domain", summary: "The final URL is a builder or preview subdomain rather than a custom domain.", whyItMatters: "A custom domain helps visitors trust the product and avoids preview URLs changing.", exactFix: "Connect your custom domain in the builder's domain settings and redirect the preview URL.", evidence: [requestEvidence({ request: `GET ${ctx.resolvedUrl}`, status: ctx.status })] }));
    return findings;
  },
};
