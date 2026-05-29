import * as errore from "errore";

import {
  InvalidAdvisorRequestError,
  InvalidJsonError,
  isRecord,
} from "@/lib/scan/errors";
import type {
  AdvisorChatMessage,
  AdvisorChatRequest,
  AdvisorFindingContext,
  AdvisorReportRequest,
  AdvisorRunContext,
} from "@/lib/types/advisor";
import type { Confidence, FindingType, MatchLabel, Severity } from "@/lib/types/scan";

export function parseAdvisorChatRequest({
  bodyText,
}: {
  bodyText: string;
}): InvalidAdvisorRequestError | InvalidJsonError | AdvisorChatRequest {
  const parsed = parseJsonBody({ bodyText });

  if (parsed instanceof InvalidJsonError) {
    return parsed;
  }

  const request = parseAdvisorBaseRequest({ value: parsed });

  if (request instanceof Error) {
    return request;
  }

  return request;
}

export function parseAdvisorReportRequest({
  bodyText,
}: {
  bodyText: string;
}): InvalidAdvisorRequestError | InvalidJsonError | AdvisorReportRequest {
  const parsed = parseJsonBody({ bodyText });

  if (parsed instanceof InvalidJsonError) {
    return parsed;
  }

  const request = parseAdvisorBaseRequest({ value: parsed });

  if (request instanceof Error) {
    return request;
  }

  return request;
}

function parseJsonBody({
  bodyText,
}: {
  bodyText: string;
}): InvalidJsonError | unknown {
  const parsed = errore.try({
    try: () => {
      return JSON.parse(bodyText) as unknown;
    },
    catch: (cause) => {
      return new InvalidJsonError({ cause });
    },
  });

  if (parsed instanceof InvalidJsonError) {
    return parsed;
  }

  return parsed;
}

function parseAdvisorBaseRequest({
  value,
}: {
  value: unknown;
}): InvalidAdvisorRequestError | AdvisorChatRequest {
  if (!isRecord(value)) {
    return invalidAdvisorRequest({
      field: "body",
      reason: "expected an object",
    });
  }

  const question = value.question;
  const messages = value.messages;
  const runs = value.runs;

  if (typeof question !== "string" || question.trim().length === 0) {
    return invalidAdvisorRequest({
      field: "question",
      reason: "expected a non-empty question",
    });
  }

  if (!isAdvisorChatMessageList(messages)) {
    return invalidAdvisorRequest({
      field: "messages",
      reason: "expected chat messages",
    });
  }

  if (!isAdvisorRunContextList(runs)) {
    return invalidAdvisorRequest({
      field: "runs",
      reason: "expected completed scan context",
    });
  }

  return {
    messages,
    question: question.trim(),
    runs,
  };
}

function invalidAdvisorRequest({
  field,
  reason,
}: {
  field: string;
  reason: string;
}): InvalidAdvisorRequestError {
  return new InvalidAdvisorRequestError({ field, reason });
}

function isAdvisorChatMessageList(
  value: unknown
): value is AdvisorChatMessage[] {
  if (!Array.isArray(value)) {
    return false;
  }

  return value.every((message) => {
    if (!isRecord(message)) {
      return false;
    }

    return (
      (message.role === "user" || message.role === "assistant") &&
      typeof message.content === "string"
    );
  });
}

function isAdvisorRunContextList(value: unknown): value is AdvisorRunContext[] {
  if (!Array.isArray(value)) {
    return false;
  }

  return value.every((run) => {
    return isAdvisorRunContext(run);
  });
}

function isAdvisorRunContext(value: unknown): value is AdvisorRunContext {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.runId === "string" &&
    typeof value.repoLabel === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.scanId === "string" &&
    typeof value.scannedAt === "string" &&
    typeof value.topAction === "string" &&
    isAdvisorSummary(value.summary) &&
    isAdvisorStack(value.stack) &&
    isAdvisorFindingContextList(value.findings)
  );
}

function isAdvisorSummary(
  value: unknown
): value is AdvisorRunContext["summary"] {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.totalFindings === "number" &&
    typeof value.critical === "number" &&
    typeof value.high === "number" &&
    typeof value.medium === "number" &&
    typeof value.low === "number" &&
    typeof value.info === "number"
  );
}

function isAdvisorStack(value: unknown): value is AdvisorRunContext["stack"] {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isStringArray(value.dependencies) &&
    isStringArray(value.frameworks) &&
    isStringArray(value.packageManagers) &&
    isStringArray(value.vendors)
  );
}

function isAdvisorFindingContextList(
  value: unknown
): value is AdvisorFindingContext[] {
  if (!Array.isArray(value)) {
    return false;
  }

  return value.every((finding) => {
    return isAdvisorFindingContext(finding);
  });
}

function isAdvisorFindingContext(
  value: unknown
): value is AdvisorFindingContext {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    isFindingType(value.type) &&
    typeof value.title === "string" &&
    typeof value.affectedDependency === "string" &&
    (value.installedVersion === null ||
      typeof value.installedVersion === "string") &&
    isSeverity(value.severity) &&
    isConfidence(value.confidence) &&
    isMatchLabel(value.matchLabel) &&
    typeof value.recommendedAction === "string" &&
    isAdvisorEvidenceList(value.evidence)
  );
}

function isAdvisorEvidenceList(
  value: unknown
): value is AdvisorFindingContext["evidence"] {
  if (!Array.isArray(value)) {
    return false;
  }

  return value.every((evidence) => {
    if (!isRecord(evidence)) {
      return false;
    }

    return (
      typeof evidence.sourceName === "string" &&
      typeof evidence.url === "string" &&
      typeof evidence.summary === "string"
    );
  });
}

function isStringArray(value: unknown): value is string[] {
  if (!Array.isArray(value)) {
    return false;
  }

  return value.every((item) => {
    return typeof item === "string";
  });
}

function isFindingType(value: unknown): value is FindingType {
  return (
    value === "cve" ||
    value === "security_advisory" ||
    value === "exploit_chatter" ||
    value === "vendor_deprecation" ||
    value === "breaking_release"
  );
}

function isSeverity(value: unknown): value is Severity {
  return (
    value === "critical" ||
    value === "high" ||
    value === "medium" ||
    value === "low" ||
    value === "info"
  );
}

function isConfidence(value: unknown): value is Confidence {
  return value === "high" || value === "medium" || value === "low";
}

function isMatchLabel(value: unknown): value is MatchLabel {
  return (
    value === "confirmed_match" ||
    value === "possible_match" ||
    value === "stack_level_risk" ||
    value === "not_applicable"
  );
}
