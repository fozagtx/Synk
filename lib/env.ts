export interface Env {
  brightDataSerpApiKey: string | null;
  brightDataWebUnlockerApiKey: string | null;
  brightDataSerpZone: string;
  brightDataWebUnlockerZone: string;
  aimlapiApiKey: string | null;
  aimlapiBaseUrl: string;
  aimlapiModel: string;
  speechmaticsApiKey: string | null;
  speechmaticsBatchBaseUrl: string;
  speechmaticsRealtimeUrl: string;
  cogneeServiceUrl: string | null;
  cogneeApiKey: string | null;
  cogneeDatasetName: string;
}

export interface EnvRequirement {
  name: string;
  value: string | null;
}

export function readOptionalEnv({ name }: { name: string }): string | null {
  const value: string | undefined = process.env[name];

  if (typeof value === "undefined") {
    return null;
  }

  const trimmedValue: string = value.trim();

  if (trimmedValue.length === 0) {
    return null;
  }

  return trimmedValue;
}

export function readEnvWithDefault({
  name,
  value,
}: {
  name: string;
  value: string;
}): string {
  return readOptionalEnv({ name }) ?? value;
}

export function getMissingEnvNames({
  requirements,
}: {
  requirements: EnvRequirement[];
}): string[] {
  return requirements
    .filter((requirement) => {
      return requirement.value === null;
    })
    .map((requirement) => {
      return requirement.name;
    });
}

export function readCogneeServiceUrl(): string | null {
  const explicitUrl: string | null = readOptionalEnv({
    name: "COGNEE_SERVICE_URL",
  });

  if (explicitUrl !== null) {
    return explicitUrl;
  }

  const renderHostport: string | null = readOptionalEnv({
    name: "COGNEE_HOSTPORT",
  });

  if (renderHostport !== null) {
    return `http://${renderHostport}`;
  }

  return null;
}

export const env: Env = {
  brightDataSerpApiKey: readOptionalEnv({ name: "SERP_API_KEY" }),
  brightDataWebUnlockerApiKey: readOptionalEnv({
    name: "WEBUNLOCKER_API_KEY",
  }),
  brightDataSerpZone: "serp_api1",
  brightDataWebUnlockerZone: "web_unlocker1",
  aimlapiApiKey: readOptionalEnv({ name: "AIMLAPI_API_KEY" }),
  aimlapiBaseUrl: readEnvWithDefault({
    name: "AIMLAPI_BASE_URL",
    value: "https://api.aimlapi.com/v1",
  }),
  aimlapiModel: readEnvWithDefault({
    name: "AIMLAPI_MODEL",
    value: "gpt-4o",
  }),
  speechmaticsApiKey: readOptionalEnv({ name: "SPEECHMATICS_API_KEY" }),
  speechmaticsBatchBaseUrl: readEnvWithDefault({
    name: "SPEECHMATICS_BATCH_BASE_URL",
    value: "https://eu1.asr.api.speechmatics.com/v2",
  }),
  speechmaticsRealtimeUrl: readEnvWithDefault({
    name: "SPEECHMATICS_REALTIME_URL",
    value: "wss://eu.rt.speechmatics.com/v2",
  }),
  cogneeServiceUrl: readCogneeServiceUrl(),
  cogneeApiKey: readOptionalEnv({ name: "COGNEE_API_KEY" }),
  cogneeDatasetName: readEnvWithDefault({
    name: "COGNEE_DATASET_NAME",
    value: "synk-memory",
  }),
};
