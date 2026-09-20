import { describe, expect, test } from "vitest";
import { scoreFindings } from "./score";
import type { Finding } from "./types";

describe("scoreFindings", () => {
  test("applies deterministic category penalties and launch blocking", () => {
    const findings: Finding[] = [{
      id: "one",
      checkId: "check",
      category: "security",
      severity: "blocker",
      title: "Exposed data",
      summary: "A row is readable.",
      whyItMatters: "Privacy risk.",
      exactFix: "Enable RLS.",
      evidence: [],
    }];
    expect(scoreFindings({ findings })).toEqual({
      deploy: 100,
      seo: 100,
      perf: 100,
      security: 60,
      hygiene: 100,
      overall: 92,
      launchBlocked: true,
    });
  });

  test("marks unavailable-only categories as unchecked", () => {
    const findings: Finding[] = [{
      id: "chk-04-supabase-unavailable",
      checkId: "chk-04-supabase",
      category: "security",
      severity: "info",
      title: "Supabase tables could not be checked",
      summary: "The schema request was unavailable.",
      whyItMatters: "No conclusion is safe.",
      exactFix: "Run the audit again.",
      evidence: [],
    }];

    expect(scoreFindings({ findings })).toEqual({
      deploy: 100,
      seo: 100,
      perf: 100,
      security: null,
      hygiene: 100,
      overall: 100,
      launchBlocked: false,
    });
  });
});
