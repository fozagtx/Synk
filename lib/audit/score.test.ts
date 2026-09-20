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
});
