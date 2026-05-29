import * as errore from "errore";

export class InvalidJsonError extends errore.createTaggedError({
  name: "InvalidJsonError",
  message: "Request body is not valid JSON",
}) {}

export class InvalidScanRequestError extends errore.createTaggedError({
  name: "InvalidScanRequestError",
  message: "$field is invalid: $reason",
}) {}

export class InvalidAdvisorRequestError extends errore.createTaggedError({
  name: "InvalidAdvisorRequestError",
  message: "$field is invalid: $reason",
}) {}

export class UnsupportedGithubUrlError extends errore.createTaggedError({
  name: "UnsupportedGithubUrlError",
  message: "Unsupported GitHub repository URL: $githubUrl",
}) {}

export class RemoteFetchError extends errore.createTaggedError({
  name: "RemoteFetchError",
  message: "$operation failed for $url",
}) {}

export class RemoteResponseError extends errore.createTaggedError({
  name: "RemoteResponseError",
  message: "$operation returned HTTP $status for $url: $body",
}) {}

export class RemoteConfigurationError extends errore.createTaggedError({
  name: "RemoteConfigurationError",
  message: "$provider is misconfigured: $reason",
}) {}

export class RemoteJsonShapeError extends errore.createTaggedError({
  name: "RemoteJsonShapeError",
  message: "$operation returned an unsupported response shape for $url",
}) {}

export class NoManifestFilesError extends errore.createTaggedError({
  name: "NoManifestFilesError",
  message: "No supported dependency manifests were found for $repo",
}) {}

export class AIProviderConfigurationError extends errore.createTaggedError({
  name: "AIProviderConfigurationError",
  message: "AI provider is not configured: $missing",
}) {}

export class AIProviderCallError extends errore.createTaggedError({
  name: "AIProviderCallError",
  message: "AI provider failed while running $operation",
}) {}

export class AIProviderResponseShapeError extends errore.createTaggedError({
  name: "AIProviderResponseShapeError",
  message: "AI provider returned an invalid response for $operation: $reason",
}) {}

export class VoiceProviderConfigurationError extends errore.createTaggedError({
  name: "VoiceProviderConfigurationError",
  message: "Voice transcription provider is not configured: $missing",
}) {}

export class InvalidVoiceRequestError extends errore.createTaggedError({
  name: "InvalidVoiceRequestError",
  message: "Voice transcription request is invalid: $reason",
}) {}

export class VoiceTranscriptionTimeoutError extends errore.createTaggedError({
  name: "VoiceTranscriptionTimeoutError",
  message:
    "Voice transcription did not finish after $attempts status checks for job $jobId",
}) {}

export class WorkflowProviderConfigurationError extends errore.createTaggedError({
  name: "WorkflowProviderConfigurationError",
  message: "$provider is not configured: $missing",
}) {}

export class WorkflowAuthenticationError extends errore.createTaggedError({
  name: "WorkflowAuthenticationError",
  message: "Event workflow request is not authorized: $reason",
}) {}

export class InvalidWorkflowEventError extends errore.createTaggedError({
  name: "InvalidWorkflowEventError",
  message: "Event workflow payload is invalid: $reason",
}) {}

export type ScanError =
  | InvalidJsonError
  | InvalidScanRequestError
  | InvalidAdvisorRequestError
  | UnsupportedGithubUrlError
  | RemoteConfigurationError
  | RemoteFetchError
  | RemoteResponseError
  | RemoteJsonShapeError
  | NoManifestFilesError
  | AIProviderConfigurationError
  | AIProviderCallError
  | AIProviderResponseShapeError
  | VoiceProviderConfigurationError
  | InvalidVoiceRequestError
  | VoiceTranscriptionTimeoutError
  | WorkflowProviderConfigurationError
  | WorkflowAuthenticationError
  | InvalidWorkflowEventError;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function toErrorCode(error: Error): string {
  if (errore.isTaggedError(error)) {
    return error._tag;
  }

  return error.name || "UnknownError";
}
