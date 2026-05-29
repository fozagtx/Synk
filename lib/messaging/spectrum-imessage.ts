import * as errore from "errore";
import { cloud, type TokenData } from "spectrum-ts";

import { env } from "@/lib/env";

export class SpectrumImessageConfigurationError extends errore.createTaggedError({
  name: "SpectrumImessageConfigurationError",
  message: "Spectrum iMessage is not configured: $missing",
}) {}

export class SpectrumImessageStartupError extends errore.createTaggedError({
  name: "SpectrumImessageStartupError",
  message: "Spectrum iMessage channel check failed",
}) {}

export interface SpectrumImessageTestResult {
  agentPhone: string | null;
  mode: "dedicated" | "shared_or_unknown";
  recipientPhone: string | null;
  status: "ready";
}

export type SpectrumImessageError =
  | SpectrumImessageConfigurationError
  | SpectrumImessageStartupError;

export async function checkSpectrumImessageChannel({
  recipientPhone,
}: {
  recipientPhone: string | null;
}): Promise<SpectrumImessageError | SpectrumImessageTestResult> {
  const config = getSpectrumImessageConfig();

  if (config instanceof Error) {
    return config;
  }

  const tokenData = await getSpectrumImessageTokenData({
    projectId: config.projectId,
    projectSecret: config.projectSecret,
  });

  if (tokenData instanceof Error) {
    return tokenData;
  }

  const agentPhone: string | null = resolveAgentPhoneFromTokenData({
    tokenData,
  });

  return {
    agentPhone,
    mode: tokenData.type === "dedicated" ? "dedicated" : "shared_or_unknown",
    recipientPhone,
    status: "ready",
  };
}

function getSpectrumImessageConfig():
  | SpectrumImessageConfigurationError
  | {
      projectId: string;
      projectSecret: string;
    } {
  const missing: string[] = [
    { name: "SPECTRUM_PROJECT_ID or PROJECT_ID", value: env.spectrumProjectId },
    {
      name: "SPECTRUM_PROJECT_SECRET or SECRET_KEY",
      value: env.spectrumProjectSecret,
    },
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

async function getSpectrumImessageTokenData({
  projectId,
  projectSecret,
}: {
  projectId: string;
  projectSecret: string;
}): Promise<TokenData | SpectrumImessageStartupError> {
  return cloud.issueImessageTokens(projectId, projectSecret).catch((cause) => {
    return new SpectrumImessageStartupError({ cause });
  });
}

function resolveAgentPhoneFromTokenData({
  tokenData,
}: {
  tokenData: TokenData;
}): string | null {
  if (tokenData.type === "shared") {
    return null;
  }

  return Object.values(tokenData.numbers).find(isString) ?? null;
}

function isString(value: string | null): value is string {
  return typeof value === "string" && value.length > 0;
}
