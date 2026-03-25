# TODOS

## Copy to EHR button

**What:** One-click "Copy to EHR" button in the generated note view, with brief "Copied!"
visual feedback after clicking.

**Why:** Every note use ends with the doctor copying the generated note into their EHR.
Currently requires manual text selection + copy. During a pilot with 15-20 patients/day,
this fires 15-20 times daily. Post-pilot: if the hospitalist flags copy friction, this is
the fix.

**How to apply:** Add a `<button onClick={() => { navigator.clipboard.writeText(...); setJustCopied(true); setTimeout(() => setJustCopied(false), 1500); }}>` near the generated note output. Use the existing copy icon from the design system.

**Pros:** Removes a repeated micro-friction from every interaction. 15-20 times/day × 5 days = 75-100 interactions in the pilot.
**Cons:** Defers until we have pilot signal that copy friction is real (vs. imagined).
**Context:** Identified during /plan-ceo-review on 2026-03-24. Cherry-pick candidate but
deferred pending pilot feedback. If the hospitalist mentions copying as annoying, ship this
immediately — it's a ~30-minute change.
**Depends on:** Prior note persistence PR (current)
