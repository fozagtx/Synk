export type Severity = "critical" | "high" | "medium" | "low" | "info";

export type Confidence = "high" | "medium" | "low";

export type FindingType =
  | "cve"
  | "security_advisory"
  | "exploit_chatter"
  | "vendor_deprecation"
  | "breaking_release";

export type MatchLabel =
  | "confirmed_match"
  | "possible_match"
  | "stack_level_risk"
  | "not_applicable";

export type Ecosystem =
  | "npm"
  | "python"
  | "go"
  | "rust"
  | "ruby"
  | "php"
  | "java"
  | "terraform"
  | "unknown";

export type ManifestKind =
  | "package_json"
  | "package_lock"
  | "pnpm_lock"
  | "yarn_lock"
  | "requirements_txt"
  | "pyproject_toml"
  | "go_mod"
  | "cargo_toml"
  | "cargo_lock"
  | "gemfile"
  | "gemfile_lock"
  | "composer_json"
  | "composer_lock"
  | "pom_xml"
  | "gradle"
  | "terraform_lock"
  | "unknown";

export interface GithubRepoRef {
  owner: string;
  repo: string;
  branch: string;
  url: string;
}

export interface StackManifest {
  path: string;
  kind: ManifestKind;
  content: string;
}

export interface DetectedDependency {
  name: string;
  version: string | null;
  ecosystem: Ecosystem;
  sourceFile: string;
  scope: string;
}

export interface DetectedStack {
  repo: GithubRepoRef;
  manifests: Array<Pick<StackManifest, "path" | "kind">>;
  languages: string[];
  frameworks: string[];
  packageManagers: string[];
  vendors: string[];
  dependencies: DetectedDependency[];
}

export interface Evidence {
  sourceName: string;
  sourceType:
    | "official_advisory"
    | "cve_database"
    | "vendor_changelog"
    | "news"
    | "social_chatter"
    | "search_query";
  url: string;
  observedAt: string;
  summary: string;
}

export interface Finding {
  id: string;
  type: FindingType;
  title: string;
  affectedDependency: string;
  installedVersion: string | null;
  severity: Severity;
  confidence: Confidence;
  matchLabel: MatchLabel;
  evidence: Evidence[];
  recommendedAction: string;
  score: number;
  firstSeen: string;
}

export interface ReportGroups {
  vulnerabilities: Finding[];
  exploitChatter: Finding[];
  deprecations: Finding[];
  breakingReleases: Finding[];
}

export interface ReportSummary {
  totalFindings: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
  topAction: string;
}

export interface ScanReport {
  scanId: string;
  scannedAt: string;
  repo: GithubRepoRef;
  stack: DetectedStack;
  summary: ReportSummary;
  groups: ReportGroups;
}

export type ScanMemoryStatus =
  | {
      provider: "cognee";
      status: "remembered";
      datasetName: string;
      entryId: string | null;
    }
  | {
      provider: "cognee";
      status: "not_configured";
      missingEnv: string[];
    }
  | {
      provider: "cognee";
      status: "failed";
      message: string;
    };

export interface ScanRequest {
  githubUrl: string;
}

export interface ScanSuccessResponse {
  ok: true;
  report: ScanReport;
  memory: ScanMemoryStatus;
}

export interface ScanFailureResponse {
  ok: false;
  error: {
    code: string;
    message: string;
  };
}

export type ScanApiResponse = ScanSuccessResponse | ScanFailureResponse;
