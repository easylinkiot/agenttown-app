# Business Case Test Evidence (2026-03-02)

## Scope
- 1v1 chat
- Multi-party chat
- Group chat
- Translation
- Bot
- NPC

Platforms:
- iOS Simulator (Detox)
- Web (Playwright CLI)

## Execution Record
1. Started API backend on `:8080` (local go process) and verified `/healthz`.
2. Ran simulator suite:
   - `npx detox test -c ios.sim.release --cleanup -- --testPathPattern=e2e/business-evidence.e2e.js`
   - Result: PASS, 6 screenshots captured.
3. Ran web capture flow:
   - Logged in with QA account.
   - Opened each business thread route and captured screenshots.
4. API verification:
   - Queried `/v1/chat/threads/{id}/messages` for all 6 threads.
   - Result: all 200 with non-zero message counts.

## Case Matrix
| Case | Thread ID | Simulator | Web | API Messages |
|---|---|---|---|---|
| dm-1v1 | `qadm03011208` | PASS (`uat-dm-1v1-live-ios-20260302.png`) | FAIL (UI shows load error) (`uat-dm-1v1-live-web-20260302.png`) | PASS (200, count=2) |
| multi-party | `qamp03011208` | PASS (`uat-multi-party-live-ios-20260302.png`) | FAIL (UI shows load error) (`uat-multi-party-live-web-20260302.png`) | PASS (200, count=5) |
| group-chat | `qagp03011208` | PASS (`uat-group-chat-live-ios-20260302.png`) | FAIL (UI shows load error) (`uat-group-chat-live-web-20260302.png`) | PASS (200, count=4) |
| translate | `qatr03011208` | PASS (`uat-translate-live-ios-20260302.png`) | FAIL (UI shows load error) (`uat-translate-live-web-20260302.png`) | PASS (200, count=4) |
| bot | `mybot` | PASS (`uat-bot-live-ios-20260302.png`) | FAIL (UI shows load error) (`uat-bot-live-web-20260302.png`) | PASS (200, count=6) |
| npc | `qanp03011208` | PASS (`uat-npc-live-ios-20260302.png`) | FAIL (UI shows load error) (`uat-npc-live-web-20260302.png`) | PASS (200, count=3) |

## Artifacts
- Simulator screenshots: `test-evidence/business-cases/20260302/simulator/`
- Web screenshots: `test-evidence/business-cases/20260302/web/`
- Web DOM checks: `test-evidence/business-cases/20260302/logs/web_case_dom_check.json`
- API message count checks: `test-evidence/business-cases/20260302/logs/api_case_message_counts.json`
- Detox runtime artifacts: `artifacts/ios.sim.release.2026-03-02 07-45-55Z/`

## Current Blocking Issue (Web)
All six web cases render chat input and correct thread header, but also show message-load error:
- `Failed to load messages`
- `this.validatePath is not a function`

This indicates a web-only message loading bug while backend data itself is available.
