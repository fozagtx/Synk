import * as errore from "errore";

import {
  NoManifestFilesError,
  RemoteFetchError,
  RemoteJsonShapeError,
  RemoteResponseError,
  UnsupportedGithubUrlError,
} from "@/lib/scan/errors";
import type {
  GithubRepoRef,
  ManifestKind,
  StackManifest,
} from "@/lib/types/scan";

const GITCHAMBER_ORIGIN = "https://gitchamber.com";
const GITCHAMBER_GLOB =
  "**/{package.json,package-lock.json,pnpm-lock.yaml,yarn.lock,requirements.txt,pyproject.toml,poetry.lock,go.mod,Cargo.toml,Cargo.lock,Gemfile,Gemfile.lock,composer.json,composer.lock,pom.xml,build.gradle,build.gradle.kts,.terraform.lock.hcl}";
const MAX_MANIFESTS_TO_READ = 32;
const DEFAULT_BRANCH_CANDIDATES: string[] = ["main", "master", "develop", "trunk"];

const SUPPORTED_MANIFEST_NAMES: Record<string, ManifestKind> = {
  "package.json": "package_json",
  "package-lock.json": "package_lock",
  "pnpm-lock.yaml": "pnpm_lock",
  "yarn.lock": "yarn_lock",
  "requirements.txt": "requirements_txt",
  "pyproject.toml": "pyproject_toml",
  "go.mod": "go_mod",
  "Cargo.toml": "cargo_toml",
  "Cargo.lock": "cargo_lock",
  Gemfile: "gemfile",
  "Gemfile.lock": "gemfile_lock",
  "composer.json": "composer_json",
  "composer.lock": "composer_lock",
  "pom.xml": "pom_xml",
  "build.gradle": "gradle",
  "build.gradle.kts": "gradle",
  ".terraform.lock.hcl": "terraform_lock",
};

export interface ManifestFetchResult {
  repo: GithubRepoRef;
  manifests: StackManifest[];
}

export function parseGithubRepoUrl({
  githubUrl,
}: {
  githubUrl: string;
}): UnsupportedGithubUrlError | GithubRepoRef {
  const parsedUrl = errore.try({
    try: () => {
      return new URL(githubUrl.trim());
    },
    catch: (cause) => {
      return new UnsupportedGithubUrlError({ githubUrl, cause });
    },
  });

  if (errore.isError(parsedUrl)) {
    return parsedUrl;
  }

  if (parsedUrl.hostname !== "github.com") {
    return new UnsupportedGithubUrlError({ githubUrl });
  }

  const pathParts: string[] = parsedUrl.pathname
    .split("/")
    .map((part) => {
      return part.trim();
    })
    .filter((part) => {
      return part.length > 0;
    });

  const owner: string | undefined = pathParts[0];
  const rawRepo: string | undefined = pathParts[1];

  if (!owner || !rawRepo) {
    return new UnsupportedGithubUrlError({ githubUrl });
  }

  const repo: string = rawRepo.endsWith(".git")
    ? rawRepo.slice(0, -".git".length)
    : rawRepo;

  if (!repo) {
    return new UnsupportedGithubUrlError({ githubUrl });
  }

  return {
    owner,
    repo,
    branch: DEFAULT_BRANCH_CANDIDATES[0],
    url: `https://github.com/${owner}/${repo}`,
  };
}

export async function fetchAvailableManifests({
  githubUrl,
}: {
  githubUrl: string;
}): Promise<
  | NoManifestFilesError
  | RemoteFetchError
  | RemoteJsonShapeError
  | RemoteResponseError
  | UnsupportedGithubUrlError
  | ManifestFetchResult
> {
  const repo = parseGithubRepoUrl({ githubUrl });

  if (errore.isError(repo)) {
    return repo;
  }

  const resolvedRepo = await resolveRepoBranch({ repo });

  if (errore.isError(resolvedRepo)) {
    return resolvedRepo;
  }

  const filePaths = await listRepoFiles({ repo: resolvedRepo });

  if (errore.isError(filePaths)) {
    return filePaths;
  }

  const manifestPaths: string[] = filePaths
    .filter((filePath) => {
      return getManifestKind({ filePath }) !== "unknown";
    })
    .slice(0, MAX_MANIFESTS_TO_READ);

  if (manifestPaths.length === 0) {
    return new NoManifestFilesError({ repo: resolvedRepo.url });
  }

  const manifestResults = await Promise.all(
    manifestPaths.map((filePath) => {
      return readRepoManifest({ repo: resolvedRepo, filePath });
    })
  );

  const firstError = manifestResults.find((manifest) => {
    return errore.isError(manifest);
  });

  if (firstError && errore.isError(firstError)) {
    return firstError;
  }

  const manifests: StackManifest[] = manifestResults.filter(isStackManifest);

  if (manifests.length === 0) {
    return new NoManifestFilesError({ repo: resolvedRepo.url });
  }

  return {
    repo: resolvedRepo,
    manifests,
  };
}

async function resolveRepoBranch({
  repo,
}: {
  repo: GithubRepoRef;
}): Promise<
  RemoteFetchError | RemoteJsonShapeError | RemoteResponseError | GithubRepoRef
> {
  const attempts = await Promise.all(
    DEFAULT_BRANCH_CANDIDATES.map(async (branch) => {
      const candidateRepo: GithubRepoRef = {
        ...repo,
        branch,
      };
      const filePaths = await listRepoFiles({ repo: candidateRepo });

      return {
        repo: candidateRepo,
        filePaths,
      };
    })
  );

  const successfulAttempt = attempts.find((attempt) => {
    return !errore.isError(attempt.filePaths);
  });

  if (successfulAttempt && !errore.isError(successfulAttempt.filePaths)) {
    return successfulAttempt.repo;
  }

  const firstError = attempts[0]?.filePaths;

  if (firstError && errore.isError(firstError)) {
    return firstError;
  }

  return new RemoteResponseError({
    operation: "resolve GitHub repository branch",
    url: repo.url,
    status: 404,
    body: "No supported default branch candidate responded.",
  });
}

async function listRepoFiles({
  repo,
}: {
  repo: GithubRepoRef;
}): Promise<RemoteFetchError | RemoteJsonShapeError | RemoteResponseError | string[]> {
  const url = buildGitchamberFilesUrl({ repo });
  const body = await fetchText({ url, operation: "list GitHub repository files" });

  if (errore.isError(body)) {
    return body;
  }

  const parsed = errore.try({
    try: () => {
      return JSON.parse(body) as unknown;
    },
    catch: (cause) => {
      return new RemoteJsonShapeError({
        operation: "parse GitChamber file list",
        url,
        cause,
      });
    },
  });

  if (errore.isError(parsed)) {
    return parsed;
  }

  if (!Array.isArray(parsed)) {
    return new RemoteJsonShapeError({
      operation: "parse GitChamber file list",
      url,
    });
  }

  const paths: string[] = parsed.filter((item): item is string => {
    return typeof item === "string";
  });

  if (paths.length !== parsed.length) {
    return new RemoteJsonShapeError({
      operation: "parse GitChamber file list",
      url,
    });
  }

  return paths;
}

async function readRepoManifest({
  repo,
  filePath,
}: {
  repo: GithubRepoRef;
  filePath: string;
}): Promise<RemoteFetchError | RemoteResponseError | StackManifest> {
  const url = buildGitchamberFileUrl({ repo, filePath });
  const content = await fetchText({
    url,
    operation: "read GitHub repository manifest",
  });

  if (errore.isError(content)) {
    return content;
  }

  return {
    path: filePath,
    kind: getManifestKind({ filePath }),
    content: stripGitchamberLineNumbers({ content }),
  };
}

async function fetchText({
  url,
  operation,
}: {
  url: string;
  operation: string;
}): Promise<RemoteFetchError | RemoteResponseError | string> {
  const response = await errore.tryAsync({
    try: () => {
      return fetch(url, {
        headers: {
          accept: "application/json, text/plain;q=0.9",
        },
      });
    },
    catch: (cause) => {
      return new RemoteFetchError({ operation, url, cause });
    },
  });

  if (errore.isError(response)) {
    return response;
  }

  const body = await errore.tryAsync({
    try: () => {
      return response.text();
    },
    catch: (cause) => {
      return new RemoteFetchError({ operation, url, cause });
    },
  });

  if (errore.isError(body)) {
    return body;
  }

  if (!response.ok) {
    return new RemoteResponseError({
      operation,
      url,
      status: response.status,
      body: body.slice(0, 500),
    });
  }

  return body;
}

function buildGitchamberFilesUrl({ repo }: { repo: GithubRepoRef }): string {
  const path = `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(
    repo.repo
  )}/${encodeURIComponent(repo.branch)}/files`;
  const url = new URL(path, GITCHAMBER_ORIGIN);
  url.searchParams.set("glob", GITCHAMBER_GLOB);
  return url.toString();
}

function buildGitchamberFileUrl({
  repo,
  filePath,
}: {
  repo: GithubRepoRef;
  filePath: string;
}): string {
  const encodedFilePath = filePath
    .split("/")
    .map((part) => {
      return encodeURIComponent(part);
    })
    .join("/");
  const path = `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(
    repo.repo
  )}/${encodeURIComponent(repo.branch)}/files/${encodedFilePath}`;
  const url = new URL(path, GITCHAMBER_ORIGIN);
  url.searchParams.set("glob", GITCHAMBER_GLOB);
  url.searchParams.set("start", "1");
  url.searchParams.set("end", "5000");
  return url.toString();
}

function getManifestKind({ filePath }: { filePath: string }): ManifestKind {
  const name = filePath.split("/").at(-1) || "";
  return SUPPORTED_MANIFEST_NAMES[name] || "unknown";
}

function isStackManifest(
  value:
    | RemoteFetchError
    | RemoteResponseError
    | RemoteJsonShapeError
    | StackManifest
): value is StackManifest {
  return !errore.isError(value);
}

function stripGitchamberLineNumbers({ content }: { content: string }): string {
  return content
    .split("\n")
    .filter((line) => {
      return line.trim() !== "end of file";
    })
    .map((line) => {
      return line.replace(/^\s*\d+\s{2}/, "");
    })
    .join("\n");
}
