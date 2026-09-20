import { APICallError, generateText, Output } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import * as errore from "errore";
import { z } from "zod";

import type {
  Builder,
  Finding,
  ReportProse,
  Scores,
} from "@/lib/audit/types";
import { env } from "@/lib/env";

const reportProseSchema = z.object({
  headline: z.string(),
  verdict: z.string(),
  findings: z.array(
    z.object({
      id: z.string(),
      summary: z.string(),
      whyItMatters: z.string(),
      whatToDo: z.string(),
    }),
  ),
});

function serializeErrorDetail({ value }: { value: unknown }): string | null {
  if (value === null || typeof value === "undefined") {
    return null;
  }

  if (value instanceof Error) {
    return value.message;
  }

  if (typeof value === "string") {
    return value;
  }

  return String(value);
}

function errorDetails({ error }: { error: Error }): {
  cause: string | null;
  responseBody: string | null;
} {
  const responseBody = responseBodyFor({ value: error });

  return {
    cause: serializeErrorDetail({ value: error.cause }),
    responseBody,
  };
}

function responseBodyFor({ value }: { value: unknown }): string | null {
  if (APICallError.isInstance(value)) {
    return value.responseBody ?? null;
  }

  if (value instanceof Error) {
    return responseBodyFor({ value: value.cause });
  }

  return null;
}

function promptFor({
  findings,
  scores,
  builder,
  resolvedUrl,
}: {
  findings: Finding[];
  scores: Scores;
  builder: Builder;
  resolvedUrl: string;
}): string {
  return JSON.stringify({
    instruction: `You are writing for a non-technical founder who built this with ${builder}. Rewrite each finding's summary/whyItMatters/whatToDo in plain English, keep every fact, never invent findings, never change severity, keep ids.`,
    resolvedUrl,
    scores,
    findings: findings.map((finding) => ({
      id: finding.id,
      severity: finding.severity,
      title: finding.title,
      summary: finding.summary,
      whyItMatters: finding.whyItMatters,
      whatToDo: finding.exactFix,
    })),
  });
}

export async function writeReportProse({
  findings,
  scores,
  builder,
  resolvedUrl,
}: {
  findings: Finding[];
  scores: Scores;
  builder: Builder;
  resolvedUrl: string;
}): Promise<ReportProse | Error> {
  if (env.nebiusApiKey === null) {
    return new Error("Nebius is not configured");
  }

  const provider = createOpenAICompatible({
    name: "nebius",
    baseURL: env.nebiusBaseUrl,
    apiKey: env.nebiusApiKey,
    supportsStructuredOutputs: true,
  });
  const generated = await errore.tryAsync({
    try: () =>
      generateText({
        model: provider(env.nebiusModel),
        output: Output.object({ schema: reportProseSchema }),
        prompt: promptFor({ findings, scores, builder, resolvedUrl }),
        temperature: 0.2,
        maxRetries: 1,
        maxOutputTokens: 4000,
      }),
    catch: (cause) =>
      cause instanceof Error ? cause : new Error("Nebius generation failed"),
  });

  if (generated instanceof Error) {
    const details = errorDetails({ error: generated });
    console.warn(
      JSON.stringify({
        event: "nebius_error",
        model: env.nebiusModel,
        message: generated.message,
        cause: details.cause,
        responseBody: details.responseBody,
      }),
    );
    return generated;
  }

  const inputIds = new Set(findings.map((finding) => finding.id));
  const output = generated.output;

  return {
    headline: output.headline,
    verdict: output.verdict,
    findings: output.findings.filter((finding) => inputIds.has(finding.id)),
  };
}
