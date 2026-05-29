import * as errore from "errore";
import dedent from "string-dedent";
import { Spectrum, type Space, type SpectrumInstance } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";

import { env } from "@/lib/env";

export class SpectrumImessageConfigurationError extends errore.createTaggedError({
  name: "SpectrumImessageConfigurationError",
  message: "Spectrum iMessage is not configured: $missing",
}) {}

export class SpectrumImessageStartupError extends errore.createTaggedError({
  name: "SpectrumImessageStartupError",
  message: "Spectrum iMessage failed to start",
}) {}

export class SpectrumImessageSpaceError extends errore.createTaggedError({
  name: "SpectrumImessageSpaceError",
  message: "Spectrum iMessage failed to open a chat for $recipientPhone",
}) {}

export class SpectrumImessageSendError extends errore.createTaggedError({
  name: "SpectrumImessageSendError",
  message: "Spectrum iMessage failed to send a test message to $recipientPhone",
}) {}

export class SpectrumImessageStopError extends errore.createTaggedError({
  name: "SpectrumImessageStopError",
  message: "Spectrum iMessage failed to stop cleanly",
}) {}

export interface SpectrumImessageTestResult {
  agentPhone: string | null;
  mode: "dedicated" | "shared_or_unknown";
  recipientPhone: string;
  status: "sent";
}

type SpectrumImessageProvider = ReturnType<typeof imessage.config>;
type SpectrumImessageApp = SpectrumInstance<[SpectrumImessageProvider]>;

export type SpectrumImessageError =
  | SpectrumImessageConfigurationError
  | SpectrumImessageStartupError
  | SpectrumImessageSpaceError
  | SpectrumImessageSendError
  | SpectrumImessageStopError;

export async function sendSpectrumImessageTest({
  recipientPhone,
}: {
  recipientPhone: string;
}): Promise<SpectrumImessageError | SpectrumImessageTestResult> {
  const config = getSpectrumImessageConfig();

  if (config instanceof Error) {
    return config;
  }

  const app = await startSpectrumImessageApp({
    projectId: config.projectId,
    projectSecret: config.projectSecret,
  });

  if (app instanceof Error) {
    return app;
  }

  const space = await createImessageSpace({
    app,
    recipientPhone,
  });

  if (space instanceof Error) {
    const stopResult = await stopSpectrumImessageApp({ app });

    if (stopResult instanceof Error) {
      return stopResult;
    }

    return space;
  }

  const sendResult = await sendImessageIntro({
    recipientPhone,
    space,
  });
  const stopResult = await stopSpectrumImessageApp({ app });

  if (sendResult instanceof Error) {
    return sendResult;
  }

  if (stopResult instanceof Error) {
    return stopResult;
  }

  return {
    agentPhone: resolveAgentPhoneFromSpace({ space }),
    mode: resolveAgentPhoneFromSpace({ space })
      ? "dedicated"
      : "shared_or_unknown",
    recipientPhone,
    status: "sent",
  };
}

function getSpectrumImessageConfig():
  | SpectrumImessageConfigurationError
  | {
      projectId: string;
      projectSecret: string;
    } {
  const missing: string[] = [
    { name: "SPECTRUM_PROJECT_ID", value: env.spectrumProjectId },
    { name: "SPECTRUM_PROJECT_SECRET", value: env.spectrumProjectSecret },
  ]
    .filter((requirement) => {
      return requirement.value === null;
    })
    .map((requirement) => {
      return requirement.name;
    });

  if (!env.spectrumProjectId || !env.spectrumProjectSecret) {
    return new SpectrumImessageConfigurationError({
      missing: missing.join(", "),
    });
  }

  return {
    projectId: env.spectrumProjectId,
    projectSecret: env.spectrumProjectSecret,
  };
}

async function startSpectrumImessageApp({
  projectId,
  projectSecret,
}: {
  projectId: string;
  projectSecret: string;
}): Promise<SpectrumImessageApp | SpectrumImessageStartupError> {
  return Spectrum({
    projectId,
    projectSecret,
    providers: [imessage.config()],
    telemetry: false,
  }).catch((cause: unknown) => {
    return new SpectrumImessageStartupError({ cause });
  });
}

async function createImessageSpace({
  app,
  recipientPhone,
}: {
  app: SpectrumImessageApp;
  recipientPhone: string;
}): Promise<Space | SpectrumImessageSpaceError> {
  const imessagePlatform = imessage(app);
  const result = await errore.tryAsync({
    try: () => {
      return imessagePlatform.space(recipientPhone);
    },
    catch: (cause) => {
      return new SpectrumImessageSpaceError({
        recipientPhone,
        cause,
      });
    },
  });

  return result;
}

function resolveAgentPhoneFromSpace({ space }: { space: Space }): string | null {
  const maybeSpaceWithPhone = space as Space & { phone?: unknown };

  if (
    typeof maybeSpaceWithPhone.phone === "string" &&
    maybeSpaceWithPhone.phone !== "shared"
  ) {
    return maybeSpaceWithPhone.phone;
  }

  return null;
}

async function sendImessageIntro({
  recipientPhone,
  space,
}: {
  recipientPhone: string;
  space: Space;
}): Promise<SpectrumImessageSendError | void> {
  const message = dedent`
    Synk is online.

    Send a public GitHub repo URL and I will scan it for CVEs, exploit chatter, deprecations, and breaking releases.
  `;

  return space.send(message).then(
    () => {
      return undefined;
    },
    (cause: unknown) => {
      return new SpectrumImessageSendError({
        recipientPhone,
        cause,
      });
    }
  );
}

async function stopSpectrumImessageApp({
  app,
}: {
  app: SpectrumImessageApp;
}): Promise<SpectrumImessageStopError | void> {
  return app.stop().then(
    () => {
      return undefined;
    },
    (cause: unknown) => {
      return new SpectrumImessageStopError({ cause });
    }
  );
}
