# Supervisor Review Guide

Use this checklist when reviewing a PR.

## Review for
- Scope: Is the PR doing one thing clearly?
- Product fit: Does the change match the request?
- UX: Any obvious regressions or confusing flows?
- Code safety: Any risky changes, dead code, broken states, or missing guards?
- Build confidence: Did the author run build/test steps?
- Deployment risk: Any env vars, infra, or migration risks?

## Decision options
### Approve
Use when the change is focused, tested, and safe to merge.

### Approve with comments
Use when minor follow-ups are acceptable after merge.

### Request changes
Use when behavior is incorrect, incomplete, or risky.

### Block
Use when the PR should not land in current form.

## Reusable supervisor prompt
"Review this PR as the supervisor. Check scope clarity, architecture consistency, UI regressions, risky code paths, and whether it is safe to merge. Return: summary, risks, and decision: approve / approve with comments / request changes / block."
