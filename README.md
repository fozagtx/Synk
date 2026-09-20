# Synk — Vibe-Code Rescue Audit

Synk audits public sites made with Lovable, Bolt, v0, Cursor, or a similar builder before launch. Enter a URL and Synk uses server-side `fetch` to inspect deployment, SEO, measurable performance signals, security headers, hygiene, and Supabase exposure.

## What it checks

1. **Deployment** — HTTPS, final redirects, preview domains, and reachable routes.
2. **SEO** — titles, descriptions, social metadata, canonical URLs, robots, sitemaps, headings, and image alt text.
3. **Performance** — sampled JavaScript weight, render-blocking assets, document size, compression, and caching headers. It does not claim to measure Lighthouse or LCP.
4. **Supabase security** — read-only OpenAPI and `limit=1` table probes using the public anon key, plus public storage and exposed service-role token detection. Returned rows are stored only as redacted column names, types, and masked values.
5. **Launch hygiene** — CSP, HSTS, framing and MIME-sniffing headers, source maps, mixed content, exposed files, and analytics.

Every finding is deterministic. The report includes a score, plain-English explanation, evidence, effort estimate, and a builder-aware Fix Prompt with `full` and safe-only variants.

## Local development

```sh
npm install
npm run dev
```

The URL field works with no environment variables. Speechmatics voice input is optional and degrades with a clear configuration error when `SPEECHMATICS_API_KEY` is absent.

The only secret is `SPEECHMATICS_API_KEY`. `SPEECHMATICS_BATCH_BASE_URL` and `SPEECHMATICS_REALTIME_URL` have defaults.

## Storage and safety

Audit records use a typed in-process `Map` in v1. They are not durable across restarts. Identical URLs are deduplicated for 15 minutes.

Supabase checks are read-only in v1: Synk never writes, inserts, updates, or deletes data. Table probes are capped at 25 and always use `limit=1`. A failed probe becomes an “couldn't check” informational finding, never a passing result.
