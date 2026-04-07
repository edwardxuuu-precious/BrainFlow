# 任务记录

## 任务名称
- 导入状态心跳与流中断诊断修复

## 执行时间
- 开始时间：2026-04-06 09:10:00
- 结束时间：2026-04-06 09:20:52

## 仓库根目录
- C:\Users\edwar\Desktop\BrainFlow

## 任务目标
- 实现导入链路 heartbeat 状态上报与流中断错误归一化，避免长时间停在 Primary run 且最终退化成模糊的 network error。

## 解决的问题
- 已为导入 runner observation 增加 `heartbeat` 与 `elapsedSinceLastEventMs`，长时间停在 `Primary run` 时会持续刷新“等待首个事件”或“仍在运行/距上次事件多久”。
- 已在 Codex runner 与 bridge 间补齐 heartbeat 透传和日志字段，主导入与 repair 链路都能携带额外耗时信息。
- 已在 import client 中补齐流式 NDJSON 中断、尾部残缺、坏 JSON 行的结构化错误映射，避免 UI 再直接显示裸 `network error`。
- 已将弹窗已完成短阶段时长显示改为 `<1s`，避免多个子阶段统一显示 `0s` 造成“没动”的错觉。
- 已补充并通过 runner、bridge、app、client、store、dialog、job 与构建验证。

## 问题原因
- 现有导入链路只在 `spawn_started`、`first_json_event`、`completed` 三个时刻上报 runner 观测，等待期没有心跳事件，导致 UI 只能停在粗粒度 `Primary run`。
- NDJSON 流在响应建立后如果发生 `reader.read()` 中断或残缺尾包，现有前端没有把这类流式 transport/parsing 错误转成结构化导入错误，最终会退化成原始异常文案。

## 尝试的解决办法
1. 扩展 `shared/ai-contract.ts`、`server/codex-runner.ts`、`server/codex-bridge.ts` 的导入 runner observation 协议，新增 `heartbeat` 与 `elapsedSinceLastEventMs`。
2. 在 `src/features/import/text-import-client.ts` 中跟踪最近一次 `requestId` 与 `stage`，将流中断与坏 NDJSON 归一化为结构化 `CodexRequestError`。
3. 在 `src/features/import/text-import-store.ts`、`src/features/import/components/TextImportDialog.tsx` 中透传并展示 heartbeat 文案及 `<1s` 时长策略。
4. 运行 `pnpm vitest run server/codex-runner.test.ts server/codex-bridge.test.ts server/app.test.ts src/features/import/text-import-client.test.ts src/features/import/text-import-store.test.ts src/features/import/components/TextImportDialog.test.tsx`。
5. 运行 `pnpm vitest run src/features/import/text-import-job.test.ts`。
6. 运行 `pnpm build`。

## 是否成功解决
- 状态：成功
- 说明：heartbeat 状态、流中断错误归因、短阶段时长显示和对应测试均已落地；定向测试与整库构建通过。

## 相关文件
- C:\Users\edwar\Desktop\BrainFlow\shared\ai-contract.ts
- C:\Users\edwar\Desktop\BrainFlow\server\codex-runner.ts
- C:\Users\edwar\Desktop\BrainFlow\server\codex-bridge.ts
- C:\Users\edwar\Desktop\BrainFlow\server\app.test.ts
- C:\Users\edwar\Desktop\BrainFlow\server\codex-runner.test.ts
- C:\Users\edwar\Desktop\BrainFlow\server\codex-bridge.test.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\text-import-client.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\text-import-client.test.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\text-import-store.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\text-import-store.test.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\components\TextImportDialog.tsx
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\components\TextImportDialog.test.tsx

## 遗留问题/下一步
- 当前仓库本身已有其他未提交改动，本次未回退或整理无关文件。
- 生产构建仍有 `MapEditorPage` chunk 超过 500 kB 的既有告警，本次未处理。
