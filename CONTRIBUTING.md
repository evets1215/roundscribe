# Contributing to Roundscribe

## Branching
- Do not commit directly to `main`.
- Create one branch per task.
- Prefer branch names like:
  - `feature/mobile-patient-list`
  - `fix/add-patient-sheet`
  - `feat/google-auth`

## Pull Requests
Every PR should be focused on one logical change.

Include:
1. What changed
2. Why it changed
3. Screenshots/video for UI changes
4. How to test locally
5. Risks / known limitations

## Before opening a PR
Run:
```bash
npm run build
```
If lint is configured for the current change, run lint too.

## Merge policy
- PR required before merge to `main`
- Prefer squash merge
- Small PRs are strongly preferred over large mixed PRs

## Supervisor workflow
Before merge, the supervisor should review:
- scope clarity
- architecture consistency
- UI regressions
- risky code paths
- missing test/build validation

Suggested decision labels:
- Approve
- Approve with comments
- Request changes
- Block
