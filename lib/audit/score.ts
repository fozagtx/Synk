import type { Category, Finding, Scores } from "@/lib/audit/types";

const weights: Record<Finding["severity"], number> = {
  blocker: 40,
  high: 24,
  medium: 12,
  low: 5,
  info: 0,
};
const categories: Category[] = ["deploy", "seo", "perf", "security", "hygiene"];

function isUnavailable({ finding }: { finding: Finding }): boolean {
  return (
    finding.severity === "info" &&
    (/unavailable|could not|couldn't|not detected/i.test(finding.id) ||
      /unavailable|could not|couldn't|not detected/i.test(finding.title))
  );
}

export function scoreFindings({ findings }: { findings: Finding[] }): Scores {
  const categoryScores = categories.reduce<Record<Category, number | null>>(
    (result, category) => {
      const categoryFindings = findings.filter(
        (finding) => finding.category === category,
      );
      const unavailable =
        categoryFindings.length > 0 &&
        categoryFindings.every(({ severity }) => severity === "info") &&
        categoryFindings.every((finding) => isUnavailable({ finding }));

      if (unavailable) {
        return { ...result, [category]: null };
      }

      const penalty = categoryFindings.reduce(
        (sum, finding) => sum + weights[finding.severity],
        0,
      );
      return {
        ...result,
        [category]: Math.max(0, 100 - Math.min(100, penalty)),
      };
    },
    {
      deploy: 100,
      seo: 100,
      perf: 100,
      security: 100,
      hygiene: 100,
    },
  );
  const availableScores = categories
    .map((category) => categoryScores[category])
    .filter((score): score is number => score !== null);
  const overall =
    availableScores.length === 0
      ? 0
      : Math.round(
          availableScores.reduce((sum, score) => sum + score, 0) /
            availableScores.length,
        );

  return {
    ...categoryScores,
    overall,
    launchBlocked: findings.some(
      (finding) => finding.severity === "blocker",
    ),
  };
}
