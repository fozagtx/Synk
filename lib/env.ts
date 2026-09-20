export interface Env {
  speechmaticsApiKey: string | null;
  firecrawlApiKey: string | null;
  nebiusApiKey: string | null;
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
  firecrawlApiKey: readOptionalEnv({ name: "FIRECRAWL_API_KEY" }),
  nebiusApiKey: readOptionalEnv({ name: "NEBIUS_API_KEY" }),
};
