import * as errore from "errore";

export class InvalidJsonError extends errore.createTaggedError({
  name: "InvalidJsonError",
  message: "Request body is not valid JSON",
}) {}

export class InvalidAuditRequestError extends errore.createTaggedError({
  name: "InvalidAuditRequestError",
  message: "$field is invalid: $reason",
}) {}

export class RemoteFetchError extends errore.createTaggedError({
  name: "RemoteFetchError",
  message: "$operation failed for $url",
}) {}

export class RemoteResponseError extends errore.createTaggedError({
  name: "RemoteResponseError",
  message: "$operation returned HTTP $status for $url: $body",
}) {}

export class RemoteJsonShapeError extends errore.createTaggedError({
  name: "RemoteJsonShapeError",
  message: "$operation returned an unsupported response shape for $url",
}) {}

export class FirecrawlRequestError extends errore.createTaggedError({
  name: "FirecrawlRequestError",
  message: "Firecrawl request failed for $url: $reason",
}) {}

export class FirecrawlResponseError extends errore.createTaggedError({
  name: "FirecrawlResponseError",
  message: "Firecrawl returned HTTP $status for $url: $body",
}) {}

export class FirecrawlResponseShapeError extends errore.createTaggedError({
  name: "FirecrawlResponseShapeError",
  message: "Firecrawl returned an unsupported response for $url",
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

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function toErrorCode(error: Error): string {
  if (errore.isTaggedError(error)) {
    return error._tag;
  }
  return error.name || "UnknownError";
}
