import * as errore from "errore";

import { generateAdvisorAnswer } from "@/lib/advisor/advisor-engine";
import { parseAdvisorChatRequest } from "@/lib/advisor/advisor-request";
import { InvalidJsonError, toErrorCode } from "@/lib/scan/errors";
import type {
  AdvisorChatApiResponse,
  AdvisorChatRequest,
} from "@/lib/types/advisor";

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

  if (bodyText instanceof Error) {
    return failureResponse({ error: bodyText, status: 400 });
  }

  const advisorRequest: AdvisorChatRequest | Error = parseAdvisorChatRequest({
    bodyText,
  });

  if (advisorRequest instanceof Error) {
    return failureResponse({ error: advisorRequest, status: 400 });
  }

  const result = await generateAdvisorAnswer({
    messages: advisorRequest.messages,
    question: advisorRequest.question,
    runs: advisorRequest.runs,
  });

  if (result instanceof Error) {
    return failureResponse({ error: result, status: 502 });
  }

  return Response.json({
    ok: true,
    answer: result.answer,
  } satisfies AdvisorChatApiResponse);
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
    } satisfies AdvisorChatApiResponse,
    { status }
  );
}
