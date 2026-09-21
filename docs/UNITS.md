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

Rejected: `abc`, `4 1/0` (zero denominator), empty string, and — **added in session 4** —

| Rejected | Why |
|---|---|
| `-5`, `-5 1/2`, `-10' 4"` | **Lengths are non-negative (D22).** `-5` previously returned **+5** — a silent sign flip. The leading dash is the ft-in *separator* and is stripped only after a feet mark. |
| `10′-4 ½″` | Unicode **primes** (`′ ″`) are normalized; **vulgar fractions** (`½ ¼ ¾`) are not (D21). The spec's test table asserted this parsed to 124.5; executed, it returns `null`. |

## Commit guards (session 4 — these are wrong-measurement gates)

`Enter` is gated on **`isCommittableInches(value)`**, not on null/NaN:

| Rule | Rejected example | What used to happen |
|---|---|---|
| value `> 0` | `0` | committed a **0″ dimension** |
| value `≤ 1000 ft` (`MAX_LENGTH_IN = 12000`) | `999999` | committed |
| numerator **<** denominator | `12 6 20` | committed **151.25″** — 1.25″ the user never typed, label `12'-7 1/4"` |
| denominator ∈ {2, 4, 8, 16, 32, 64} | `10' 4 99/100` | committed 124.99″ at an out-of-enum denominator |

A blocked commit must **say why** in the preview area — a disabled button with no explanation reads
as a broken app in the field.

## Accepted metric input (when unit system = metric)

`1245 mm` · `124.5 cm` · `1.245 m` — a bare number is treated as millimeters.

## Keypad input model (v0.3)

The **strict parser** (`parseImperialToInches`) only accepts explicit forms and rejects `12 6` — by
design. The keypad is the fuzzy layer (slot state machine + `parseLooseToSlots`, build spec §6.1.1):

| Typed (hardware or on-screen) | Means | Composed `enteredText` |
|---|---|---|
| `12 6` | 12 ft 6 in | `12'-6"` |
| `12 6 3` | 12 ft 6 in + 3/16 (project precision) | `12'-6 3/16"` |
| `12' 6 3/8` | explicit — slots mirror the marks | `12'-6 3/8"` |
| `124.5` | 124.5 in (bare number = inches) | raw decimal kept |
| `4-1/2` | 4½ in | `4 1/2"` |

**A slot holding `'0'` is not an entered slot (session 4).** `'0'` is a truthy string, so the
composer used to emit `12'-6 0/16"`, `0'-4"`, and a bare `"`. Presence means a **positive** value,
and `composeEnteredText` and `keypadValueInches` must use the **same** presence test — if they
disagree, the live preview and the stored `enteredText` diverge.

The composed text **must round-trip the strict parser to the same value** (property-tested — build
spec §6.1). The preview is computed from the slots, never by re-parsing the display string.

## Formatting (imperial display)

Construction style, rounded to the project's precision denominator (default 1/16"), fraction reduced,
with carry (`16/16` → next inch, `12"` → next foot):

- `124.5 in` → `10'-4 1/2"`
- `11.99 in` → `1'-0"`
- `0.5 in` → `1/2"`

Unit formats (`project.unitFormat`): `ft-in` → `10'-4 1/2"` · `in` → total inches (`124.5 in` →
`124 1/2"`, no feet decomposition) · `ft-decimal` → `10.38'`.

## Precision

`precisionDenominator` ∈ {2, 4, 8, 16, 32, 64}; default 16. **Project-level** (one source of truth):
the Dimension style panel and the keypad's fraction chips edit the project value; every label derives
from it at render time. Labels are never persisted — a stale cached label after a precision/unit
change is a wrong-measurement bug, and the schema has no `label` field at all.

## Reference

- Parser, formatter, keypad model: `src/domain/units.ts` (build spec §6.1 + §6.1.1).
- Tests: `tests/units.test.ts`, `tests/keypad.test.ts`.
- **The four highest-stakes pure modules: snapping, ft-in parsing, the keypad slot model, and the
  export scaling rules** — a bug in any is a wrong measurement or a wrong artifact. Keep their tests
  exhaustive.
