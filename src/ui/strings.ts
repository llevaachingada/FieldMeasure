/**
 * The single string table (§12). ALL user-visible text lives here from now on.
 *
 * Slice 0.1 ships it empty by spec (build spec §13/0.1, implementation plan step 4).
 * The inventory to fill it is `docs/appendix-strings.md`; unresolved gaps are in
 * `docs/appendix-strings-gaps.md` (PROPOSED).
 *
 * Do not invent wording the specs already provide — copy from the appendix.
 */
export const STRINGS = {} as const;
