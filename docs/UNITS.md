# Units

Canonical storage, accepted input, formatting, and rounding for lengths and angles.

## Canonical storage

- Lengths are stored as **millimeters** (`valueMm`, number) **plus the raw text exactly as typed**
  (`enteredText`). The display string (`label`) is derived at render time — never the source of truth.
- Angles are stored as **degrees** (`valueDeg`).
- 1 inch = 25.4 mm exactly. 1/16 in = 1.5875 mm.
- 1 markup unit (mu) = 1/96 inch (style sizing only; not a measurement).

## Accepted imperial input

A space or dash is required between whole inches and a fraction.

| Input | Means |
|---|---|
| `10'` | 10 feet |
| `10' 4"` | 10 ft 4 in |
| `10'-4 1/2"` | 10 ft 4-1/2 in |
| `10 ft 4 in` | 10 ft 4 in |
| `4-1/2` | 4-1/2 in (no feet) |
| `1/2"` | 0.5 in |
| `124.5` | 124.5 in (bare number = inches) |

Rejected: `abc`, `4 1/0` (zero denominator), empty string.

## Accepted metric input (when unit system = metric)

`1245 mm` · `124.5 cm` · `1.245 m` — a bare number is treated as millimeters.

## Formatting (imperial display)

Construction style, rounded to the project's precision denominator (default 1/16"), fraction reduced,
with carry (`16/16` → next inch, `12"` → next foot):

- `124.5 in` → `10'-4 1/2"`
- `11.99 in` → `1'-0"`
- `0.5 in` → `1/2"`

## Precision

`precisionDenominator` ∈ {2, 4, 8, 16, 32, 64}; default 16. Stored on the project; the keypad's
fraction chips set it and remember it for the next dimension.

## Reference

- Parser & formatter: `src/domain/units.ts` (spec §6.1).
- Tests: `tests/units.test.ts`.
- **Snapping and ft-in parsing are the two highest-stakes pure modules** — a bug there is a wrong
  measurement on a job site. Keep their tests exhaustive.
