import * as errore from "errore";

import { env } from "@/lib/env";
import {
  RemoteFetchError,
  RemoteJsonShapeError,
  RemoteResponseError,
  VoiceProviderConfigurationError,
  VoiceTranscriptionTimeoutError,
  isRecord,
} from "@/lib/scan/errors";

export interface SpeechmaticsConfig {
  apiKey: string;
  batchBaseUrl: string;
  realtimeUrl: string;
}

interface SpeechmaticsTranscriptionConfig {
  type: "transcription";
  transcription_config: {
    language: "en";
    operating_point: "standard";
  };
}

type SpeechmaticsJobStatus = "running" | "done" | "rejected";

interface SpeechmaticsJobStatusDetails {
  id: string;
  status: SpeechmaticsJobStatus;
  errors: string[];
}

type SpeechmaticsTranscriptionError =
  | RemoteFetchError
  | RemoteJsonShapeError
  | RemoteResponseError
  | VoiceProviderConfigurationError
  | VoiceTranscriptionTimeoutError;

export function getSpeechmaticsConfig():
  | SpeechmaticsConfig
  | VoiceProviderConfigurationError {
  if (!env.speechmaticsApiKey) {
    return new VoiceProviderConfigurationError({
      missing: "SPEECHMATICS_API_KEY",
    });
  }

  return {
    apiKey: env.speechmaticsApiKey,
    batchBaseUrl: env.speechmaticsBatchBaseUrl,
    realtimeUrl: env.speechmaticsRealtimeUrl,
  };
}

export async function transcribeWithSpeechmatics({
  audio,
  pollAttempts,
  pollDelayMs,
}: {
  audio: File;
  pollAttempts: number;
  pollDelayMs: number;
}): Promise<SpeechmaticsTranscriptionError | string> {
  const config = getSpeechmaticsConfig();

  if (config instanceof Error) {
    return config;
  }

  const jobId = await createSpeechmaticsJob({
    audio,
    config,
    transcriptionConfig: createTranscriptionConfig(),
  });

  if (jobId instanceof Error) {
    return jobId;
  }

  const completion = await waitForSpeechmaticsJob({
    config,
    jobId,
    pollAttempts,
    pollDelayMs,
  });

  if (completion instanceof Error) {
    return completion;
  }

  if (completion.status === "rejected") {
    return new RemoteResponseError({
      operation: "Speechmatics job status",
      status: "rejected",
      url: buildSpeechmaticsUrl({
        baseUrl: config.batchBaseUrl,
        path: `jobs/${jobId}`,
      }),
      body: completion.errors.join("; "),
    });
  }

  return getSpeechmaticsTranscript({
    config,
    jobId,
  });
}

function createTranscriptionConfig(): SpeechmaticsTranscriptionConfig {
  return {
    type: "transcription",
    transcription_config: {
      language: "en",
      operating_point: "standard",
    },
  };
}

async function createSpeechmaticsJob({
  audio,
  config,
  transcriptionConfig,
}: {
  audio: File;
  config: SpeechmaticsConfig;
  transcriptionConfig: SpeechmaticsTranscriptionConfig;
}): Promise<RemoteFetchError | RemoteJsonShapeError | RemoteResponseError | string> {
  const url: string = buildSpeechmaticsUrl({
    baseUrl: config.batchBaseUrl,
    path: "jobs/",
  });
  const formData = new FormData();
  formData.set("data_file", audio, audio.name);
  formData.set("config", JSON.stringify(transcriptionConfig));

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: formData,
  }).catch((cause) => {
    return new RemoteFetchError({
      operation: "Speechmatics create job",
      url,
      cause,
    });
  });

  if (response instanceof Error) {
    return response;
  }

  const bodyText = await readResponseText({
    operation: "Speechmatics create job",
    response,
    url,
  });

  if (bodyText instanceof Error) {
    return bodyText;
  }

  if (!response.ok) {
    return new RemoteResponseError({
      operation: "Speechmatics create job",
      status: response.status,
      url,
      body: bodyText,
    });
  }

  const parsed = parseJsonRecord({
    bodyText,
    operation: "Speechmatics create job",
    url,
  });

  if (parsed instanceof Error) {
    return parsed;
  }

  return readJobId({
    operation: "Speechmatics create job",
    value: parsed,
    url,
  });
}

async function waitForSpeechmaticsJob({
  config,
  jobId,
  pollAttempts,
  pollDelayMs,
}: {
  config: SpeechmaticsConfig;
  jobId: string;
  pollAttempts: number;
  pollDelayMs: number;
}): Promise<
  | RemoteFetchError
  | RemoteJsonShapeError
  | RemoteResponseError
  | VoiceTranscriptionTimeoutError
  | SpeechmaticsJobStatusDetails
> {
  const attemptIndexes: number[] = Array.from(
    { length: pollAttempts },
    (_item, index) => {
      return index;
    }
  );

  const finishedJobs = await attemptIndexes.reduce<
    Promise<
      | RemoteFetchError
      | RemoteJsonShapeError
      | RemoteResponseError
      | SpeechmaticsJobStatusDetails
      | null
    >
  >(async (previousResult) => {
    const previous = await previousResult;

    if (previous instanceof Error) {
      return previous;
    }

    if (previous !== null) {
      return previous;
    }

    const status = await getSpeechmaticsJobStatus({
      config,
      jobId,
    });

    if (status instanceof Error) {
      return status;
    }

    if (status.status === "done" || status.status === "rejected") {
      return status;
    }

    await sleep({ milliseconds: pollDelayMs });

    return null;
  }, Promise.resolve(null));

  if (finishedJobs instanceof Error) {
    return finishedJobs;
  }

  if (finishedJobs !== null) {
    return finishedJobs;
  }

  return new VoiceTranscriptionTimeoutError({
    attempts: pollAttempts,
    jobId,
  });
}

async function getSpeechmaticsJobStatus({
  config,
  jobId,
}: {
  config: SpeechmaticsConfig;
  jobId: string;
}): Promise<RemoteFetchError | RemoteJsonShapeError | RemoteResponseError | SpeechmaticsJobStatusDetails> {
  const url: string = buildSpeechmaticsUrl({
    baseUrl: config.batchBaseUrl,
    path: `jobs/${jobId}`,
  });
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
    },
  }).catch((cause) => {
    return new RemoteFetchError({
      operation: "Speechmatics job status",
      url,
      cause,
    });
  });

  if (response instanceof Error) {
    return response;
  }

  const bodyText = await readResponseText({
    operation: "Speechmatics job status",
    response,
    url,
  });

  if (bodyText instanceof Error) {
    return bodyText;
  }

  if (!response.ok) {
    return new RemoteResponseError({
      operation: "Speechmatics job status",
      status: response.status,
      url,
      body: bodyText,
    });
  }

  const parsed = parseJsonRecord({
    bodyText,
    operation: "Speechmatics job status",
    url,
  });

  if (parsed instanceof Error) {
    return parsed;
  }

  return readJobStatus({
    operation: "Speechmatics job status",
    value: parsed,
    url,
  });
}

async function getSpeechmaticsTranscript({
  config,
  jobId,
}: {
  config: SpeechmaticsConfig;
  jobId: string;
}): Promise<RemoteFetchError | RemoteResponseError | string> {
  const url = new URL(
    buildSpeechmaticsUrl({
      baseUrl: config.batchBaseUrl,
      path: `jobs/${jobId}/transcript`,
    })
  );
  url.searchParams.set("format", "txt");
  const transcriptUrl: string = url.toString();
  const response = await fetch(transcriptUrl, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
    },
  }).catch((cause) => {
    return new RemoteFetchError({
      operation: "Speechmatics transcript",
      url: transcriptUrl,
      cause,
    });
  });

  if (response instanceof Error) {
    return response;
  }

  const bodyText = await readResponseText({
    operation: "Speechmatics transcript",
    response,
    url: transcriptUrl,
  });

  if (bodyText instanceof Error) {
    return bodyText;
  }

  if (!response.ok) {
    return new RemoteResponseError({
      operation: "Speechmatics transcript",
      status: response.status,
      url: transcriptUrl,
      body: bodyText,
    });
  }

  return bodyText.trim();
}

async function readResponseText({
  operation,
  response,
  url,
}: {
  operation: string;
  response: Response;
  url: string;
}): Promise<RemoteFetchError | string> {
  return response.text().catch((cause) => {
    return new RemoteFetchError({
      operation,
      url,
      cause,
    });
  });
}

function parseJsonRecord({
  bodyText,
  operation,
  url,
}: {
  bodyText: string;
  operation: string;
  url: string;
}): RemoteJsonShapeError | Record<string, unknown> {
  const parsed = errore.try({
    try: () => {
      return JSON.parse(bodyText) as unknown;
    },
    catch: (cause) => {
      return new RemoteJsonShapeError({
        operation,
        url,
        cause,
      });
    },
  });

  if (parsed instanceof Error) {
    return new RemoteJsonShapeError({
      operation,
      url,
      cause: parsed,
    });
  }

  if (!isRecord(parsed)) {
    return new RemoteJsonShapeError({
      operation,
      url,
    });
  }

  return parsed;
}

function readJobId({
  operation,
  value,
  url,
}: {
  operation: string;
  value: unknown;
  url: string;
}): RemoteJsonShapeError | string {
  if (!isRecord(value)) {
    return new RemoteJsonShapeError({
      operation,
      url,
    });
  }

  if (typeof value.id === "string" && value.id.trim().length > 0) {
    return value.id.trim();
  }

  if (isRecord(value.job) && typeof value.job.id === "string") {
    return value.job.id.trim();
  }

  return new RemoteJsonShapeError({
    operation,
    url,
  });
}

function readJobStatus({
  operation,
  value,
  url,
}: {
  operation: string;
  value: unknown;
  url: string;
}): RemoteJsonShapeError | SpeechmaticsJobStatusDetails {
  if (!isRecord(value) || !isRecord(value.job)) {
    return new RemoteJsonShapeError({
      operation,
      url,
    });
  }

  const job = value.job;

  if (typeof job.id !== "string" || !isSpeechmaticsJobStatus(job.status)) {
    return new RemoteJsonShapeError({
      operation,
      url,
    });
  }

  return {
    id: job.id,
    status: job.status,
    errors: readSpeechmaticsErrors({ value: job.errors }),
  };
}

function isSpeechmaticsJobStatus(
  value: unknown
): value is SpeechmaticsJobStatus {
  return value === "running" || value === "done" || value === "rejected";
}

function readSpeechmaticsErrors({ value }: { value: unknown }): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!isRecord(item) || typeof item.message !== "string") {
        return "";
      }

      return item.message;
    })
    .filter((message) => {
      return message.length > 0;
    });
}

function buildSpeechmaticsUrl({
  baseUrl,
  path,
}: {
  baseUrl: string;
  path: string;
}): string {
  const normalizedBaseUrl: string = baseUrl.endsWith("/")
    ? baseUrl
    : `${baseUrl}/`;

  return new URL(path, normalizedBaseUrl).toString();
}

function sleep({ milliseconds }: { milliseconds: number }): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
