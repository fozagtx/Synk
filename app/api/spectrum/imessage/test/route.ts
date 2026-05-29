import * as errore from "errore";

import {
  InvalidJsonError,
  InvalidScanRequestError,
  isRecord,
  toErrorCode,
} from "@/lib/scan/errors";
import {
  checkSpectrumImessageChannel,
  type SpectrumImessageTestResult,
} from "@/lib/messaging/spectrum-imessage";

export const dynamic = "force-dynamic";

type SpectrumImessageTestResponse =
  | {
      ok: true;
      result: SpectrumImessageTestResult;
    }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
      };
    };

export async function POST(request: Request): Promise<Response> {
  const bodyText = await errore.tryAsync({
    try: () => {
      return request.text();
    },
    catch: (cause) => {
      return new InvalidJsonError({ cause });
    },
  });

  if (errore.isError(bodyText)) {
    return failureResponse({ error: bodyText, status: 400 });
  }

  const parsedRequest = parseSpectrumImessageTestRequest({ bodyText });

  if (errore.isError(parsedRequest)) {
    return failureResponse({ error: parsedRequest, status: 400 });
  }

  const result = await checkSpectrumImessageChannel({
    recipientPhone: parsedRequest.recipientPhone,
  });

  if (errore.isError(result)) {
    return failureResponse({
      error: result,
      status: 502,
    });
  }

  return Response.json({
    ok: true,
    result,
  } satisfies SpectrumImessageTestResponse);
}

function parseSpectrumImessageTestRequest({
  bodyText,
}: {
  bodyText: string;
}): InvalidJsonError | InvalidScanRequestError | { recipientPhone: string | null } {
  const parsed = errore.try({
    try: () => {
      return JSON.parse(bodyText) as unknown;
    },
    catch: (cause) => {
      return new InvalidJsonError({ cause });
    },
  });

  if (errore.isError(parsed)) {
    return parsed;
  }

  if (!isRecord(parsed)) {
    return new InvalidScanRequestError({
      field: "body",
      reason: "expected an object",
    });
  }

  const recipientPhone = parsed.recipientPhone;

  if (typeof recipientPhone === "undefined" || recipientPhone === null) {
    return {
      recipientPhone: null,
    };
  }

  if (typeof recipientPhone !== "string") {
    return new InvalidScanRequestError({
      field: "recipientPhone",
      reason: "expected a phone number string",
    });
  }

  const normalizedPhone = normalizePhoneNumber({ value: recipientPhone });

  if (!isE164PhoneNumber({ value: normalizedPhone })) {
    return new InvalidScanRequestError({
      field: "recipientPhone",
      reason: "expected an E.164 phone number like +233XXXXXXXXX",
    });
  }

  return {
    recipientPhone: normalizedPhone,
  };
}

function normalizePhoneNumber({ value }: { value: string }): string {
  return value.replace(/[^\d+]/g, "");
}

function isE164PhoneNumber({ value }: { value: string }): boolean {
  return /^\+[1-9]\d{7,14}$/.test(value);
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
    } satisfies SpectrumImessageTestResponse,
    { status }
  );
}
