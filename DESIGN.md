# Design System — RoundScribe

## Product Context
- **What this is:** AI-powered clinical rounding note tool for inpatient physicians
- **Who it's for:** Hospitalists — attending physicians rounding on 15–20 patients daily in team rooms and at workstations, not bedside
- **Space/industry:** Clinical productivity / medical AI / inpatient documentation tools (alongside Epic, Cerner, Abridge, Nuance DAX)
- **Project type:** Data-dense web app (task-focused, not ambient)

## Aesthetic Direction
- **Direction:** Industrial/Utilitarian with warmth
- **Decoration level:** Minimal — typography does the heavy lifting, color is used as signal not decoration
- **Mood:** "Well-designed rounding sheet." Physicians trust dense, precise, structured information. This system earns that trust through typography and hierarchy, not visual flair. It should feel like a tool built specifically for a hospitalist — not a generic SaaS dashboard with a medical label.
- **Key insight:** Every competitor (Abridge, DAX Copilot, Nabla) uses "safe EHR blue" + white space + card grids, mimicking Epic/Cerner to gain physician trust. RoundScribe takes the opposite position — deep slate + amber makes it look deliberately better than the EHR, not a cousin of it.

## Typography
- **Display / Patient names:** `Fraunces` — variable optical serif, contemporary not stodgy; used for patient name headers, page titles, and SOAP section headings (Subjective, Objective, Assessment & Plan). Adds weight and authority to clinical content without the "old-school medical journal" feel of traditional serifs. Use optical size axis (`opsz`) for large vs. small display usage.
- **UI / Body / Data:** `Geist` — clean, technical, excellent `tabular-nums` support for MRNs and timestamps; used for all UI chrome, labels, stats, body copy
- **Data / Codes:** `Geist Mono` — for MRN numbers and ICD-10 codes only
- **Never use:** Inter, Roboto, Arial, Open Sans, or any of the overused defaults as the primary typeface
- **Loading:** Google Fonts via `next/font/google`

### Type Scale
| Level       | Font             | Size   | Weight | Usage                         |
|-------------|------------------|--------|--------|-------------------------------|
| Display     | Fraunces | 28–36px | 400    | Patient name hero, page H1    |
| H2          | Fraunces | 20–24px | 400    | Section headers (SOAP, panels)|
| H3          | Fraunces | 16–18px | 400    | Card titles, sub-sections     |
| Body        | Geist            | 14–15px | 400    | Note content, descriptions    |
| UI Label    | Geist            | 11–13px | 600    | Table headers, form labels (ALL CAPS + tracking) |
| Caption     | Geist            | 11–12px | 400    | Timestamps, metadata          |
| Mono        | Geist Mono       | 12–13px | 400    | MRN, ICD-10, code blocks      |

## Color
- **Approach:** Restrained — 1 authority color + 1 signal color + neutrals. Color is rare and meaningful.

| Token            | Light         | Dark          | Usage                                   |
|------------------|---------------|---------------|-----------------------------------------|
| `--bg`           | `#fafaf8`     | `#0f1923`     | Page background (warm off-white)        |
| `--surface`      | `#ffffff`     | `#172131`     | Cards, panels, inputs                   |
| `--surface-2`    | `#f4f4f2`     | `#1e2d3d`     | Hover states, nav active bg             |
| `--primary`      | `#1e3a5f`     | `#3b82f6`     | Deep slate navy — nav, headings, links  |
| `--accent`       | `#d97706`     | `#f59e0b`     | Amber — recording states, primary CTAs  |
| `--text`         | `#111827`     | `#e2e8f0`     | Primary text                            |
| `--text-muted`   | `#64748b`     | `#94a3b8`     | Secondary text, metadata                |
| `--border`       | `#e2e8f0`     | `#1e3a5f`     | Default borders                         |
| `--success`      | `#16a34a`     | `#22c55e`     | Note completed, positive state          |
| `--success-bg`   | `#dcfce7`     | `#14532d`     | Success badge backgrounds               |
| `--error`        | `#dc2626`     | `#ef4444`     | Errors, destructive actions             |
| `--error-bg`     | `#fee2e2`     | `#7f1d1d`     | Error badge backgrounds                 |
| `--warning`      | `#d97706`     | `#fbbf24`     | Warnings (same as accent)               |
| `--warning-bg`   | `#fef3c7`     | `#78350f`     | Warning badge backgrounds               |

- **Dark mode strategy:** Redesign surfaces (don't just invert). Deep navy backgrounds, desaturate accent 10%. Primary switches from deep slate to `#3b82f6` for contrast on dark surfaces.
- **The amber rule:** Warm amber (`#d97706`) is the only "loud" color. It appears exactly once at a time — the recording button/pulse, or the primary CTA. Never two amber elements simultaneously.

## Spacing
- **Base unit:** 4px
- **Density:** Comfortable — not consumer-app spacious, not Epic-cramped
- **Scale:** `2` `4` `8` `12` `16` `24` `32` `48` `64` `96`
- **Touch targets:** All interactive elements minimum `44px` in both dimensions

## Layout
- **Approach:** Grid-disciplined (app UI rules — not editorial)
- **Structure:** Fixed sidebar (256px) + scrollable main workspace
- **Max content width:** 1200px
- **Breakpoints:** mobile `375px` / tablet `768px` / desktop `1024px` / wide `1440px`
- **Border radius hierarchy:**
  - `4px` — small elements (badges, tags, inline indicators)
  - `8px` — inputs, buttons, cards
  - `12px` — panels, modals, larger containers
  - `9999px` — pill badges only

## Motion
- **Approach:** Minimal-functional — only transitions that aid comprehension
- **One expressive exception:** The recording pulse — amber glow animation on the active mic button. This is the only animation with personality. Everything else defers to it.
- **Easing:** `ease-out` for entering, `ease-in` for exiting, `ease-in-out` for moving
- **Duration:** micro `50–100ms` / UI transitions `150–250ms` / nothing slower
- **Never:** `transition: all` — list properties explicitly. Never animate layout properties (`width`, `height`, `top`, `left`) — only `transform` and `opacity`.
- **Respect `prefers-reduced-motion`:** Recording pulse should pause if reduced motion is set

## Component Rules
- **Patient names:** Always render in `Fraunces`. The name is the most important identifier in the UI.
- **SOAP section headings (Subjective / Objective / Assessment & Plan):** `Fraunces`, primary color. These are document headings.
- **MRN numbers:** Always `Geist Mono`, `tabular-nums`
- **Status badges:** ALL CAPS, `6px` tracking, pill shape. Pending=slate, In Progress=amber-bg, Updated=green-bg
- **Table header labels:** ALL CAPS, `0.08em` letter-spacing, 11px, muted text — not primary
- **Record button:** The only amber CTA button. Never two amber CTAs on screen simultaneously (see Amber Rule below).

## Task Status System

The care loop tracker uses a 5-state lifecycle for handoff tasks. Each state has a Material Symbols icon, a color, and a text treatment.

| Status | Icon | Color | Text treatment |
|--------|------|-------|----------------|
| `pending` | `radio_button_unchecked` | `--text-muted` | Normal weight, normal color |
| `done` | `check_circle` | `--success` (#16a34a) | Muted text (`--text-muted`) |
| `awaiting_result` | `hourglass_empty` | `--accent` (#d97706 amber) | Normal text |
| `carry_forward` | `arrow_forward` | `--primary` (#1e3a5f) | Normal text |
| `resolved` | `cancel` | `--text-muted` | Muted text + `text-decoration: line-through` |

**Tap-to-cycle:** The status icon is an interactive button. Tapping cycles through `pending → done → awaiting_result → carry_forward` (resolved is a terminal state, not part of the cycle). The icon must be minimum 44×44px touch target.

**Amber Rule for status:** `awaiting_result` intentionally uses amber as a semantic signal — "sent, waiting on result." This is NOT a CTA. Multiple tasks can show amber simultaneously (a list of awaiting lab results is expected). The rule "never two amber elements simultaneously" applies only to CTAs and interactive elements (record button, primary action buttons), not to status state indicators.

## Care Loop UI Patterns

The patient detail screen is the core care loop interface. Three content areas:

1. **Prior note pane** — the yesterday/earlier note; read-only reference; rendered as plain text with `#Problem` headers
2. **Handoff pane** — today's task list; each task has a status icon (tap-to-cycle), a text input, and optional "add item" control; plus a free-text note field below; includes a "Copy Handoff" button
3. **Generated note pane** — AI-generated note shown as a line diff (before/after); user can accept/reject

**Mobile:** Three-pane navigation uses tab chips at the top (`Prior | Handoff | Note`). Only one pane visible at a time. Tab for prior note is disabled until a prior note exists.

**Desktop:** All three panes visible simultaneously in a horizontal split (or configurable column layout).

**"Copy Handoff" button:** Secondary style (not amber). Shows `content_copy` icon + "Copy Handoff" label. On success: transitions to `check` icon + "Copied!" for 2 seconds, then reverts. This is the only transient confirmation pattern in the app.

**Warning state — no prior note:** When generating a note without a prior note loaded, show an inline warning: muted text, `warning` icon, `--warning` color. Not a blocking error — generation still proceeds.

## Interaction Patterns

- **Tap-to-cycle:** Stateful icon buttons that advance through a defined sequence on each tap. Used for task status. The icon itself communicates current state; no separate label needed at the icon level (label may appear in a tooltip or adjacent text for accessibility).
- **Transient confirmation:** After a clipboard copy or other one-shot action, show a success state (icon + label swap) for exactly 2 seconds, then revert to default. Do not use a toast/snackbar for this — inline state change is less disruptive in a task-dense UI.
- **Strikethrough for resolved:** `text-decoration: line-through` on the task text when status is `resolved`. Combined with muted text color. This is the only strikethrough usage in the app.

## CSS Custom Properties
All tokens above must be defined as CSS custom properties on `:root` (light) and `[data-theme="dark"]`. Components reference tokens, never raw hex values.

```css
:root {
  --bg: #fafaf8;
  --surface: #ffffff;
  --surface-2: #f4f4f2;
  --primary: #1e3a5f;
  --accent: #d97706;
  --text: #111827;
  --text-muted: #64748b;
  --border: #e2e8f0;
  --border-2: #cbd5e1;
  --success: #16a34a;
  --success-bg: #dcfce7;
  --error: #dc2626;
  --error-bg: #fee2e2;
  --warning: #d97706;
  --warning-bg: #fef3c7;

  --font-serif: 'Fraunces', Georgia, serif;
  --font-sans: 'Geist', system-ui, sans-serif;
  --font-mono: 'Geist Mono', 'Fira Code', monospace;

  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-full: 9999px;
}
```

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-23 | Initial design system created | /design-consultation; informed by competitive research showing all medical AI tools use generic "EHR blue" — chose deep slate + amber to differentiate |
| 2026-03-23 | Fraunces (variable optical serif) for patient names and SOAP headings | Chose Fraunces over Instrument Serif (too old-school) and Satoshi/sans (loses document feel of SOAP sections). Fraunces reads contemporary while retaining serif authority. |
| 2026-03-23 | Amber as the sole accent color | Recording state is the product's most important moment — it deserves to be unmistakable and undiluted |
| 2026-03-23 | Higher information density than category norm | Hospitalists think in lists (15–20 patients); competitors over-whitespace because they target consumer-app aesthetics; rounding sheet mental model is the right reference |
| 2026-03-28 | Task status system — 5 states with icon+color+text treatment | Care loop pivot: tasks now have a lifecycle (pending→done→awaiting_result→carry_forward→resolved). Each state needs unambiguous visual differentiation at a glance in a dense list. |
| 2026-03-28 | Amber allowed for awaiting_result status (multiple instances OK) | The original amber rule was written for CTAs only. `awaiting_result` is semantic state — multiple tasks awaiting results is normal and expected. Rule clarified: amber CTA = only one; amber status = many is fine. |
| 2026-03-28 | Inline "Copied!" confirmation (2s revert) instead of toast | Task-dense UI has no room for toasts. Inline state swap on the exact button that was tapped is less disruptive and more spatially connected to the action. |
