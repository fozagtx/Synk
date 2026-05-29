import type {
  Confidence,
  FindingType,
  MatchLabel,
  Severity,
} from "@/lib/types/scan";

export type AdvisorMessageRole = "user" | "assistant";

export interface AdvisorChatMessage {
  role: AdvisorMessageRole;
  content: string;
}

export interface AdvisorFindingContext {
  id: string;
  type: FindingType;
  title: string;
  affectedDependency: string;
  installedVersion: string | null;
  severity: Severity;
  confidence: Confidence;
  matchLabel: MatchLabel;
  recommendedAction: string;
  evidence: Array<{
    sourceName: string;
    url: string;
    summary: string;
  }>;
}

export interface AdvisorRunContext {
  runId: string;
  repoLabel: string;
  createdAt: string;
  scanId: string;
  scannedAt: string;
  topAction: string;
  summary: {
    totalFindings: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
  stack: {
    dependencies: string[];
    frameworks: string[];
    packageManagers: string[];
    vendors: string[];
  };
  findings: AdvisorFindingContext[];
}

export interface AdvisorChatRequest {
  question: string;
  messages: AdvisorChatMessage[];
  runs: AdvisorRunContext[];
}

export interface AdvisorReportRequest {
  question: string;
  messages: AdvisorChatMessage[];
  runs: AdvisorRunContext[];
}

export interface AdvisorChatSuccessResponse {
  ok: true;
  answer: string;
}

export interface AdvisorReportSuccessResponse {
  ok: true;
  reportMarkdown: string;
  reportTitle: string;
}

export interface AdvisorFailureResponse {
  ok: false;
  error: {
    code: string;
    message: string;
  };
}

export type AdvisorChatApiResponse =
  | AdvisorChatSuccessResponse
  | AdvisorFailureResponse;

export type AdvisorReportApiResponse =
  | AdvisorReportSuccessResponse
  | AdvisorFailureResponse;
