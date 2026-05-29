import * as errore from "errore";

import {
  InvalidVoiceRequestError,
  toErrorCode,
} from "@/lib/scan/errors";
import { transcribeWithSpeechmatics } from "@/lib/voice/speechmatics";

export const dynamic = "force-dynamic";

interface TranscriptionApiSuccessResponse {
  ok: true;
  transcript: string;
}

interface TranscriptionApiFailureResponse {
  ok: false;
  error: {
    code: string;
    message: string;
  };
}

type TranscriptionApiResponse =
  | TranscriptionApiFailureResponse
  | TranscriptionApiSuccessResponse;

const SPEECHMATICS_POLL_ATTEMPTS = 20;
const SPEECHMATICS_POLL_DELAY_MS = 1500;

export async function POST(request: Request): Promise<Response> {
  const formData = await errore.tryAsync({
    try: () => {
      return request.formData();
    },
    catch: (cause) => {
      return new InvalidVoiceRequestError({
        reason: "expected multipart form data with an audio file",
        cause,
      });
    },
  });

  if (formData instanceof Error) {
    return failureResponse({
      error: formData,
      status: 400,
    });
  }

  const audio = readAudioFile({ formData });

  if (audio instanceof Error) {
    return failureResponse({
      error: audio,
      status: 400,
    });
  }

  const transcript = await transcribeWithSpeechmatics({
    audio,
    pollAttempts: SPEECHMATICS_POLL_ATTEMPTS,
    pollDelayMs: SPEECHMATICS_POLL_DELAY_MS,
  });

  if (transcript instanceof Error) {
    return failureResponse({
      error: transcript,
      status: 502,
    });
  }

  if (transcript.length === 0) {
    return failureResponse({
      error: new InvalidVoiceRequestError({
        reason: "Speechmatics returned an empty transcript",
      }),
      status: 422,
    });
  }

  return Response.json({
    ok: true,
    transcript,
  } satisfies TranscriptionApiSuccessResponse);
}

function readAudioFile({
  formData,
}: {
  formData: FormData;
}): File | InvalidVoiceRequestError {
  const value = formData.get("audio");

  if (!(value instanceof File)) {
    return new InvalidVoiceRequestError({
      reason: "missing audio file field named audio",
    });
  }

  if (value.size === 0) {
    return new InvalidVoiceRequestError({
      reason: "audio file is empty",
    });
  }

  return value;
}

function failureResponse({
  error,
  status,
}: {
  error: Error;
  status: number;
}): Response {
  return Response.json(
    {
      ok: false,
      error: {
        code: toErrorCode(error),
        message: error.message,
      },
    } satisfies TranscriptionApiResponse,
    { status }
  );
}
