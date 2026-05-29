import * as errore from "errore";

import {
  InvalidJsonError,
  InvalidScanRequestError,
  toErrorCode,
} from "@/lib/scan/errors";
import { rememberScanReport } from "@/lib/memory/cognee";
import { runScan } from "@/lib/scan/scan-agent";
import type { ScanApiResponse, ScanRequest } from "@/lib/types/scan";

export const dynamic = "force-dynamic";

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

  const scanRequest = parseScanRequest({ bodyText });

  if (errore.isError(scanRequest)) {
    return failureResponse({ error: scanRequest, status: 400 });
  }

  const report = await runScan({ request: scanRequest });

  if (errore.isError(report)) {
    return failureResponse({ error: report, status: 502 });
  }

  const memory = await rememberScanReport({ report });

  return Response.json({
    ok: true,
    memory,
    report,
  } satisfies ScanApiResponse);
}

function parseScanRequest({
  bodyText,
}: {
  bodyText: string;
}): InvalidJsonError | InvalidScanRequestError | ScanRequest {
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

  const githubUrl = parsed.githubUrl;

  if (typeof githubUrl !== "string" || githubUrl.trim().length === 0) {
    return new InvalidScanRequestError({
      field: "githubUrl",
      reason: "expected a GitHub repository URL",
    });
  }

  return {
    githubUrl: githubUrl.trim(),
  };
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
    } satisfies ScanApiResponse,
    { status }
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
