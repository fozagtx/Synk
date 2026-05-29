import { generateText, Output, type LanguageModel } from "ai";
import * as errore from "errore";
import dedent from "string-dedent";

import { getCveSorterModel } from "@/lib/agent/aiml-api";
import {
  AIProviderCallError,
  AIProviderConfigurationError,
  AIProviderResponseShapeError,
} from "@/lib/scan/errors";
import type {
  Confidence,
  DetectedStack,
  Finding,
  FindingType,
  MatchLabel,
  Severity,
} from "@/lib/types/scan";

interface NormalizedFindingPatch {
  id: string;
  type: FindingType;
  title: string;
  severity: Severity;
  confidence: Confidence;
  matchLabel: MatchLabel;
  recommendedAction: string;
  evidenceSummary: string;
}

interface NormalizedFindingsOutput {
  findings: NormalizedFindingPatch[];
}

type AiValidationResult<T> =
  | {
      success: true;
      value: T;
    }
  | {
      error: AIProviderResponseShapeError;
      success: false;
    };

const AI_NORMALIZATION_OPERATION = "normalize scan evidence";
const AI_NORMALIZATION_BATCH_SIZE = 5;
const MAX_EVIDENCE_PER_FINDING = 3;
const MAX_EVIDENCE_SUMMARY_LENGTH = 500;
const SEVERITY_SCORE: Record<Severity, number> = {
  critical: 50,
  high: 40,
  medium: 30,
  low: 20,
  info: 10,
};
const CONFIDENCE_SCORE: Record<Confidence, number> = {
  high: 6,
  medium: 3,
  low: 0,
};
const MATCH_SCORE: Record<MatchLabel, number> = {
  confirmed_match: 10,
  possible_match: 5,
  stack_level_risk: 0,
  not_applicable: -100,
};
export async function normalizeFindingsWithAI({
  findings,
  scannedAt,
  stack,
}: {
  findings: Finding[];
  scannedAt: string;
  stack: DetectedStack;
}): Promise<
  | AIProviderCallError
  | AIProviderConfigurationError
  | AIProviderResponseShapeError
  | Finding[]
> {
  if (findings.length === 0) {
    return [];
  }

  const model = getCveSorterModel();

  if (model instanceof Error) {
    return model;
  }

  const findingBatches: Finding[][] = chunkFindings({
    findings,
    size: AI_NORMALIZATION_BATCH_SIZE,
  });
  const batchResults = await Promise.all(
    findingBatches.map((batchFindings) => {
      return normalizeFindingBatchWithAI({
        findings: batchFindings,
        model,
        scannedAt,
        stack,
      });
    })
  );
  const firstError:
    | AIProviderCallError
    | AIProviderResponseShapeError
    | Finding[]
    | undefined = batchResults.find((result) => {
    return result instanceof Error;
  });

  if (firstError instanceof Error) {
    return firstError;
  }

  return batchResults.filter(isFindingArray).flat();
}

async function normalizeFindingBatchWithAI({
  findings,
  model,
  scannedAt,
  stack,
}: {
  findings: Finding[];
  model: LanguageModel;
  scannedAt: string;
  stack: DetectedStack;
}): Promise<AIProviderCallError | AIProviderResponseShapeError | Finding[]> {
  const prompt: string = buildNormalizationPrompt({
    findings,
    scannedAt,
    stack,
  });
  const result = await errore.tryAsync({
    try: () => {
      return generateText({
        maxOutputTokens: 5000,
        maxRetries: 2,
        model,
        output: Output.json({
          description:
            "Normalized Synk risk findings grounded only in the supplied stack facts and evidence URLs.",
          name: "SynkNormalizedFindings",
        }),
        prompt,
        temperature: 0,
      });
    },
    catch: (cause) => {
      return new AIProviderCallError({
        operation: AI_NORMALIZATION_OPERATION,
        cause,
      });
    },
  });

  if (result instanceof Error) {
    return result;
  }

  const validatedOutput = validateNormalizedFindingsOutput(result.output);

  if (!validatedOutput.success) {
    return validatedOutput.error;
  }

  return reconcileNormalizedFindings({
    findings,
    output: validatedOutput.value,
  });
}

function buildNormalizationPrompt({
  findings,
  scannedAt,
  stack,
}: {
  findings: Finding[];
  scannedAt: string;
  stack: DetectedStack;
}): string {
  const markdown = dedent;
  const payload = {
    scannedAt,
    stack: {
      dependencies: stack.dependencies.slice(0, 40).map((dependency) => {
        return {
          ecosystem: dependency.ecosystem,
          name: dependency.name,
          scope: dependency.scope,
          sourceFile: dependency.sourceFile,
          version: dependency.version,
        };
      }),
      frameworks: stack.frameworks,
      languages: stack.languages,
      packageManagers: stack.packageManagers,
      repo: stack.repo,
      vendors: stack.vendors,
    },
    findings: findings.map((finding) => {
      return {
        affectedDependency: finding.affectedDependency,
        confidence: finding.confidence,
        evidence: finding.evidence
          .slice(0, MAX_EVIDENCE_PER_FINDING)
          .map((evidence) => {
            return {
              sourceName: evidence.sourceName,
              sourceType: evidence.sourceType,
              summary: trimForPrompt({
                value: evidence.summary,
              }),
              url: evidence.url,
            };
          }),
        id: finding.id,
        installedVersion: finding.installedVersion,
        matchLabel: finding.matchLabel,
        recommendedAction: finding.recommendedAction,
        severity: finding.severity,
        title: finding.title,
        type: finding.type,
      };
    }),
  };

  return markdown`
    You are Synk's evidence normalizer for SRE, platform, and security teams.

    Return exactly ${findings.length} finding object${findings.length === 1 ? "" : "s"}.
    Return exactly one object for every supplied finding id. Do not add new ids. Do not remove ids.
    If a finding is weak or irrelevant, still return it and set matchLabel to "not_applicable".
    This output is machine validated and will be rejected unless every supplied id appears exactly once.

    Return only this JSON shape:
    {
      "findings": [
        {
          "id": "same supplied id",
          "type": "cve | security_advisory | exploit_chatter | vendor_deprecation | breaking_release",
          "title": "short title",
          "severity": "critical | high | medium | low | info",
          "confidence": "high | medium | low",
          "matchLabel": "confirmed_match | possible_match | stack_level_risk | not_applicable",
          "recommendedAction": "concrete next action",
          "evidenceSummary": "one short sentence grounded in supplied evidence"
        }
      ]
    }

    Ground rules:
    - Use only the supplied stack facts and evidence URLs.
    - Do not invent CVE ids, package versions, advisory URLs, affected packages, or exploitation claims.
    - If evidence is weak, set matchLabel to "possible_match" or "stack_level_risk" and keep confidence low or medium.
    - If the evidence does not apply to this stack item, set matchLabel to "not_applicable".
    - Keep vendor deprecations and breaking releases framed as operational risk unless the evidence explicitly states security exposure.
    - recommendedAction must be concrete enough for an engineer to act on.
    - evidenceSummary must be one short sentence explaining what the supplied evidence supports.

    Normalize this payload:

    ${JSON.stringify(payload)}
  `;
}

function chunkFindings({
  findings,
  size,
}: {
  findings: Finding[];
  size: number;
}): Finding[][] {
  const chunkCount: number = Math.ceil(findings.length / size);
  const chunkIndexes: number[] = Array.from({ length: chunkCount }).map(
    (_value, index) => {
      return index;
    }
  );

  return chunkIndexes.map((index) => {
    const start: number = index * size;
    return findings.slice(start, start + size);
  });
}

function isFindingArray(value: unknown): value is Finding[] {
  return Array.isArray(value);
}

function reconcileNormalizedFindings({
  findings,
  output,
}: {
  findings: Finding[];
  output: NormalizedFindingsOutput;
}): AIProviderResponseShapeError | Finding[] {
  if (output.findings.length !== findings.length) {
    return invalidAIShape({
      reason: `expected ${findings.length} findings but received ${output.findings.length}`,
    });
  }

  const patchesById = output.findings.reduce(
    (accumulator, patch) => {
      return {
        ...accumulator,
        [patch.id]: patch,
      };
    },
    {} as Record<string, NormalizedFindingPatch>
  );
  const uniquePatchIds: string[] = Object.keys(patchesById);

  if (uniquePatchIds.length !== output.findings.length) {
    return invalidAIShape({ reason: "duplicate finding ids returned" });
  }

  const unknownPatchId: string | undefined = uniquePatchIds.find((patchId) => {
    return !findings.some((finding) => {
      return finding.id === patchId;
    });
  });

  if (unknownPatchId) {
    return invalidAIShape({
      reason: `unknown finding id returned: ${unknownPatchId}`,
    });
  }

  return findings.map((finding) => {
    const patch: NormalizedFindingPatch | undefined = patchesById[finding.id];

    if (!patch) {
      return finding;
    }

    return {
      ...finding,
      confidence: patch.confidence,
      evidence: finding.evidence.map((evidence) => {
        return {
          ...evidence,
          summary: truncateEvidenceSummary({ value: patch.evidenceSummary }),
        };
      }),
      matchLabel: patch.matchLabel,
      recommendedAction: patch.recommendedAction.trim(),
      score: normalizedScore({
        confidence: patch.confidence,
        hasVersion: Boolean(finding.installedVersion),
        matchLabel: patch.matchLabel,
        severity: patch.severity,
      }),
      severity: patch.severity,
      title: patch.title.trim(),
      type: patch.type,
    };
  });
}

function validateNormalizedFindingsOutput(
  value: unknown
): AiValidationResult<NormalizedFindingsOutput> {
  if (!isRecord(value)) {
    return invalidAIValidation({ reason: "root value is not an object" });
  }

  const findings = value.findings;

  if (!Array.isArray(findings)) {
    return invalidAIValidation({ reason: "findings is not an array" });
  }

  if (!findings.every(isNormalizedFindingPatch)) {
    return invalidAIValidation({
      reason: "one or more normalized findings are invalid",
    });
  }

  return {
    success: true,
    value: {
      findings,
    },
  };
}

function isNormalizedFindingPatch(
  value: unknown
): value is NormalizedFindingPatch {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    isFindingTypeValue(value.type) &&
    typeof value.title === "string" &&
    isSeverityValue(value.severity) &&
    isConfidenceValue(value.confidence) &&
    isMatchLabelValue(value.matchLabel) &&
    typeof value.recommendedAction === "string" &&
    typeof value.evidenceSummary === "string" &&
    value.id.trim().length > 0 &&
    value.title.trim().length > 0 &&
    value.recommendedAction.trim().length > 0 &&
    value.evidenceSummary.trim().length > 0
  );
}

function invalidAIValidation({
  reason,
}: {
  reason: string;
}): AiValidationResult<NormalizedFindingsOutput> {
  return {
    error: invalidAIShape({ reason }),
    success: false,
  };
}

function invalidAIShape({
  reason,
}: {
  reason: string;
}): AIProviderResponseShapeError {
  return new AIProviderResponseShapeError({
    operation: AI_NORMALIZATION_OPERATION,
    reason,
  });
}

function normalizedScore({
  confidence,
  hasVersion,
  matchLabel,
  severity,
}: {
  confidence: Confidence;
  hasVersion: boolean;
  matchLabel: MatchLabel;
  severity: Severity;
}): number {
  const versionScore: number = hasVersion ? 8 : 0;

  return (
    SEVERITY_SCORE[severity] +
    CONFIDENCE_SCORE[confidence] +
    MATCH_SCORE[matchLabel] +
    versionScore
  );
}

function truncateEvidenceSummary({ value }: { value: string }): string {
  return value.trim().replace(/\s+/g, " ").slice(0, MAX_EVIDENCE_SUMMARY_LENGTH);
}

function trimForPrompt({ value }: { value: string }): string {
  return value.trim().replace(/\s+/g, " ").slice(0, 260);
}

function isFindingTypeValue(value: unknown): value is FindingType {
  return (
    value === "cve" ||
    value === "security_advisory" ||
    value === "exploit_chatter" ||
    value === "vendor_deprecation" ||
    value === "breaking_release"
  );
}

function isSeverityValue(value: unknown): value is Severity {
  return (
    value === "critical" ||
    value === "high" ||
    value === "medium" ||
    value === "low" ||
    value === "info"
  );
}

function isConfidenceValue(value: unknown): value is Confidence {
  return value === "high" || value === "medium" || value === "low";
}

function isMatchLabelValue(value: unknown): value is MatchLabel {
  return (
    value === "confirmed_match" ||
    value === "possible_match" ||
    value === "stack_level_risk" ||
    value === "not_applicable"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
