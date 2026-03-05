# E2E Case Registry (iOS)

> iOS E2E 用例台账，新增/更新用例时同步维护。

| Case ID | Domain | Priority | Layer | Platform | File | Precondition | Requirement/Bug Link | Last Run | Last Result | Owner | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| AUTH-001 | auth | P0 | smoke | ios | e2e/smoke/chat.mybot.send-message.e2e.js | iOS simulator available | req-guest-login | 2026-02-27 | FAIL | TBD | Detox app connection timeout |
| SKILL-001 | skills | P1 | core | ios | e2e/skills-v2-api.e2e.js | iOS simulator + backend `/v2` available | req-skills-v2-migration | 2026-03-05 | PASS | AI/Codex | Covers `/v2/chat/assist/skills`, `/v2/chat/assist`, `/v2/skills` CRUD |

## 字段说明

1. `Case ID`: 唯一标识，建议 `<DOMAIN>-<number>`
2. `Layer`: `smoke` / `core` / `release`
3. `Platform`: 固定 `ios`
4. `Last Result`: `PASS` / `FAIL` / `SKIP`

## 维护规则

1. 新增功能至少新增或更新 1 条 iOS E2E 并登记。
2. 线上缺陷修复必须补“缺陷复现用例”并登记链接。
3. 连续 3 次 `FAIL` 的用例需在 `Notes` 标注根因和处理计划。
