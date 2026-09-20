export interface Env {
  speechmaticsApiKey: string | null;
  speechmaticsBatchBaseUrl: string;
  speechmaticsRealtimeUrl: string;
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

export const env: Env = {
  speechmaticsApiKey: readOptionalEnv({ name: "SPEECHMATICS_API_KEY" }),
  speechmaticsBatchBaseUrl: readEnvWithDefault({
    name: "SPEECHMATICS_BATCH_BASE_URL",
    value: "https://eu1.asr.api.speechmatics.com/v2",
  }),
  speechmaticsRealtimeUrl: readEnvWithDefault({
    name: "SPEECHMATICS_REALTIME_URL",
    value: "wss://eu.rt.speechmatics.com/v2",
  }),
};
