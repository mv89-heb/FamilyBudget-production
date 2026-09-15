export type RuleMatchType = "CONTAINS" | "EXACT" | "STARTS_WITH";

export type ClassificationRuleInput = {
  pattern: string;
  matchType: RuleMatchType;
  categoryId: string;
  categoryName?: string;
  priority?: number;
  active?: boolean;
};

export function matchesRule(rule: Pick<ClassificationRuleInput, "pattern" | "matchType">, value: string): boolean {
  const pattern = rule.pattern.trim().toLocaleLowerCase("he");
  const text = value.trim().toLocaleLowerCase("he");
  if (!pattern || !text) return false;
  if (rule.matchType === "EXACT") return text === pattern;
  if (rule.matchType === "STARTS_WITH") return text.startsWith(pattern);
  return text.includes(pattern);
}

export function resolveClassificationRule<T extends ClassificationRuleInput>(rules: readonly T[], values: readonly (string | null | undefined)[]): T | null {
  const haystacks = values.filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  return [...rules]
    .filter((rule) => rule.active !== false)
    .sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100))
    .find((rule) => haystacks.some((value) => matchesRule(rule, value))) ?? null;
}

export function buildRuleText(description?: string | null, note?: string | null, category?: string | null): string {
  return [description, note, category].filter((value): value is string => Boolean(value?.trim())).join(" ").trim();
}
