export const TEAM_CATEGORIES = ['founder','faculty','board','core'] as const;
export type TeamCategory = typeof TEAM_CATEGORIES[number];
export const TEAM_CATEGORY_LABELS: Record<TeamCategory,string> = {
  founder:'The Founder',faculty:'Faculty',board:'Board of Advisors',core:'Core Team',
};
export function teamCategories(member: {categories?: unknown;category?: string}|null|undefined): TeamCategory[] {
  const stored = Array.isArray(member?.categories)
    ? member.categories.filter(x => TEAM_CATEGORIES.includes(x as TeamCategory)) : [];
  const values = stored.length ? stored : [member?.category || 'faculty'];
  return TEAM_CATEGORIES.filter(x => values.includes(x));
}
export function teamCategoryText(member: {categories?: unknown;category?: string}) {
  return teamCategories(member).map(x=>TEAM_CATEGORY_LABELS[x]).join(' · ');
}
