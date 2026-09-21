/**
 * src/export/filenames.ts — hardened export filename sanitizer + conflict policy.
 *
 * Build spec §9.4 (rules) + §19.4(c)/(d) (case-insensitive conflicts, normative order).
 * Implementation-plan slice 1.9 build-order step 1 is the authority on ORDER; order is
 * load-bearing (truncating after stripping trailing dots/spaces can re-expose one, and the
 * reserved-device check must see the BASE, not the whole token — `con.jpg` is reserved).
 *
 * Pure module: no DOM, no Konva, no React, no imports. Node/browser-neutral.
 */

const ILLEGAL = /[<>:"/\\|?*\u0000-\u001F\u007F-\u009F]/g;
const RESERVED = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
const EXT = /^\.[A-Za-z0-9]{1,8}$/; // what counts as an extension, so `. more` doesn't

/** One token (project title, sheet name, date, …). ORDER IS PART OF THE SPEC. */
export function sanitizeToken(raw: string): string {
  // 1. illegal + C0/C1 control chars, leading spaces, trailing dots/spaces (whole token first —
  //    doing this after the extension split turns `foo...` into `foo.`)
  let t = raw
    .normalize('NFC')
    .replace(ILLEGAL, '')
    .replace(/^\s+/, '')
    .replace(/[.\s]+$/, '');
  // 2. split a REAL extension off, so §9.4's "device name with or without extension" and the
  //    trailing-dot rule both apply to the BASE (`con.jpg` is reserved; `z….  more` is not an ext)
  const d = t.lastIndexOf('.');
  let base = t,
    ext = '';
  if (d > 0 && EXT.test(t.slice(d))) {
    base = t.slice(0, d);
    ext = t.slice(d);
  }
  base = base.replace(/[.\s]+$/, ''); // 3. `foo .jpg` → `foo.jpg`
  // 4. cap at 48 INCLUDING the extension
  if (base.length + ext.length > 48) base = base.slice(0, Math.max(0, 48 - ext.length));
  base = base.replace(/[.\s]+$/, ''); // 5. RE-STRIP — the cut can expose one
  if (base === '') return 'untitled'; // 6. never empty
  if (RESERVED.test(base)) base = '_' + base; // 7. DOS device name
  return base + ext;
}

/** Join, then apply the SAME rules to the joined base — clean tokens can join into `CON`. */
export function joinFilename(tokens: string[], ext: string): string {
  let base = tokens.map(sanitizeToken).join('_');
  if (base.length > 120) base = base.slice(0, 120);
  base = base.replace(/[.\s]+$/, '');
  if (base === '') base = 'untitled';
  const d = base.lastIndexOf('.');
  const stem = d > 0 && EXT.test(base.slice(d)) ? base.slice(0, d) : base;
  if (RESERVED.test(stem)) base = '_' + base;
  return `${base}.${ext}`;
}

/** SESSION-4 FIX (P7): NTFS IS CASE-INSENSITIVE. `Sheet.pdf` and `sheet.pdf` are ONE file on
 *  disk but two different strings in JS. Comparing case-sensitively means `Overwrite` silently
 *  destroys an unrelated export and `Add (1)` never triggers. Fold case AND normalize Unicode
 *  on BOTH sides, everywhere a conflict is detected. */
const key = (n: string) => n.normalize('NFC').toLowerCase();

export function conflictName(
  existing: string[],
  name: string,
  policy: 'add' | 'overwrite' | 'skip',
): string | null {
  const taken = new Set(existing.map(key));
  if (!taken.has(key(name))) return name;
  if (policy === 'overwrite') return name;
  if (policy === 'skip') return null;
  const dot = name.lastIndexOf('.');
  const [b, e] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
  for (let i = 1; i < 1000; i++) {
    const c = `${b} (${i})${e}`;
    if (!taken.has(key(c))) return c;
  }
  throw new Error('too many conflicts');
}
