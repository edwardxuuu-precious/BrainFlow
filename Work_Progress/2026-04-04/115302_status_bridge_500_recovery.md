# 任务记录

## 任务名称
- 修复 live bridge 500 被误诊为“未连接服务”，并为 dev supervisor 增加 API 健康自愈

## 执行时间
- 开始时间：2026-04-04 11:53:02
- 结束时间：2026-04-04 12:12:10

## 仓库根目录
- C:/Users/edwar/Desktop/BrainFlow

## 任务目标
- 修复 `/api/codex/status` 内部异常导致的裸 `500`
- 让前端区分“bridge 不可达”和“bridge 在线但状态检查失败”
- 让 `pnpm dev` 下的 supervisor 能在 API 持续返回异常状态时自动重启 bridge

## 解决的问题
- `/api/codex/status` 与 `/api/codex/revalidate` 的意外异常现在会返回结构化 JSON 错误，不再裸返回 `500 Internal Server Error`。
- `createCodexBridge().getStatus()` 改为降级返回部分状态：`runner.getStatus()` 或 `promptStore.loadPrompt()` 任一失败时，不再直接抛出异常打断整个状态接口。
- 前端 `ai-client` 现在能区分 `bridge_unavailable` 与 `bridge_internal_error`，`AiSidebar` 新增“状态检查失败”分支，不再把所有失败都显示成“未连接服务”。
- `ai-store` 增加 `statusFailureKind`，并在发送前按“断连 / 内部失败 / CLI 缺失 / 验证失效”分别给出不同阻断原因。
- `dev-supervisor` 增加 API 健康检查：启动 10 秒后开始探测 `/api/codex/status`，每 5 秒检查一次，连续 2 次非 `200` 会只重启 API 子进程。
- 新增和更新了后端、客户端、store、sidebar、supervisor 的单元测试，覆盖新的降级与自愈路径。

## 问题原因
- `server/codex-bridge.ts` 里原先使用 `Promise.all([runner.getStatus(), promptStore.loadPrompt()])`，任何一边抛异常都会把状态接口直接炸成原始 `500`。
- `server/app.ts` 的状态接口没有统一错误归一化，live bridge 进程里的未处理异常会被前端看到成通用失败。
- `src/features/ai/ai-client.ts` 会把几乎所有状态请求失败都折叠成 `request_failed` 字符串错误，`src/features/ai/components/AiSidebar.tsx` 又把 `status === null` 等同于“未连接服务”，导致误诊。
- `server/dev-supervisor.ts` 以前只会在 API 进程退出时重启，无法发现“进程还活着，但 `/api/codex/status` 已持续返回 500”的坏状态。

## 尝试的解决办法
1. 检查 `server/app.ts`、`server/codex-bridge.ts`、`src/features/ai/ai-client.ts`、`src/features/ai/ai-store.ts`、`server/dev-supervisor.ts` 当前实现。
2. 在 `server/codex-bridge.ts` 中改用 `Promise.allSettled()` 构建状态，并为 runner/prompt 失败提供降级 `CodexStatus` 和 `request_failed` issue。
3. 在 `server/app.ts` 中为非流式 `/api/codex/*` 路由增加统一 JSON 错误包装和日志输出。
4. 在 `src/features/ai/ai-client.ts` 中新增 `CodexRequestError.kind/status`，将 transport 失败和 bridge 内部失败分开。
5. 在 `src/features/ai/ai-store.ts` 与 `src/features/ai/components/AiSidebar.tsx` 中增加 `statusFailureKind` 与新的“状态检查失败” UI 分支，并修正发送前的错误判定。
6. 在 `server/dev-supervisor.ts` 中加入 `/api/codex/status` 健康探测与自动重启逻辑。
7. 重写并补充 `server/app.test.ts`、`server/codex-bridge.test.ts`、`server/dev-supervisor.test.ts`、`src/features/ai/ai-client.test.ts`、`src/features/ai/components/AiSidebar.test.tsx`，并复跑 `src/features/ai/ai-store.test.ts`。
8. 验证结果：
   - `pnpm test server/app.test.ts server/codex-bridge.test.ts server/dev-supervisor.test.ts src/features/ai/ai-client.test.ts src/features/ai/ai-store.test.ts src/features/ai/components/AiSidebar.test.tsx` 通过。
   - `pnpm build:server` 通过。
   - `pnpm build` 仍被现有未完成修改的 `src/features/editor/components/PropertiesPanel.tsx` JSX 语法错误阻断，该问题与本轮改动无关。

## 是否成功解决
- 状态：部分成功
- 说明：本轮目标中的后端状态容错、前端错误态拆分、dev supervisor API 自愈都已实现并通过定向测试与 `build:server`。完整 `pnpm build` 仍因工作区里现存的 `PropertiesPanel.tsx` 语法错误失败，未在本轮处理。

## 相关文件
- server/app.ts
- server/app.test.ts
- server/codex-bridge.ts
- server/codex-bridge.test.ts
- server/dev-supervisor.ts
- server/dev-supervisor.test.ts
- src/features/ai/ai-client.ts
- src/features/ai/ai-client.test.ts
- src/features/ai/ai-store.ts
- src/features/ai/components/AiSidebar.tsx
- src/features/ai/components/AiSidebar.test.tsx
- src/pages/editor/MapEditorPage.tsx
- src/features/editor/components/PropertiesPanel.tsx

## 遗留问题/下一步
- 如需完整 `pnpm build` 通过，需要先修复当前工作区中 `src/features/editor/components/PropertiesPanel.tsx` 的 JSX 语法错误。
- 完成这轮后，可手动用 `pnpm dev` 启动并观察 `/api/codex/status` 在 live bridge 坏状态下是否会被 supervisor 自动拉起恢复。
