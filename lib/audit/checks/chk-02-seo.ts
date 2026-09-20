import { canonicalUrl, hasEmptyRoot, hasNoIndex, headings, imageAlts, metaContent, pageTitle } from "@/lib/audit/html";
import { finding, requestEvidence } from "@/lib/audit/checks/helpers";
import type { Check } from "@/lib/audit/types";

export const seoCheck: Check = {
  id: "chk-02-seo",
  category: "seo",
  timeoutMs: 15_000,
  async run(ctx) {
    const findings = [];
    const title = pageTitle({ html: ctx.html });
    const description = metaContent({ html: ctx.html, name: "description" });
    const ogTitle = metaContent({ html: ctx.html, name: "og:title" });
    const canonical = canonicalUrl({ html: ctx.html });
    if (!title || title.length < 10 || title.length > 65) findings.push(finding({ id: "seo-title", checkId: "chk-02-seo", category: "seo", severity: "high", title: "The page title is missing or unclear", summary: "The browser title is empty or outside a useful search length.", whyItMatters: "Searchers cannot tell what the product does from the result page.", exactFix: "Add a clear 10–65 character title describing the product and its audience.", evidence: [requestEvidence({ request: `GET ${ctx.resolvedUrl}`, status: ctx.status })] }));
    if (!description || description.length < 50) findings.push(finding({ id: "seo-description", checkId: "chk-02-seo", category: "seo", severity: "medium", title: "The search description is missing or too short", summary: "There is no useful meta description for search previews.", whyItMatters: "Search engines and social previews have less context to show potential customers.", exactFix: "Add a 50–160 character meta description that says who the product helps and how.", evidence: [requestEvidence({ request: `GET ${ctx.resolvedUrl}`, status: ctx.status })] }));
    if (!ogTitle || !canonical) findings.push(finding({ id: "seo-social-canonical", checkId: "chk-02-seo", category: "seo", severity: "low", title: "Social sharing or canonical metadata is incomplete", summary: `Open Graph title: ${ogTitle ? "present" : "missing"}; canonical URL: ${canonical ? "present" : "missing"}.`, whyItMatters: "Shared links can look generic and duplicate URLs can compete in search.", exactFix: "Add og:title, og:description, og:image, and a canonical link pointing to the preferred URL.", evidence: [requestEvidence({ request: `GET ${ctx.resolvedUrl}`, status: ctx.status })] }));
    if (!ctx.robots) findings.push(finding({ id: "seo-robots", checkId: "chk-02-seo", category: "seo", severity: "low", title: "robots.txt is missing", summary: "The site did not return a robots.txt file.", whyItMatters: "You have less control over how crawlers discover and avoid pages.", exactFix: "Publish /robots.txt with your sitemap URL and crawl rules.", evidence: [requestEvidence({ request: `GET ${ctx.origin}/robots.txt`, status: null })] }));
    if (!ctx.sitemap) findings.push(finding({ id: "seo-sitemap", checkId: "chk-02-seo", category: "seo", severity: "low", title: "sitemap.xml is missing", summary: "The site did not return a sitemap.xml file.", whyItMatters: "Search engines have less reliable guidance for finding your important pages.", exactFix: "Generate and publish /sitemap.xml with your canonical public routes.", evidence: [requestEvidence({ request: `GET ${ctx.origin}/sitemap.xml`, status: null })] }));
    if (hasNoIndex({ html: ctx.html })) findings.push(finding({ id: "seo-noindex", checkId: "chk-02-seo", category: "seo", severity: "blocker", title: "The site tells search engines not to index it", summary: "A noindex robots directive is present.", whyItMatters: "Your public product may never appear in search results.", exactFix: "Remove noindex from production pages unless the page is intentionally private.", evidence: [requestEvidence({ request: `GET ${ctx.resolvedUrl}`, status: ctx.status })] }));
    if (hasEmptyRoot({ html: ctx.html })) findings.push(finding({ id: "seo-empty-root", checkId: "chk-02-seo", category: "seo", severity: "high", title: "The initial HTML is essentially empty", summary: "The root element is empty until JavaScript runs.", whyItMatters: "Slow connections, link previews, and some crawlers see no useful page content.", exactFix: "Render meaningful page metadata and primary content in the initial response, or configure server rendering for the landing route.", evidence: [requestEvidence({ request: `GET ${ctx.resolvedUrl}`, status: ctx.status })] }));
    const h1s = headings({ html: ctx.html, level: 1 });
    if (h1s.length !== 1) findings.push(finding({ id: "seo-h1", checkId: "chk-02-seo", category: "seo", severity: "medium", title: "The page has an unclear H1 structure", summary: `Found ${h1s.length} H1 headings; expected exactly one primary heading.`, whyItMatters: "The main promise is harder for visitors and search engines to understand.", exactFix: "Keep one descriptive H1 and use H2/H3 headings for supporting sections.", evidence: [requestEvidence({ request: `GET ${ctx.resolvedUrl}`, status: ctx.status })] }));
    const missingAlts = imageAlts({ html: ctx.html }).filter((image) => !image.alt);
    if (missingAlts.length > 0) findings.push(finding({ id: "seo-image-alt", checkId: "chk-02-seo", category: "seo", severity: "low", title: "Some images have no alt text", summary: `${missingAlts.length} image(s) are missing alternative text.`, whyItMatters: "Screen-reader users miss context and image search signals are weaker.", exactFix: "Add concise alt text to informative images and empty alt attributes to decorative ones.", evidence: [requestEvidence({ request: `GET ${ctx.resolvedUrl}`, status: ctx.status })] }));
    return findings;
  },
};
