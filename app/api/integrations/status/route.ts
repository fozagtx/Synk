import {
  env,
  getMissingEnvNames,
  type EnvRequirement,
} from "@/lib/env";

export const dynamic = "force-dynamic";

type IntegrationStatus = "wired" | "configured" | "missing";

interface IntegrationStatusItem {
  name: string;
  status: IntegrationStatus;
  detail: string;
  requiredEnv: string[];
  missingEnv: string[];
}

interface IntegrationDefinition {
  name: string;
  isWired: boolean;
  requirements: EnvRequirement[];
  wiredDetail: string;
  configuredDetail: string;
  missingDetail: string;
}

interface IntegrationStatusResponse {
  ok: true;
  integrations: IntegrationStatusItem[];
}

export function GET(): Response {
  const integrations: IntegrationStatusItem[] = [
    createIntegrationStatusItem({
      name: "GitHub manifest reader",
      isWired: true,
      requirements: [],
      wiredDetail:
        "Wired into the scan route through public GitHub manifest reads.",
      configuredDetail: "No external configuration is required.",
      missingDetail: "No external configuration is required.",
    }),
    createIntegrationStatusItem({
      name: "Bright Data",
      isWired: true,
      requirements: [
        {
          name: "SERP_API_KEY",
          value: env.brightDataSerpApiKey,
        },
        {
          name: "WEBUNLOCKER_API_KEY",
          value: env.brightDataWebUnlockerApiKey,
        },
      ],
      wiredDetail:
        "Wired into the scan route through the Bright Data /request endpoint. SERP uses serp_api1, and Web Unlocker uses web_unlocker1.",
      configuredDetail:
        "Bright Data SERP and Web Unlocker credentials are present.",
      missingDetail: "Bright Data cannot run because provider config is absent.",
    }),
    createIntegrationStatusItem({
      name: "AI/ML API",
      isWired: true,
      requirements: [{ name: "AIMLAPI_API_KEY", value: env.aimlapiApiKey }],
      wiredDetail:
        "Wired into the scan route through AI SDK structured output; findings are normalized after Bright Data evidence collection.",
      configuredDetail:
        "AI/ML API is configured for evidence normalization.",
      missingDetail: "AI/ML API model calls are unavailable.",
    }),
    createIntegrationStatusItem({
      name: "Speechmatics",
      isWired: true,
      requirements: [
        { name: "SPEECHMATICS_API_KEY", value: env.speechmaticsApiKey },
      ],
      wiredDetail: "Speechmatics is wired into a backend transcription route.",
      configuredDetail:
        "SPEECHMATICS_API_KEY is present, but Speechmatics is not wired.",
      missingDetail: "Speechmatics transcription is unavailable.",
    }),
    createIntegrationStatusItem({
      name: "Cognee memory",
      isWired: true,
      requirements: getCogneeRequirements(),
      wiredDetail:
        "Wired into /api/scan; completed scan reports are remembered when COGNEE_SERVICE_URL points at a Cognee REST service.",
      configuredDetail:
        "Cognee memory is configured for scan-run memory writes.",
      missingDetail:
        "Cognee memory is optional and currently disabled.",
    }),
  ];

  return Response.json({
    ok: true,
    integrations,
  } satisfies IntegrationStatusResponse);
}

function getCogneeRequirements(): EnvRequirement[] {
  return [{ name: "COGNEE_SERVICE_URL", value: env.cogneeServiceUrl }];
}

function createIntegrationStatusItem({
  configuredDetail,
  isWired,
  missingDetail,
  name,
  requirements,
  wiredDetail,
}: IntegrationDefinition): IntegrationStatusItem {
  const requiredEnv: string[] = requirements.map((requirement) => {
    return requirement.name;
  });
  const missingEnv: string[] = getMissingEnvNames({ requirements });

  if (missingEnv.length > 0) {
    return {
      name,
      status: "missing",
      detail: `${missingDetail} Missing: ${missingEnv.join(", ")}.`,
      requiredEnv,
      missingEnv,
    };
  }

  if (isWired) {
    return {
      name,
      status: "wired",
      detail: wiredDetail,
      requiredEnv,
      missingEnv,
    };
  }

  return {
    name,
    status: "configured",
    detail: configuredDetail,
    requiredEnv,
    missingEnv,
  };
}
