# AgentTown 团队自动化研发与验收流程（iOS E2E 专用）

> 范围声明：本项目 Detox E2E 仅支持 iOS。Android 不在该流程覆盖范围内。

## 1. 目标

固化一条团队可执行流水线：

需求输入 -> 自动实现前后端 -> 自动重启服务 -> 后端 API 运行时验证 -> 自动生成/更新前端 E2E -> 自动执行 iOS 验收 -> 用例沉淀与周期回归 -> 上线门禁

## 2. 路径约定（团队复用）

```bash
export WORKSPACE_ROOT="$(pwd)"
export FRONTEND_DIR="$WORKSPACE_ROOT/AgentTown"
export BACKEND_DIR="$WORKSPACE_ROOT/agenttown-api"
```

只使用相对路径与变量，不写个人本机绝对路径。

## 2.1 平台约束

1. Detox 配置仅保留 `ios.sim.release`
2. CI 仅执行 iOS E2E 任务
3. Android 由单测/API/人工冒烟保障，不纳入 Detox 门禁

## 3. 标准执行链路（每次需求都走）

命令用途与测试目标速查：[E2E_COMMANDS_QUICK_GUIDE.md](./E2E_COMMANDS_QUICK_GUIDE.md)

1. 需求澄清
- 输入：业务目标、验收标准、影响模块。
- 输出：实现清单（前端/后端/测试）。

2. 自动编码
- 前端：`$FRONTEND_DIR`
- 后端：`$BACKEND_DIR`

3. 自动重启服务

```bash
cd "$BACKEND_DIR"
make compose-down
make compose-up

cd "$FRONTEND_DIR"
npm run start:clean
```

4. 后端 API 运行时验证

```bash
cd "$BACKEND_DIR"
./scripts/smoke_local.sh
go test ./...
```

5. 自动生成/更新 E2E 用例（iOS）
- 用例目录：`$FRONTEND_DIR/e2e/`
- 至少新增/更新 1 条主链路。

6. 自动执行 iOS 验收

```bash
cd "$FRONTEND_DIR"
npm run e2e:env:check:ios
npm run e2e:test:smoke
# 需要更高覆盖时：
npm run e2e:test:core
npm run e2e:test:release
```

7. 输出结果
- 通过/失败结论。
- 失败项 + 根因 + 修复动作 + 重跑结果。

## 4. E2E 测试目标标准

每条 E2E 至少覆盖以下之一：

1. 业务可达性
- 核心用户流程端到端可完成。

2. 数据链路正确性
- 前端动作触发后端变更并回显。

3. 上线风险拦截
- 覆盖 P0 场景（登录、核心交互、保存提交）。

4. 回归稳定性
- 同设备重复执行结果稳定。

## 5. E2E 生成规则

### 5.1 覆盖规则

每个新功能默认生成三类：

1. `happy path`
2. `validation/error path`
3. `reopen/persistence path`

### 5.2 设计规则

1. 单用例单目标（一个 `it` 一件事）
2. 优先 `testID`（不依赖文案）
3. 禁止硬编码 `sleep`，统一 `waitFor(...).withTimeout(...)`
4. 用例可重入（不依赖历史数据）
5. 断言可诊断（明确失败点）

### 5.3 命名与目录

```text
e2e/
  smoke/
  core/
  release/
```

命名：`<domain>.<feature>.<scenario>.e2e.js`

## 6. 用例管理与持续扩展

1. 台账维护
- 文件：`docs/e2e-case-registry.md`
- 字段：Case ID / 域 / 优先级 / 分层 / 前置条件 / 关联需求 / 最近结果。

2. 变更驱动
- 核心流程变更：必须更新/新增 E2E。
- 线上缺陷修复：必须补“缺陷复现用例”。

3. 失效治理
- 连续 3 次 flaky：降级出 `smoke`。
- 长期无价值用例：评估归档。

## 7. 定时回归策略（iOS）

1. 工作时段：每 2-4 小时 `smoke`
2. 每日收工前：`core`
3. 上线前：`release`

## 8. 上线门禁（iOS）

必须全部通过：

1. 后端
- `go test ./...`
- `./scripts/smoke_local.sh`

2. 前端质量
- `npm run check`

3. iOS E2E
- `npm run e2e:env:check:ios`
- `npm run e2e:test:smoke`
- 发布前补充：`npm run e2e:test:release`

任一失败即阻断发布。

## 9. 总结输出模板（每次执行后）

```markdown
## 执行总结
- 需求: <一句话>
- 代码变更: <前端/后端/测试>
- API 验证: PASS/FAIL
- iOS E2E: PASS/FAIL
- 阻塞项: <无则写无>
- 风险等级: 低/中/高

## 数据
- smoke: x/y
- core: x/y
- release: x/y
- 总耗时: xx min

## 建议
1. <建议1>
2. <建议2>
3. <建议3>
```

## 10. 协作指令模板

1. 全流程
- “按 iOS 流程执行需求 xxx，失败修到通过并给总结。”

2. 回归
- “跑 iOS smoke/core/release，更新台账并给失败清单。”

3. 上线前
- “执行 iOS release gate，通过后给发布建议。”
