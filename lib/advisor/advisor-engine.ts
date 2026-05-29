import { generateText, type LanguageModel } from "ai";
import * as errore from "errore";
import dedent from "string-dedent";

import { getCveSorterModel } from "@/lib/agent/aiml-api";
import {
  AIProviderCallError,
  AIProviderConfigurationError,
  AIProviderResponseShapeError,
} from "@/lib/scan/errors";
import type {
  AdvisorChatMessage,
  AdvisorRunContext,
} from "@/lib/types/advisor";

export interface AdvisorAnswer {
  answer: string;
}

export interface AdvisorReport {
  reportMarkdown: string;
  reportTitle: string;
}

const MAX_CONTEXT_RUNS = 6;
const MAX_CONTEXT_FINDINGS_PER_RUN = 8;
const MAX_MESSAGES = 8;
const ADVISOR_CHAT_OPERATION = "generate advisor answer";
const ADVISOR_REPORT_OPERATION = "generate advisor report";

export async function generateAdvisorAnswer({
  messages,
  question,
  runs,
}: {
  messages: AdvisorChatMessage[];
  question: string;
  runs: AdvisorRunContext[];
}): Promise<
  | AIProviderCallError
  | AIProviderConfigurationError
  | AIProviderResponseShapeError
  | AdvisorAnswer
> {
  const model = getCveSorterModel();

  if (model instanceof Error) {
    return model;
  }

  return generateAdvisorText({
    maxOutputTokens: 1400,
    model,
    operation: ADVISOR_CHAT_OPERATION,
    prompt: buildAdvisorAnswerPrompt({ messages, question, runs }),
  });
}

export async function generateAdvisorReport({
  messages,
  question,
  runs,
}: {
  messages: AdvisorChatMessage[];
  question: string;
  runs: AdvisorRunContext[];
}): Promise<
  | AIProviderCallError
  | AIProviderConfigurationError
  | AIProviderResponseShapeError
  | AdvisorReport
> {
  const model = getCveSorterModel();

  if (model instanceof Error) {
    return model;
  }

  const generated = await generateAdvisorText({
    maxOutputTokens: 4200,
    model,
    operation: ADVISOR_REPORT_OPERATION,
    prompt: buildAdvisorReportPrompt({ messages, question, runs }),
  });

  if (generated instanceof Error) {
    return generated;
  }

  const reportMarkdown: string = generated.answer.trim();

  if (reportMarkdown.length === 0) {
    return new AIProviderResponseShapeError({
      operation: ADVISOR_REPORT_OPERATION,
      reason: "empty report markdown",
    });
  }

  return {
    reportMarkdown,
    reportTitle: buildReportTitle({ runs }),
  };
}

async function generateAdvisorText({
  maxOutputTokens,
  model,
  operation,
  prompt,
}: {
  maxOutputTokens: number;
  model: LanguageModel;
  operation: string;
  prompt: string;
}): Promise<AIProviderCallError | AIProviderResponseShapeError | AdvisorAnswer> {
  const result = await errore.tryAsync({
    try: () => {
      return generateText({
        maxOutputTokens,
        maxRetries: 2,
        model,
        prompt,
        temperature: 0.2,
      });
    },
    catch: (cause) => {
      return new AIProviderCallError({
        operation,
        cause,
      });
    },
  });

  if (result instanceof Error) {
    return result;
  }

  const answer: string = result.text.trim();

  if (answer.length === 0) {
    return new AIProviderResponseShapeError({
      operation,
      reason: "empty answer",
    });
  }

  return {
    answer,
  };
}

function buildAdvisorAnswerPrompt({
  messages,
  question,
  runs,
}: {
  messages: AdvisorChatMessage[];
  question: string;
  runs: AdvisorRunContext[];
}): string {
  const markdown = dedent;

  return markdown`
    You are Synk Advisor for SRE, platform, and security teams.

    Use only the supplied scan memory below. If the user asks for something not covered by scan memory, say what is missing and what scan would be needed.

    Give practical advice:
    - Explain what should be handled first.
    - Explain how to reduce the chance of exploitation or outage.
    - Mention safer alternatives when a dependency, vendor feature, or API looks risky.
    - Cover CVEs, exploit chatter, vendor deprecations, and breaking releases when relevant.
    - Keep the answer direct and operational.

    User question:
    ${question}

    Recent chat:
    ${formatAdvisorMessages({ messages })}

    Past scan memory:
    ${formatAdvisorRuns({ runs })}
  `;
}

function buildAdvisorReportPrompt({
  messages,
  question,
  runs,
}: {
  messages: AdvisorChatMessage[];
  question: string;
  runs: AdvisorRunContext[];
}): string {
  const markdown = dedent;

  return markdown`
    You are Synk Advisor creating a dev-team README report from prior Synk scan findings.

    Return Markdown only. Do not wrap it in code fences.

    The report must use this structure:
    # Synk Risk Report

    ## Executive Summary
    ## Priority Findings
    ## Recommended Engineering Plan
    ## Safer Alternatives
    ## Deprecation And Release Notes
    ## Evidence
    ## Dev Team Prompt

    Requirements:
    - Base the report only on supplied scan memory.
    - Include concrete package/vendor names, versions, severity, evidence URLs, and recommended actions when present.
    - For weak evidence, say it is weak. Do not turn search chatter into confirmed exploitation.
    - The Dev Team Prompt must be paste-ready for a coding IDE.
    - Keep it useful as a README handed to engineers.

    User request:
    ${question}

    Recent chat:
    ${formatAdvisorMessages({ messages })}

    Past scan memory:
    ${formatAdvisorRuns({ runs })}
  `;
}

function formatAdvisorMessages({
  messages,
}: {
  messages: AdvisorChatMessage[];
}): string {
  const formattedMessages: string = messages
    .slice(-MAX_MESSAGES)
    .map((message) => {
      return `- ${message.role}: ${message.content}`;
    })
    .join("\n");

  if (formattedMessages.length === 0) {
    return "- No prior chat messages in this Advisor session.";
  }

  return formattedMessages;
}

function formatAdvisorRuns({ runs }: { runs: AdvisorRunContext[] }): string {
  const formattedRuns: string = runs
    .slice(0, MAX_CONTEXT_RUNS)
    .map((run) => {
      const findingLines: string = run.findings
        .slice(0, MAX_CONTEXT_FINDINGS_PER_RUN)
        .map((finding) => {
          const evidenceLines: string = finding.evidence
            .slice(0, 3)
            .map((evidence) => {
              return `      - ${evidence.sourceName}: ${evidence.summary} (${evidence.url})`;
            })
            .join("\n");
          const installedVersion: string =
            finding.installedVersion ?? "unknown version";

          return dedent`
            - ${finding.severity} ${finding.type}: ${finding.title}
              Dependency/vendor: ${finding.affectedDependency} @ ${installedVersion}
              Confidence: ${finding.confidence}
              Match: ${finding.matchLabel}
              Recommended action: ${finding.recommendedAction}
              Evidence:
          ${evidenceLines || "      - No evidence URL supplied."}
          `.trim();
        })
        .join("\n");

      return dedent`
        Repo: ${run.repoLabel}
        Run: ${run.runId}
        Scan: ${run.scanId}
        Created: ${run.createdAt}
        Scanned: ${run.scannedAt}
        Summary: ${run.summary.totalFindings} total, ${run.summary.critical} critical, ${run.summary.high} high, ${run.summary.medium} medium
        Top action: ${run.topAction}
        Dependencies: ${run.stack.dependencies.join(", ") || "none detected"}
        Frameworks: ${run.stack.frameworks.join(", ") || "none detected"}
        Package managers: ${run.stack.packageManagers.join(", ") || "none detected"}
        Vendors: ${run.stack.vendors.join(", ") || "none detected"}
        Findings:
        ${findingLines || "- No findings supplied."}
      `.trim();
    })
    .join("\n\n---\n\n");

  if (formattedRuns.length === 0) {
    return "No completed scan memory was supplied.";
  }

  return formattedRuns;
}

function buildReportTitle({ runs }: { runs: AdvisorRunContext[] }): string {
  const firstRun: AdvisorRunContext | undefined = runs[0];

  if (!firstRun) {
    return "Synk Risk Report";
  }

  return `Synk Risk Report - ${firstRun.repoLabel}`;
}
