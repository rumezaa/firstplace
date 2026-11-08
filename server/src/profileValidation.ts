/** Validate partial profile updates before PostgreSQL casts them. */
export function profileProblem(body: unknown): string | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Send a profile object.';
  const fields = body as Record<string, unknown>;
  if ('name' in fields && (typeof fields.name !== 'string' || !fields.name.trim() || fields.name.length > 100)) {
    return 'Enter a name between 1 and 100 characters.';
  }
  const ages = ['18-24', '25-34', '35-44', '45-54', '55-64', '65+'];
  if ('age_range' in fields && !ages.includes(fields.age_range as string)) return 'Choose an age range. FirstPlace is for adults 18 and older.';
  for (const key of ['incognito', 'familiar_faces_opt_in', 'share_comm_pref', 'share_overlap']) {
    if (key in fields && typeof fields[key] !== 'boolean') return `${key} must be true or false.`;
  }
  for (const key of ['interests', 'topics', 'languages', 'vibe_tags']) {
    if (!(key in fields)) continue;
    const value = fields[key];
    if (!Array.isArray(value) || value.length > 30 || value.some(item => typeof item !== 'string' || !item.trim() || item.length > 100)) {
      return `${key} must contain at most 30 non-empty labels of up to 100 characters.`;
    }
  }
  if ('comm_pref' in fields && fields.comm_pref !== null && (typeof fields.comm_pref !== 'string' || fields.comm_pref.length > 500)) return 'Communication preferences must be at most 500 characters.';
  return null;
}
