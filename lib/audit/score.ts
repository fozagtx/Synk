import type { Category, Finding, Scores } from "@/lib/audit/types";

const weights: Record<Finding["severity"], number> = { blocker: 40, high: 24, medium: 12, low: 5, info: 0 };
const categories: Category[] = ["deploy", "seo", "perf", "security", "hygiene"];

export function scoreFindings({ findings }: { findings: Finding[] }): Scores {
  const categoryScores = categories.reduce<Record<Category, number>>((result, category) => {
    const penalty = findings.filter((finding) => finding.category === category).reduce((sum, finding) => sum + weights[finding.severity], 0);
    return { ...result, [category]: Math.max(0, 100 - Math.min(100, penalty)) };
  }, { deploy: 100, seo: 100, perf: 100, security: 100, hygiene: 100 });
  const overall = Math.round(categories.reduce((sum, category) => sum + categoryScores[category], 0) / categories.length);
  return { ...categoryScores, overall, launchBlocked: findings.some((finding) => finding.severity === "blocker") };
}
