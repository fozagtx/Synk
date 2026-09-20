import * as errore from "errore";

import {
  FirecrawlRequestError,
  FirecrawlResponseError,
  FirecrawlResponseShapeError,
  isRecord,
} from "@/lib/audit/errors";

const FIRECRAWL_URL = "https://api.firecrawl.dev/v1/scrape";
const REQUEST_TIMEOUT_MS = 30_000;

export interface FirecrawlPage {
  html: string;
  links: string[];
  statusCode: number | null;
}

function readPage({
  value,
  url,
}: {
  value: unknown;
  url: string;
}): FirecrawlPage | Error {
  if (!isRecord(value) || !isRecord(value.data)) {
    return new FirecrawlResponseShapeError({ url });
  }

  const data = value.data;
  const html = typeof data.html === "string" ? data.html : "";
  const links = Array.isArray(data.links)
    ? data.links.filter((link): link is string => typeof link === "string")
    : [];
  const metadata = isRecord(data.metadata) ? data.metadata : null;
  const statusCode =
    metadata !== null && typeof metadata.statusCode === "number"
      ? metadata.statusCode
      : null;

  if (html.length === 0) {
    return new FirecrawlResponseShapeError({ url });
  }

  return { html, links, statusCode };
}

async function request({
  url,
  apiKey,
}: {
  url: string;
  apiKey: string;
}): Promise<FirecrawlPage | Error> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(new Error("Firecrawl request timeout"));
  }, REQUEST_TIMEOUT_MS);
  const response = await errore.tryAsync({
    try: () =>
      fetch(FIRECRAWL_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "User-Agent": "Synk Rescue Audit/1.0 (+https://synk.dev)",
        },
        body: JSON.stringify({
          url,
          formats: ["html", "links"],
          onlyMainContent: false,
        }),
        signal: controller.signal,
      }),
    catch: (cause) =>
      new FirecrawlRequestError({
        url,
        reason: cause instanceof Error ? cause.message : "network error",
      }),
  });
  clearTimeout(timeout);

  if (response instanceof Error) {
    return response;
  }

  const body = await errore.tryAsync({
    try: () => response.text(),
    catch: (cause) =>
      new FirecrawlRequestError({
        url,
        reason: cause instanceof Error ? cause.message : "response read error",
      }),
  });

  if (body instanceof Error) {
    return body;
  }

  if (!response.ok) {
    return new FirecrawlResponseError({
      url,
      status: response.status,
      body: body.slice(0, 2000),
    });
  }

  const parsed = errore.try({
    try: () => JSON.parse(body),
    catch: () => new FirecrawlResponseShapeError({ url }),
  });

  if (parsed instanceof Error) {
    return parsed;
  }

  return readPage({ value: parsed, url });
}

export async function scrapeWithFirecrawl({
  url,
  apiKey,
}: {
  url: string;
  apiKey: string;
}): Promise<FirecrawlPage | Error> {
  const first = await request({ url, apiKey });

  if (!(first instanceof Error)) {
    return first;
  }

  console.warn(
    JSON.stringify({
      event: "firecrawl_retry",
      url,
      error: first.message,
    }),
  );
  return request({ url, apiKey });
}
