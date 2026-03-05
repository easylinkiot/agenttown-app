# E2E 命令速查与测试目标（团队版）

> 目标：让团队成员快速知道“该跑什么、为什么跑、失败后先看哪里”。
> 范围：Detox 以 iOS 为主流程；Android 命令保留为手动调试用途，不作为发布门禁。

## 1. 先决条件

在执行任意 iOS E2E 前，先做环境自检：

```bash
npm run e2e:env:check:ios
```

若失败，先参考 [E2E_IOS_ENV_CONSTRAINTS.md](./E2E_IOS_ENV_CONSTRAINTS.md) 修复环境，再运行测试。

## 2. 命令说明（iOS 主流程）

| 命令 | 作用 | 测试目标 | 适用时机 | 预估耗时 |
|---|---|---|---|---|
| `npm run e2e:build:ios` | 构建 iOS Detox Release 包 | 验证可测安装包可正常产出 | 首次执行/依赖变更后 | 3-10 分钟 |
| `npm run e2e:test:ios` | 全量执行 iOS Detox（默认配置） | 检查整体端到端链路可用性 | 本地完整回归 | 5-20 分钟 |
| `npm run e2e:test:smoke:ios` | 执行 `e2e/smoke` | 关键主链路可达性（快速拦截 P0） | 开发中高频自测、提测前 | 2-8 分钟 |
| `npm run e2e:test:core:ios` | 执行 `e2e/core` | 核心业务稳定性（登录/主流程/关键交互） | 每日回归、合并前 | 5-15 分钟 |
| `npm run e2e:test:release:ios` | 执行 `e2e/release` | 发布风险拦截（发布级验收） | 上线前 Gate | 8-25 分钟 |
| `npm run e2e:test:social:ios` | 执行单设备社交闭环用例 | 社交主链路联通（加友/会话/消息） | 社交功能改动后 | 3-10 分钟 |
| `npm run e2e:test:social:ios:dual` | 双设备（A/B）并行执行社交对聊 | 双端协同正确性（发送/接收/会话一致） | 社交实时链路回归 | 8-20 分钟 |
| `npm run e2e:test:social:ios:stability` | 双设备稳定性用例 | 重点场景重复执行稳定性 | Flaky 排查/发版前稳态验证 | 10-30 分钟 |
| `npm run e2e:test:social:ios:full` | `dual + stability + social` 串行全跑 | 社交域完整闭环验收 | 社交模块发布前 | 20-50 分钟 |
| `npm run e2e:test:skills:v2:ios` | 执行 skills v2 API E2E | 验证 skills v2 关键链路（assist + custom skill CRUD） | skills/chat-assist 改造后回归 | 5-15 分钟 |

## 3. 命令说明（兼容别名）

| 命令 | 实际映射 | 使用建议 |
|---|---|---|
| `npm run e2e:build:app` | `e2e:build:ios` | 团队统一走 iOS 时可用该别名 |
| `npm run e2e:test:app` | `e2e:test:ios` | 同上 |
| `npm run e2e:test:smoke` | `e2e:test:smoke:ios` | 推荐日常高频使用 |
| `npm run e2e:test:core` | `e2e:test:core:ios` | 每日回归建议 |
| `npm run e2e:test:release` | `e2e:test:release:ios` | 发布前建议 |

## 4. Android（手动调试）

| 命令 | 用途 | 说明 |
|---|---|---|
| `npm run e2e:build:android` | 构建 Android Detox 包 | 仅手动调试使用，不作为默认门禁 |
| `npm run e2e:test:android` | 执行 Android Detox | 依赖本机 Android 模拟器与环境稳定性 |

## 5. 推荐执行顺序

1. 日常开发自测：`e2e:env:check:ios` -> `e2e:test:smoke`
2. 合并前回归：`e2e:test:core`
3. 社交改动回归：`e2e:test:social:ios:full`
4. skills/chat-assist 改动回归：`e2e:test:skills:v2:ios`
5. 发布前验收：`e2e:test:release`（必要时补 `social:full` 与 `skills:v2`）

## 6. 失败排查速记

1. 卡在 app 启动或 `Detox can't seem to connect`
   - 先跑 `npm run e2e:env:check:ios`
   - 检查本机代理是否绕过 `localhost/127.0.0.1`
   - 确认 iOS Simulator 正常可启动
2. 用例找不到元素
   - 优先检查 `testID` 是否变更
   - 确认首屏弹窗（通知权限/系统弹窗）是否已处理
3. 双设备用例卡住
   - 检查 A/B 设备是否都已启动、账号是否可登录
   - 先单跑 `e2e:test:social:ios:a` 和 `e2e:test:social:ios:b` 定位端别问题

## 7. 用例沉淀与管理

1. 新增/修改用例后，同步更新台账：[e2e-case-registry.md](./e2e-case-registry.md)
2. 用例分层规则与流程规范，参考：[AI_AUTOMATION_E2E_WORKFLOW.md](./AI_AUTOMATION_E2E_WORKFLOW.md)
