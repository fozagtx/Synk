import * as errore from "errore";

import { RemoteJsonShapeError } from "@/lib/scan/errors";
import type {
  DetectedDependency,
  DetectedStack,
  Ecosystem,
  GithubRepoRef,
  StackManifest,
} from "@/lib/types/scan";

const PACKAGE_JSON_SCOPES: string[] = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
];

const FRAMEWORK_DEPENDENCY_MAP: Record<string, string> = {
  next: "Next.js",
  react: "React",
  vue: "Vue",
  nuxt: "Nuxt",
  svelte: "Svelte",
  "@sveltejs/kit": "SvelteKit",
  express: "Express",
  fastify: "Fastify",
  django: "Django",
  flask: "Flask",
  rails: "Rails",
  laravel: "Laravel",
  spring: "Spring",
  "spring-boot": "Spring Boot",
  terraform: "Terraform",
};

const VENDOR_DEPENDENCY_MAP: Record<string, string> = {
  "@aws-sdk": "AWS",
  "aws-sdk": "AWS",
  "@google-cloud": "Google Cloud",
  "@azure": "Azure",
  stripe: "Stripe",
  sentry: "Sentry",
  "@sentry": "Sentry",
  cloudflare: "Cloudflare",
  auth0: "Auth0",
  firebase: "Firebase",
  supabase: "Supabase",
  vercel: "Vercel",
};

export function extractStack({
  repo,
  manifests,
}: {
  repo: GithubRepoRef;
  manifests: StackManifest[];
}): DetectedStack {
  const dependencies: DetectedDependency[] = dedupeDependencies({
    dependencies: manifests.flatMap((manifest) => {
      return extractManifestDependencies({ manifest });
    }),
  });

  return {
    repo,
    manifests: manifests.map((manifest) => {
      return {
        path: manifest.path,
        kind: manifest.kind,
      };
    }),
    languages: detectLanguages({ manifests, dependencies }),
    frameworks: detectFrameworks({ dependencies }),
    packageManagers: detectPackageManagers({ manifests }),
    vendors: detectVendors({ dependencies }),
    dependencies,
  };
}

function extractManifestDependencies({
  manifest,
}: {
  manifest: StackManifest;
}): DetectedDependency[] {
  if (manifest.kind === "package_json") {
    return extractPackageJsonDependencies({ manifest });
  }

  if (manifest.kind === "composer_json") {
    return extractJsonDependencyBlocks({
      manifest,
      ecosystem: "php",
      scopes: ["require", "require-dev"],
    });
  }

  if (manifest.kind === "requirements_txt") {
    return extractRequirementsTxtDependencies({ manifest });
  }

  if (manifest.kind === "go_mod") {
    return extractGoModDependencies({ manifest });
  }

  if (manifest.kind === "cargo_toml") {
    return extractSimpleTomlDependencies({ manifest, ecosystem: "rust" });
  }

  if (manifest.kind === "gemfile") {
    return extractGemfileDependencies({ manifest });
  }

  if (manifest.kind === "pom_xml") {
    return extractPomDependencies({ manifest });
  }

  if (manifest.kind === "gradle") {
    return extractGradleDependencies({ manifest });
  }

  if (manifest.kind === "terraform_lock") {
    return extractTerraformProviderDependencies({ manifest });
  }

  return [];
}

export function extractPackageJsonDependencies({
  manifest,
}: {
  manifest: StackManifest;
}): DetectedDependency[] {
  return extractJsonDependencyBlocks({
    manifest,
    ecosystem: "npm",
    scopes: PACKAGE_JSON_SCOPES,
  });
}

function extractJsonDependencyBlocks({
  manifest,
  ecosystem,
  scopes,
}: {
  manifest: StackManifest;
  ecosystem: Ecosystem;
  scopes: string[];
}): DetectedDependency[] {
  const parsed = errore.try({
    try: () => {
      return JSON.parse(manifest.content) as unknown;
    },
    catch: (cause) => {
      return new RemoteJsonShapeError({
        operation: `parse ${manifest.path}`,
        url: manifest.path,
        cause,
      });
    },
  });

  if (errore.isError(parsed) || !isRecord(parsed)) {
    return [];
  }

  return scopes.flatMap((scope) => {
    const block = parsed[scope];

    if (!isRecord(block)) {
      return [];
    }

    return Object.entries(block).map(([name, rawVersion]) => {
      return {
        name,
        version: normalizeVersion({ rawVersion }),
        ecosystem,
        sourceFile: manifest.path,
        scope,
      };
    });
  });
}

function extractRequirementsTxtDependencies({
  manifest,
}: {
  manifest: StackManifest;
}): DetectedDependency[] {
  return manifest.content
    .split("\n")
    .map((line) => {
      return line.trim();
    })
    .filter((line) => {
      return line.length > 0 && !line.startsWith("#");
    })
    .map((line) => {
      const match = line.match(/^([A-Za-z0-9_.-]+)\s*([<>=!~]=?|===)?\s*([^;\s#]+)?/);
      const name = match?.[1] || line;
      const version = match?.[3] || null;

      return {
        name,
        version,
        ecosystem: "python",
        sourceFile: manifest.path,
        scope: "requirements",
      };
    });
}

function extractGoModDependencies({
  manifest,
}: {
  manifest: StackManifest;
}): DetectedDependency[] {
  return manifest.content
    .split("\n")
    .map((line) => {
      return line.trim();
    })
    .filter((line) => {
      return /^[A-Za-z0-9_.-]+\/[^\s]+\s+v?[0-9]/.test(line);
    })
    .map((line) => {
      const parts: string[] = line.split(/\s+/);

      return {
        name: parts[0] || line,
        version: normalizeVersion({ rawVersion: parts[1] || null }),
        ecosystem: "go",
        sourceFile: manifest.path,
        scope: "require",
      };
    });
}

function extractSimpleTomlDependencies({
  manifest,
  ecosystem,
}: {
  manifest: StackManifest;
  ecosystem: Ecosystem;
}): DetectedDependency[] {
  return manifest.content
    .split("\n")
    .map((line) => {
      return line.trim();
    })
    .filter((line) => {
      return /^[A-Za-z0-9_.-]+\s*=/.test(line);
    })
    .map((line) => {
      const [rawName, rawVersion] = line.split("=", 2);

      return {
        name: rawName?.trim() || line,
        version: normalizeVersion({
          rawVersion: rawVersion?.replaceAll('"', "").trim() || null,
        }),
        ecosystem,
        sourceFile: manifest.path,
        scope: "dependencies",
      };
    });
}

function extractGemfileDependencies({
  manifest,
}: {
  manifest: StackManifest;
}): DetectedDependency[] {
  return manifest.content
    .split("\n")
    .map((line) => {
      return line.trim();
    })
    .filter((line) => {
      return line.startsWith("gem ");
    })
    .map((line) => {
      const match = line.match(/gem\s+["']([^"']+)["'](?:,\s*["']([^"']+)["'])?/);

      return {
        name: match?.[1] || line,
        version: normalizeVersion({ rawVersion: match?.[2] || null }),
        ecosystem: "ruby",
        sourceFile: manifest.path,
        scope: "gem",
      };
    });
}

function extractPomDependencies({
  manifest,
}: {
  manifest: StackManifest;
}): DetectedDependency[] {
  return manifest.content
    .split("</dependency>")
    .map((block): DetectedDependency | null => {
      const groupId = block.match(/<groupId>([^<]+)<\/groupId>/)?.[1];
      const artifactId = block.match(/<artifactId>([^<]+)<\/artifactId>/)?.[1];
      const version = block.match(/<version>([^<]+)<\/version>/)?.[1] || null;

      if (!artifactId) {
        return null;
      }

      return {
        name: groupId ? `${groupId}:${artifactId}` : artifactId,
        version: normalizeVersion({ rawVersion: version }),
        ecosystem: "java",
        sourceFile: manifest.path,
        scope: "dependency",
      };
    })
    .filter(isDetectedDependency);
}

function extractGradleDependencies({
  manifest,
}: {
  manifest: StackManifest;
}): DetectedDependency[] {
  return manifest.content
    .split("\n")
    .map((line) => {
      return line.trim();
    })
    .map((line): DetectedDependency | null => {
      const match = line.match(
        /(?:implementation|api|compileOnly|runtimeOnly|testImplementation)\s+["']([^:"']+):([^:"']+):([^"']+)["']/
      );

      if (!match) {
        return null;
      }

      return {
        name: `${match[1]}:${match[2]}`,
        version: normalizeVersion({ rawVersion: match[3] || null }),
        ecosystem: "java",
        sourceFile: manifest.path,
        scope: "gradle",
      };
    })
    .filter(isDetectedDependency);
}

function extractTerraformProviderDependencies({
  manifest,
}: {
  manifest: StackManifest;
}): DetectedDependency[] {
  return manifest.content
    .split("\n")
    .map((line) => {
      return line.trim();
    })
    .filter((line) => {
      return line.startsWith("provider ");
    })
    .map((line) => {
      const match = line.match(/provider\s+"([^"]+)"/);
      const name = match?.[1]?.replace("registry.terraform.io/", "") || line;

      return {
        name,
        version: null,
        ecosystem: "terraform",
        sourceFile: manifest.path,
        scope: "provider",
      };
    });
}

function detectLanguages({
  manifests,
  dependencies,
}: {
  manifests: StackManifest[];
  dependencies: DetectedDependency[];
}): string[] {
  const manifestLanguages: string[] = manifests
    .map((manifest) => {
      if (
        manifest.kind === "package_json" ||
        manifest.kind === "package_lock" ||
        manifest.kind === "pnpm_lock" ||
        manifest.kind === "yarn_lock"
      ) {
        return "JavaScript/TypeScript";
      }

      if (
        manifest.kind === "requirements_txt" ||
        manifest.kind === "pyproject_toml"
      ) {
        return "Python";
      }

      if (manifest.kind === "go_mod") {
        return "Go";
      }

      if (manifest.kind === "cargo_toml" || manifest.kind === "cargo_lock") {
        return "Rust";
      }

      if (manifest.kind === "gemfile" || manifest.kind === "gemfile_lock") {
        return "Ruby";
      }

      if (manifest.kind === "composer_json" || manifest.kind === "composer_lock") {
        return "PHP";
      }

      if (manifest.kind === "pom_xml" || manifest.kind === "gradle") {
        return "Java";
      }

      if (manifest.kind === "terraform_lock") {
        return "Terraform";
      }

      return "";
    })
    .filter((language) => {
      return language.length > 0;
    });

  const dependencyLanguages: string[] = dependencies
    .map((dependency) => {
      return ecosystemToLanguage({ ecosystem: dependency.ecosystem });
    })
    .filter((language) => {
      return language.length > 0;
    });

  return uniqueStrings({ values: [...manifestLanguages, ...dependencyLanguages] });
}

function detectFrameworks({
  dependencies,
}: {
  dependencies: DetectedDependency[];
}): string[] {
  return uniqueStrings({
    values: dependencies
      .map((dependency) => {
        const normalizedName = dependency.name.toLowerCase();
        return FRAMEWORK_DEPENDENCY_MAP[normalizedName] || "";
      })
      .filter((framework) => {
        return framework.length > 0;
      }),
  });
}

function detectPackageManagers({
  manifests,
}: {
  manifests: StackManifest[];
}): string[] {
  return uniqueStrings({
    values: manifests
      .map((manifest) => {
        if (manifest.kind === "package_lock") {
          return "npm";
        }

        if (manifest.kind === "pnpm_lock") {
          return "pnpm";
        }

        if (manifest.kind === "yarn_lock") {
          return "yarn";
        }

        if (manifest.kind === "composer_lock") {
          return "composer";
        }

        if (manifest.kind === "cargo_lock") {
          return "cargo";
        }

        if (manifest.kind === "gemfile_lock") {
          return "bundler";
        }

        if (manifest.kind === "go_mod") {
          return "go modules";
        }

        return "";
      })
      .filter((manager) => {
        return manager.length > 0;
      }),
  });
}

function detectVendors({
  dependencies,
}: {
  dependencies: DetectedDependency[];
}): string[] {
  return uniqueStrings({
    values: dependencies
      .map((dependency) => {
        const normalizedName = dependency.name.toLowerCase();
        const matchedKey =
          Object.keys(VENDOR_DEPENDENCY_MAP).find((key) => {
            return (
              normalizedName === key || normalizedName.startsWith(`${key}/`)
            );
          }) || "";

        return matchedKey ? VENDOR_DEPENDENCY_MAP[matchedKey] || "" : "";
      })
      .filter((vendor) => {
        return vendor.length > 0;
      }),
  });
}

function dedupeDependencies({
  dependencies,
}: {
  dependencies: DetectedDependency[];
}): DetectedDependency[] {
  const byKey: Record<string, DetectedDependency> = dependencies.reduce(
    (accumulator, dependency) => {
      const key = [
        dependency.ecosystem,
        dependency.name.toLowerCase(),
        dependency.version || "unknown",
        dependency.sourceFile,
      ].join(":");

      if (accumulator[key]) {
        return accumulator;
      }

      return {
        ...accumulator,
        [key]: dependency,
      };
    },
    {} as Record<string, DetectedDependency>
  );

  return Object.values(byKey).sort((left, right) => {
    return left.name.localeCompare(right.name);
  });
}

function normalizeVersion({ rawVersion }: { rawVersion: unknown }): string | null {
  if (typeof rawVersion !== "string") {
    return null;
  }

  const normalized = rawVersion
    .trim()
    .replace(/^[\s~^<>=!]+/, "")
    .replace(/^v/, "");

  return normalized.length > 0 ? normalized : null;
}

function ecosystemToLanguage({ ecosystem }: { ecosystem: Ecosystem }): string {
  if (ecosystem === "npm") {
    return "JavaScript/TypeScript";
  }

  if (ecosystem === "python") {
    return "Python";
  }

  if (ecosystem === "go") {
    return "Go";
  }

  if (ecosystem === "rust") {
    return "Rust";
  }

  if (ecosystem === "ruby") {
    return "Ruby";
  }

  if (ecosystem === "php") {
    return "PHP";
  }

  if (ecosystem === "java") {
    return "Java";
  }

  if (ecosystem === "terraform") {
    return "Terraform";
  }

  return "";
}

function uniqueStrings({ values }: { values: string[] }): string[] {
  return Array.from(new Set(values)).sort((left, right) => {
    return left.localeCompare(right);
  });
}

function isDetectedDependency(
  value: DetectedDependency | null
): value is DetectedDependency {
  return value !== null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
