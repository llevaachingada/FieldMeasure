// Domain types — §3.3 of docs/preflight-handoff-v0.3-hardened.md (copied verbatim).
// Pure module: no DOM, no I/O, no Konva.

export type UUID = string;

/** Geometry is in WORKING-IMAGE PIXELS (float), not normalized 0..1, not screen pixels. */
export type Px = { x: number; y: number };

export type AnnotationType =
  | 'dimension' | 'angle' | 'line' | 'arrow' | 'rect' | 'ellipse'
  | 'polygon' | 'freehand' | 'highlight' | 'text' | 'image';

export interface AnnotationStyle {
  strokeColor: string;        // '#rrggbb'
  strokeWidthMu: number;      // markup units (§4)
  fillColor: string | null;   // null = no fill
  fillAlpha: number;          // 0..1
  lineStyle: 'solid' | 'dashed' | 'dotted';
  arrowheads: 'none' | 'start' | 'end' | 'both';
  fontSizeMu: number;         // text + dimension labels
  bold: boolean;
}

export const DEFAULT_STYLE: AnnotationStyle = {
  strokeColor: '#FF7A18', strokeWidthMu: 4, fillColor: null, fillAlpha: 1,
  lineStyle: 'solid', arrowheads: 'none', fontSizeMu: 18, bold: false,
};

export type Geometry =
  | { kind: 'dimension'; a: Px; b: Px; labelOffset?: number }
  | { kind: 'angle'; a: Px; vertex: Px; c: Px }
  | { kind: 'line'; a: Px; b: Px }
  | { kind: 'arrow'; a: Px; b: Px; elbow?: 'straight' | 'right' | 'curved' }
  | { kind: 'rect'; x: number; y: number; width: number; height: number; cornerRadius?: number }
  | { kind: 'ellipse'; x: number; y: number; width: number; height: number }
  | { kind: 'polygon'; points: Px[]; closed: boolean }
  | { kind: 'freehand'; points: Px[]; pressure: number[] }   // RAW input points, not the smoothed path
  | { kind: 'highlight'; points: Px[]; pressure: number[] }
  | { kind: 'text'; at: Px; text: string; background: 'none' | 'pill' | 'solid' | 'auto' }
  | { kind: 'image'; x: number; y: number; width: number; height: number; rotation: number;
      crop?: { x: number; y: number; width: number; height: number };   // rect in ASSET px (§8.5)
      flipX?: boolean; flipY?: boolean; opacity?: number };

export interface Annotation {
  id: UUID;
  type: AnnotationType;
  geometry: Geometry;            // geometry.kind === type
  valueMm?: number | null;       // canonical length (typed) — source of truth for dimensions
  valueDeg?: number | null;      // canonical angle (typed)
  enteredText?: string | null;   // exactly as entered, e.g. "10'-4 1/2\"" — REPARSED, never trust a cached label
  style: AnnotationStyle;
  zIndex: number;
  source: 'manual' | 'laser' | 'calibrated';   // 'manual' in v1; 'laser'/'calibrated' future
  assetId?: string | null;       // image insets reference an asset file
  groupId?: UUID | null;         // object grouping (Ctrl+G)
  locked: boolean;
  /**
   * Slice 1.6 wiring: the Layers panel's eye toggle. **Absent/null = visible.**
   * Additive and optional so every existing `markup.json` (which has no `visible`)
   * still parses under `strict`; `.nullish()` in `AnnotationZ` is the matching
   * schema translation, so no migration version bump is needed.
   */
  visible?: boolean | null;
  children?: Annotation[];       // image insets only — nested exactly ONE level
}

// NOTE: there is NO `label` field. Labels are DERIVED at render time from
// valueMm/valueDeg + enteredText + project precision + unitFormat (§6.1 formatLength).
// Persisting labels creates stale-measurement bugs when precision or units change.

export interface Sheet {
  id: UUID;
  title: string;
  sortIndex: number;
  imageWidth: number;            // working image size (the coordinate space)
  imageHeight: number;
  calibrationPxPerFoot?: number | null;   // future seam — ALWAYS null in v1 (§2.4)
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export type UnitFormat = 'ft-in' | 'in' | 'ft-decimal';

export interface Project {
  id: UUID;
  title: string;
  jobNumber?: string;
  locationLabel?: string;        // typed site address, not geolocated
  unitSystem: 'imperial' | 'metric';
  unitFormat: UnitFormat;       // how imperial values are DISPLAYED (§6.1)
  precisionDenominator: 2 | 4 | 8 | 16 | 32 | 64;
  schemaVersion: number;
  sheets: Sheet[];
  createdAt: string;
  updatedAt: string;
}
