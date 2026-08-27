# Repository Instructions

FSP LiveAvatar SLE is a bounded medical-language training prototype. Preserve the documented architecture, medical-training guardrails, privacy boundaries, local-first workflow, and physician/FSP-trainer acceptance gate in `README.md`, `docs/ARCHITECTURE.md`, and the content pack. Do not treat the prototype as medical advice or a production clinical system.

## MC2 Dev Control integration

This repository inherits the shared CONTROL/TASK/REVIEW contracts and role runtime from MC2 Dev Control; those contracts are not duplicated here. `.mc2/project-control.json` locates the repository's authoritative state, plan, validation, release, and Notion mechanisms.

Direct project entry is read-only. Product changes require a separately launched top-level TASK with the centrally approved Full Access profile and an exact authorization packet; acceptance requires a fresh top-level read-only REVIEW. CONTROL may not write this repository. The central subagent ceiling, no-recursive-fan-out rule, and ChatGPT/owner escalation packets apply. No Notion project root is verified, so Notion remains read-only discovery with no invented target. Git/GitHub remain authoritative for code, SHA, PR, and CI.
