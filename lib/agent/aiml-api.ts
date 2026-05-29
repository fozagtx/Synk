import { createAIMLAPI } from "@ai-ml.api/aimlapi-vercel-ai";
import type { LanguageModel } from "ai";

import { env } from "@/lib/env";
import { AIProviderConfigurationError } from "@/lib/scan/errors";

export function getCveSorterModel(): AIProviderConfigurationError | LanguageModel {
  if (!env.aimlapiApiKey) {
    return new AIProviderConfigurationError({
      missing: "AIMLAPI_API_KEY",
    });
  }

  const provider = createAIMLAPI({
    apiKey: env.aimlapiApiKey,
    baseURL: env.aimlapiBaseUrl,
  });

  return provider(env.aimlapiModel);
}
