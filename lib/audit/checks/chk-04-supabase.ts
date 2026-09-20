import { finding, requestEvidence, timedFetch } from "@/lib/audit/checks/helpers";
import type { Check, SiteContext } from "@/lib/audit/types";

function redactRow({ value }: { value: unknown }): string {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return "row: unavailable";
  const row = value as Record<string, unknown>;
  const summary = Object.entries(row).map(([key, item]) => `${key}:${typeof item}=${mask({ value: String(item) })}`).join(", ");
  return `redacted row: ${summary || "no columns"}`;
}

function mask({ value }: { value: string }): string {
  if (value.length <= 3) return "***";
  return `${value.slice(0, 1)}***${value.slice(-1)}`;
}

async function fetchJson({ url, key }: { url: string; key: string }): Promise<{ response: Response; data: unknown } | Error> {
  const response = await timedFetch({ url, headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (response instanceof Error) return response;
  const data = await response.json().catch((cause) => new Error("Supabase response was not JSON", { cause }));
  if (data instanceof Error) return data;
  return { response, data };
}

export const supabaseCheck: Check = {
  id: "chk-04-supabase",
  category: "security",
  timeoutMs: 30_000,
  async run(ctx: SiteContext) {
    const findings = [];
    if (ctx.serviceRoleTokens.length > 0) findings.push(finding({ id: "supabase-service-role", checkId: "chk-04-supabase", category: "security", severity: "blocker", title: "A service-role credential is exposed in the browser bundle", summary: "A server-only Supabase service_role-shaped token was found in public JavaScript.", whyItMatters: "Anyone can use it to bypass database protections and alter private data.", exactFix: "Revoke the exposed key immediately, move privileged calls to a server-only route, and keep only the anon key in browser code.", evidence: [requestEvidence({ request: "GET public JavaScript bundle", status: 200, redacted: "token value redacted" })] }));
    if (!ctx.supabaseProjectUrl || !ctx.supabaseAnonKey) {
      return [...findings, finding({ id: "supabase-not-detected", checkId: "chk-04-supabase", category: "security", severity: "info", title: "Supabase access could not be checked", summary: "No public Supabase project URL and anon key were detected in the sampled bundles.", whyItMatters: "This audit could not verify database exposure from the browser bundle.", exactFix: "If the site uses Supabase, confirm the project URL and anon key are present in the deployed bundle, then re-check.", evidence: [requestEvidence({ request: "GET public JavaScript bundle", status: 200 })] })];
    }
    const projectUrl = ctx.supabaseProjectUrl;
    const anonKey = ctx.supabaseAnonKey;
    const schemaUrl = `${projectUrl}/rest/v1/`;
    const schemaResult = await fetchJson({ url: schemaUrl, key: anonKey });
    if (schemaResult instanceof Error) return [...findings, finding({ id: "supabase-schema-unavailable", checkId: "chk-04-supabase", category: "security", severity: "info", title: "Supabase tables could not be checked", summary: "The read-only OpenAPI schema request could not complete.", whyItMatters: "No conclusion about public table access is safe without a response.", exactFix: "Allow the audit request or check the Supabase API URL and re-run the audit.", evidence: [requestEvidence({ request: `GET ${schemaUrl}`, status: null })] })];
    const definitions = typeof schemaResult.data === "object" && schemaResult.data !== null ? (schemaResult.data as { definitions?: Record<string, unknown> }).definitions : undefined;
    const tables = [...new Set([...ctx.supabaseTables, ...Object.keys(definitions ?? {})])].slice(0, 25);
    const tableResults = await Promise.all(tables.slice(0, 25).map(async (table) => ({ table, result: await fetchJson({ url: `${projectUrl}/rest/v1/${encodeURIComponent(table)}?select=*&limit=1`, key: anonKey }) })));
    tableResults.filter(({ result }) => !(result instanceof Error) && result.response.ok).forEach(({ table, result }) => {
      if (result instanceof Error) return;
      const body = Array.isArray(result.data) ? result.data[0] : null;
      const sensitive = /name|email|phone|address|payment|user|customer|profile/i.test(table) || /name|email|phone|address|payment|user|customer|profile/i.test(JSON.stringify(body));
      findings.push(finding({ id: `supabase-table-${table}`, checkId: "chk-04-supabase", category: "security", severity: sensitive ? "blocker" : "high", title: `The ${table} table is readable without a user session`, summary: `A public read-only request returned data from ${table}.`, whyItMatters: "A stranger may be able to read information your users expect to be private.", exactFix: "Enable Row Level Security and add an own-row SELECT policy for authenticated users; never expose service-role credentials.", evidence: [requestEvidence({ request: `GET ${projectUrl}/rest/v1/${encodeURIComponent(table)}?select=*&limit=1`, status: result.response.status, redacted: redactRow({ value: body }) })] }));
    });
    if (tables.length === 0) findings.push(finding({ id: "supabase-no-tables", checkId: "chk-04-supabase", category: "security", severity: "info", title: "No Supabase tables were found to check", summary: "The schema response did not list tables.", whyItMatters: "There was no table list to probe in this read-only audit.", exactFix: "Confirm the schema endpoint is available and re-run after your tables are deployed.", evidence: [requestEvidence({ request: `GET ${schemaUrl}`, status: schemaResult.response.status })] }));
    const bucketResults = await Promise.all(ctx.supabaseBuckets.slice(0, 25).map(async (bucket) => ({ bucket, result: await timedFetch({ url: `${projectUrl}/storage/v1/object/list/${encodeURIComponent(bucket)}`, headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` } }) })));
    bucketResults.filter(({ result }) => result instanceof Response && result.ok).forEach(({ bucket, result }) => {
      if (!(result instanceof Response)) return;
      findings.push(finding({ id: `supabase-bucket-${bucket}`, checkId: "chk-04-supabase", category: "security", severity: "high", title: `The ${bucket} storage bucket is publicly listable`, summary: `A read-only storage listing request for ${bucket} returned HTTP ${result.status}.`, whyItMatters: "Visitors may discover private uploads and their filenames.", exactFix: "Make the bucket private and add storage policies that authorize only the intended users.", evidence: [requestEvidence({ request: `GET ${projectUrl}/storage/v1/object/list/${encodeURIComponent(bucket)}`, status: result.status, redacted: "listing values not stored" })] }));
    });
    return findings;
  },
};
