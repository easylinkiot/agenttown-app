# Business Case Test Evidence (Fixed) - 2026-03-02

## Root Cause Fixed
Web chat loading failed with:
- `Failed to load messages`
- `this.validatePath is not a function`

Fix applied in:
- `src/state/agenttown-context.tsx`

Changes:
- Disabled file-system message cache on Web (`Platform.OS === "web"`).
- Added defensive `try/catch` around cache path resolution and cache writes.

## Full Re-test Scope
- 1v1 chat
- Multi-party chat
- Group chat
- Translation
- Bot
- NPC

Platforms:
- iOS Simulator (Detox)
- Web (Playwright)

## Execution
1. iOS Simulator re-run:
   - `npx detox test -c ios.sim.release --cleanup -- --testPathPattern=e2e/business-evidence.e2e.js`
   - Result: PASS (6/6 screenshots captured)
2. Web re-run:
   - login with QA account
   - open each business thread URL
   - capture screenshot per case
   - DOM check: no `Failed to load messages` and no `this.validatePath is not a function`
3. API verification:
   - `/v1/chat/threads/{id}/messages` for all 6 cases
   - Result: all HTTP 200 with non-zero message counts

## Final Matrix
| Case | Thread ID | Simulator | Web | API |
|---|---|---|---|---|
| dm-1v1 | `qadm03011208` | PASS | PASS | PASS (200, count=2) |
| multi-party | `qamp03011208` | PASS | PASS | PASS (200, count=5) |
| group-chat | `qagp03011208` | PASS | PASS | PASS (200, count=4) |
| translate | `qatr03011208` | PASS | PASS | PASS (200, count=4) |
| bot | `mybot` | PASS | PASS | PASS (200, count=6) |
| npc | `qanp03011208` | PASS | PASS | PASS (200, count=3) |

## Artifacts
- Simulator screenshots: `test-evidence/business-cases/20260302-fixed/simulator/`
- Web screenshots: `test-evidence/business-cases/20260302-fixed/web/`
- Web DOM checks: `test-evidence/business-cases/20260302-fixed/logs/web_case_dom_check.json`
- API checks: `test-evidence/business-cases/20260302-fixed/logs/api_case_message_counts.json`
- Detox run folder: `artifacts/ios.sim.release.2026-03-02 07-57-04Z/`
