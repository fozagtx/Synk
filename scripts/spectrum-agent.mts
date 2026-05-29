import dedent from "string-dedent";
import {
  Spectrum,
  type Message,
  type Space,
  type SpectrumInstance,
} from "spectrum-ts";
import { terminal } from "spectrum-ts/providers/terminal";

import type {
  Finding,
  ReportGroups,
  ScanApiResponse,
  ScanReport,
  ScanRequest,
} from "@/lib/types/scan";

class SpectrumStartupError extends Error {
  constructor({ cause }: { cause: unknown }) {
    super("Spectrum agent failed to start", { cause });
  }
}

class SpectrumReplyError extends Error {
  constructor({ cause }: { cause: unknown }) {
    super("Spectrum agent failed to send a reply", { cause });
  }
}

class SynkApiFetchError extends Error {
  constructor({ cause }: { cause: unknown }) {
    super("Synk API request failed", { cause });
  }
}

class SynkApiResponseShapeError extends Error {
  constructor() {
    super("Synk API returned an unsupported response shape");
  }
}

const SYNK_SCAN_API_URL = "http://localhost:3100/api/scan";

type SpectrumApp = SpectrumInstance<ReturnType<typeof createSpectrumProviders>>;

void main();

async function main(): Promise<void> {
  const app = await startSpectrumApp();

  if (app instanceof Error) {
    console.error(app.message);
    process.exitCode = 1;
    return;
  }

  bindProcessShutdown({ app });
  await app.send(await getTerminalSpace({ app }), "Synk is online. Send a public GitHub repo URL.");
  await runSpectrumMessageLoop({ app });
}

async function startSpectrumApp(): Promise<SpectrumApp | SpectrumStartupError> {
  return Spectrum({
    providers: createSpectrumProviders(),
    telemetry: false,
  }).catch((cause: unknown) => {
    return new SpectrumStartupError({ cause });
  });
}

function createSpectrumProviders(): [ReturnType<typeof terminal.config>] {
  return [
    terminal.config({
      commands: [
        {
          name: "/help",
          description: "Show Synk usage.",
        },
      ],
    }),
  ];
}

async function getTerminalSpace({
  app,
}: {
  app: SpectrumApp;
}): Promise<Space> {
  const terminalPlatform = terminal(app);
  return terminalPlatform.space({ id: "synk" });
}

function bindProcessShutdown({ app }: { app: SpectrumApp }): void {
  process.once("SIGINT", () => {
    void app.stop().then(() => {
      process.exitCode = 0;
    });
  });
  process.once("SIGTERM", () => {
    void app.stop().then(() => {
      process.exitCode = 0;
    });
  });
}

async function runSpectrumMessageLoop({ app }: { app: SpectrumApp }): Promise<void> {
  for await (const [space, message] of app.messages) {
    const response = await createSpectrumResponse({ message });
    const replyResult = await sendSpectrumReply({
      response,
      space,
    });

    if (replyResult instanceof Error) {
      console.error(replyResult.message);
    }
  }
}

async function sendSpectrumReply({
  response,
  space,
}: {
  response: string;
  space: Space;
}): Promise<SpectrumReplyError | void> {
  return space
    .responding(async () => {
      await space.send(response);
    })
    .catch((cause: unknown) => {
      return new SpectrumReplyError({ cause });
    });
}

async function createSpectrumResponse({
  message,
}: {
  message: Message;
}): Promise<string> {
  if (message.content.type !== "text") {
    return createUnsupportedContentResponse();
  }

  const prompt: string = message.content.text.trim();

  if (prompt.length === 0 || prompt === "/help") {
    return createHelpResponse();
  }

  const githubUrl: string = extractGithubUrl({ value: prompt });

  if (githubUrl.length === 0) {
    return createHelpResponse();
  }

  const scanRequest: ScanRequest = {
    githubUrl,
  };
  const response = await postSynkScan({ request: scanRequest });

  if (response instanceof Error) {
    return dedent`
      Synk scan failed.

      ${response.message}
    `;
  }

  if (!response.ok) {
    return dedent`
      Synk scan failed.

      ${response.error.message}
    `;
  }

  return formatSpectrumReport({ report: response.report });
}

async function postSynkScan({
  request,
}: {
  request: ScanRequest;
}): Promise<SynkApiFetchError | SynkApiResponseShapeError | ScanApiResponse> {
  const response = await fetch(SYNK_SCAN_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(request),
  }).catch((cause: unknown) => {
    return new SynkApiFetchError({ cause });
  });

  if (response instanceof Error) {
    return response;
  }

  const parsed = await response.json().catch((cause: unknown) => {
    return new SynkApiFetchError({ cause });
  });

  if (parsed instanceof Error) {
    return parsed;
  }

  if (!isScanApiResponse(parsed)) {
    return new SynkApiResponseShapeError();
  }

  return parsed;
}

function createUnsupportedContentResponse(): string {
  return dedent`
    Synk accepts text messages in Spectrum.

    Send a public GitHub repo URL, for example:
    https://github.com/vercel/ai
  `;
}

function createHelpResponse(): string {
  return dedent`
    Send a public GitHub repo URL and Synk will scan its stack for CVEs, advisories, exploit chatter, vendor deprecations, and breaking releases.

    Example:
    https://github.com/vercel/ai
  `;
}

function formatSpectrumReport({ report }: { report: ScanReport }): string {
  const findings: Finding[] = topFindings({ groups: report.groups });
  const findingLines: string = findings.length > 0
    ? findings
        .map((finding) => {
          return `- ${finding.severity.toUpperCase()}: ${finding.title} -> ${finding.recommendedAction}`;
        })
        .join("\n")
    : "- No candidate findings matched the detected stack. This is not a safety guarantee.";

  return dedent`
    Synk scan complete: ${report.repo.owner}/${report.repo.repo}

    Dependencies: ${report.stack.dependencies.length}
    Candidate checks: ${report.summary.totalFindings}
    High-priority checks: ${report.summary.critical + report.summary.high}

    Top action:
    ${report.summary.topAction}

    Findings:
    ${findingLines}
  `;
}

function topFindings({ groups }: { groups: ReportGroups }): Finding[] {
  return [
    ...groups.vulnerabilities,
    ...groups.exploitChatter,
    ...groups.deprecations,
    ...groups.breakingReleases,
  ].slice(0, 5);
}

function extractGithubUrl({ value }: { value: string }): string {
  const fullUrlMatch: RegExpMatchArray | null = value.match(
    /https?:\/\/(?:www\.)?github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/i
  );

  if (fullUrlMatch?.[0]) {
    return trimTrailingPunctuation({ value: fullUrlMatch[0] });
  }

  const shorthandMatch: RegExpMatchArray | null = value.match(
    /(?:^|\s)(github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/i
  );

  if (shorthandMatch?.[1]) {
    const repositoryPath: string = trimTrailingPunctuation({
      value: shorthandMatch[1],
    });

    return `https://${repositoryPath}`;
  }

  return "";
}

function trimTrailingPunctuation({ value }: { value: string }): string {
  return value.replace(/[),.;\]]+$/g, "");
}

function isScanApiResponse(value: unknown): value is ScanApiResponse {
  if (!isRecord(value)) {
    return false;
  }

  if (value.ok === true) {
    return isScanReport(value.report);
  }

  if (value.ok === false) {
    return isRecord(value.error) &&
      typeof value.error.code === "string" &&
      typeof value.error.message === "string";
  }

  return false;
}

function isScanReport(value: unknown): value is ScanReport {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.scanId === "string" &&
    typeof value.scannedAt === "string" &&
    isRecord(value.repo) &&
    isRecord(value.stack) &&
    isRecord(value.summary) &&
    isRecord(value.groups)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
