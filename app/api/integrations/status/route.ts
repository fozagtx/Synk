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
      isWired: false,
      requirements: [{ name: "AIMLAPI_API_KEY", value: env.aimlapiApiKey }],
      wiredDetail: "AI/ML API is wired into the scan route.",
      configuredDetail:
        "AIMLAPI_API_KEY is present, but the current scan route does not call the model.",
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
      name: "Spectrum iMessage",
      isWired: true,
      requirements: [
        {
          name: "SPECTRUM_PROJECT_ID or PROJECT_ID",
          value: env.spectrumProjectId,
        },
        {
          name: "SPECTRUM_PROJECT_SECRET or SECRET_KEY",
          value: env.spectrumProjectSecret,
        },
      ],
      wiredDetail:
        "Wired at /api/spectrum/imessage/test; checks the Spectrum iMessage channel and returns the sender only when Spectrum exposes a dedicated phone.",
      configuredDetail:
        "Spectrum project credentials are present for iMessage channel checks.",
      missingDetail: "Spectrum iMessage cannot be checked yet.",
    }),
    createIntegrationStatusItem({
      name: "Cognee memory",
      isWired: true,
      requirements: getCogneeRequirements(),
      wiredDetail:
        "Wired into /api/scan; completed scan reports are remembered through the local Cognee Docker REST service at COGNEE_SERVICE_URL.",
      configuredDetail:
        "Cognee memory is configured for scan-run memory writes.",
      missingDetail:
        "Cognee memory cannot write scan runs because provider config is absent.",
    }),
  ];

  return Response.json({
    ok: true,
    integrations,
  } satisfies IntegrationStatusResponse);
}

function getCogneeRequirements(): EnvRequirement[] {
  return [];
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
