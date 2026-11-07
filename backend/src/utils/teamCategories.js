/** Team membership is independent of authentication roles.
 * Legacy single-category records remain readable without a database migration.
 */
export const TEAM_CATEGORIES = Object.freeze(['founder','faculty','board','core']);
export function teamCategories(member) {
  const stored = Array.isArray(member?.categories)
    ? member.categories.filter(x => TEAM_CATEGORIES.includes(x)) : [];
  const values = stored.length ? stored : [member?.category || 'faculty'];
  return TEAM_CATEGORIES.filter(x => values.includes(x));
}
export function compareTeam(a,b) {
  const rank = member => {
    const categories = teamCategories(member);
    return categories.length ? TEAM_CATEGORIES.indexOf(categories[0]) : 9;
  };
  return rank(a)-rank(b) || (Number(a.order)||0)-(Number(b.order)||0)
    || String(a.name||'').localeCompare(String(b.name||''));
}
export function teamCategoryFilter(category) {
  return {$or:[{categories:category},
    {categories:{$exists:false},category},{categories:{$size:0},category}]};
}
