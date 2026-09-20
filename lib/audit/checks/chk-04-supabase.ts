import { isRecord } from "@/lib/audit/errors";
import {
  finding,
  requestEvidence,
  timedFetch,
} from "@/lib/audit/checks/helpers";
import type { Check, Finding, SiteContext } from "@/lib/audit/types";

function maskValue({ value }: { value: string }): string {
  if (value.length <= 3) {
    return "***";
  }

  return `${value.slice(0, 1)}***${value.slice(-1)}`;
}

function redactRow({
  value,
}: {
  value: unknown;
}): { columns: string[]; redacted: string } {
  if (!isRecord(value)) {
    return {
      columns: [],
      redacted: "redacted row: unavailable",
    };
  }

  const values = Object.entries(value);
  const columns = values.map(([key]) => key);
  const summary = values
    .map(([key, item]) => {
      return `${key}:${typeof item}=${maskValue({ value: String(item) })}`;
    })
    .join(", ");

  return {
    columns,
    redacted: `redacted row: ${summary || "no columns"}`,
  };
}

async function fetchJson({
  key,
  url,
}: {
  key: string;
  url: string;
}): Promise<{ data: unknown; response: Response } | Error> {
  const response = await timedFetch({
    url,
    headers: {
      Authorization: `Bearer ${key}`,
      apikey: key,
    },
  });

  if (response instanceof Error) {
    return response;
  }

  const data = await response.json().catch((cause) => {
    return new Error("Supabase response was not JSON", { cause });
  });

  if (data instanceof Error) {
    return data;
  }

  return { data, response };
}

function schemaTables({ value }: { value: unknown }): string[] {
  if (!isRecord(value) || !isRecord(value.definitions)) {
    return [];
  }

  return Object.keys(value.definitions);
}

function hasSensitiveName({ value }: { value: string }): boolean {
  return /name|email|phone|address|payment|user|customer|profile/i.test(value);
}

export const supabaseCheck: Check = {
  id: "chk-04-supabase",
  category: "security",
  timeoutMs: 30_000,
  async run(ctx: SiteContext): Promise<Finding[]> {
    const initialFindings = ctx.serviceRoleTokens.length > 0
      ? [
          finding({
            id: "supabase-service-role",
            checkId: "chk-04-supabase",
            category: "security",
            severity: "blocker",
            title: "A service-role credential is exposed in the browser bundle",
            summary:
              "A server-only Supabase service_role-shaped token was found in public JavaScript.",
            whyItMatters:
              "Anyone can use it to bypass database protections and alter private data.",
            exactFix:
              "Revoke the exposed key immediately, move privileged calls to a server-only route, and keep only the anon key in browser code.",
            evidence: [
              requestEvidence({
                request: "GET public JavaScript bundle",
                status: 200,
                redacted: "token value redacted",
              }),
            ],
          }),
        ]
      : [];

    if (!ctx.supabaseProjectUrl || !ctx.supabaseAnonKey) {
      return [
        ...initialFindings,
        finding({
          id: "supabase-not-detected",
          checkId: "chk-04-supabase",
          category: "security",
          severity: "info",
          title: "Supabase access could not be checked",
          summary:
            "No public Supabase project URL and anon key were detected in the sampled bundles.",
          whyItMatters:
            "This audit could not verify database exposure from the browser bundle.",
          exactFix:
            "If the site uses Supabase, confirm the project URL and anon key are present in the deployed bundle, then re-check.",
          evidence: [
            requestEvidence({
              request: "GET public JavaScript bundle",
              status: 200,
            }),
          ],
        }),
      ];
    }

    const projectUrl = ctx.supabaseProjectUrl;
    const anonKey = ctx.supabaseAnonKey;
    const schemaUrl = `${projectUrl}/rest/v1/`;
    const schemaResult = await fetchJson({
      key: anonKey,
      url: schemaUrl,
    });

    if (schemaResult instanceof Error) {
      return [
        ...initialFindings,
        finding({
          id: "supabase-schema-unavailable",
          checkId: "chk-04-supabase",
          category: "security",
          severity: "info",
          title: "Supabase tables could not be checked",
          summary:
            "The read-only OpenAPI schema request could not complete.",
          whyItMatters:
            "No conclusion about public table access is safe without a response.",
          exactFix:
            "Allow the audit request or check the Supabase API URL and re-run the audit.",
          evidence: [
            requestEvidence({
              request: `GET ${schemaUrl}`,
              status: null,
            }),
          ],
        }),
      ];
    }

    const tables = [
      ...new Set([
        ...ctx.supabaseTables,
        ...schemaTables({ value: schemaResult.data }),
      ]),
    ].slice(0, 25);
    const tableResults = await Promise.all(
      tables.map(async (table) => {
        return {
          table,
          result: await fetchJson({
            key: anonKey,
            url: `${projectUrl}/rest/v1/${encodeURIComponent(
              table,
            )}?select=*&limit=1`,
          }),
        };
      }),
    );
    const tableFindings = tableResults
      .filter(({ result }) => {
        return !(result instanceof Error) && result.response.ok;
      })
      .map(({ table, result }) => {
        if (result instanceof Error) {
          return null;
        }

        const row = Array.isArray(result.data) ? result.data[0] : null;
        const redacted = redactRow({ value: row });
        const sensitive =
          hasSensitiveName({ value: table }) ||
          redacted.columns.some((column) =>
            hasSensitiveName({ value: column }),
          );

        return finding({
          id: `supabase-table-${table}`,
          checkId: "chk-04-supabase",
          category: "security",
          severity: sensitive ? "blocker" : "high",
          title: `The ${table} table is readable without a user session`,
          summary: `A public read-only request returned data from ${table}.`,
          whyItMatters:
            "A stranger may be able to read information your users expect to be private.",
          exactFix:
            "Enable Row Level Security and add an own-row SELECT policy for authenticated users; never expose service-role credentials.",
          evidence: [
            requestEvidence({
              request: `GET ${projectUrl}/rest/v1/${encodeURIComponent(
                table,
              )}?select=*&limit=1`,
              status: result.response.status,
              redacted: redacted.redacted,
              table,
              columns: redacted.columns,
            }),
          ],
        });
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
    const bucketResults = await Promise.all(
      ctx.supabaseBuckets.slice(0, 25).map(async (bucket) => {
        return {
          bucket,
          result: await timedFetch({
            url: `${projectUrl}/storage/v1/object/list/${encodeURIComponent(
              bucket,
            )}`,
            headers: {
              Authorization: `Bearer ${anonKey}`,
              apikey: anonKey,
            },
          }),
        };
      }),
    );
    const bucketFindings = bucketResults
      .filter(({ result }) => {
        return result instanceof Response && result.ok;
      })
      .map(({ bucket, result }) => {
        if (!(result instanceof Response)) {
          return null;
        }

        return finding({
          id: `supabase-bucket-${bucket}`,
          checkId: "chk-04-supabase",
          category: "security",
          severity: "high",
          title: `The ${bucket} storage bucket is publicly listable`,
          summary: `A read-only storage listing request for ${bucket} returned HTTP ${result.status}.`,
          whyItMatters:
            "Visitors may discover private uploads and their filenames.",
          exactFix:
            "Make the bucket private and add storage policies that authorize only the intended users.",
          evidence: [
            requestEvidence({
              request: `${projectUrl}/storage/v1/object/list/${encodeURIComponent(
                bucket,
              )}`,
              status: result.status,
              redacted: "listing values not stored",
            }),
          ],
        });
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
    const noTables =
      tables.length === 0
        ? [
            finding({
              id: "supabase-no-tables",
              checkId: "chk-04-supabase",
              category: "security",
              severity: "info",
              title: "No Supabase tables were found to check",
              summary: "The schema response did not list tables.",
              whyItMatters:
                "There was no table list to probe in this read-only audit.",
              exactFix:
                "Confirm the schema endpoint is available and re-run after your tables are deployed.",
              evidence: [
                requestEvidence({
                  request: `GET ${schemaUrl}`,
                  status: schemaResult.response.status,
                }),
              ],
            }),
          ]
        : [];

    return [...initialFindings, ...tableFindings, ...bucketFindings, ...noTables];
  },
};
