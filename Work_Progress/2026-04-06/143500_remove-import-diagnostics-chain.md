# 任务记录

## 任务名称
- 删除导入弹窗中的调试诊断链路

## 执行时间
- 开始时间：2026-04-06 14:35:00
- 结束时间：2026-04-06 15:36:08

## 仓库根目录
- c:\Users\edwar\Desktop\BrainFlow

## 任务目标
- 删除 Markdown / text import 弹窗中的 `Runtime explainer`、`Codex live feed`、`Import diagnostics` 以及对应的前后端调试事件链路。
- 保留普通用户仍需要的导入状态、进度、结果和错误摘要，不影响导入主流程。

## 解决的问题
- 删除了前端导入弹窗中的调试诊断区、原始 JSON 和调试时间线展示。
- 删除了导入流协议中的 `runner_observation`、`codex_event`、`codex_explainer`、`codex_diagnostic` 四类事件及其共享类型。
- 删除了前端 store、job、client 和服务端 bridge / app 中面向前端的调试事件透传逻辑。
- 保留并验证了 `status`、`result`、`error` 三类事件的导入链路，普通状态展示和错误摘要继续可用。
- 修复了测试文件中的少量乱码断言，确保最小测试集和生产构建都能通过。

## 问题原因
- 当前导入弹窗仍然向最终用户展示了开发期排障用的实时诊断数据，包含运行时解释器、Codex 事件流和诊断列表，交互复杂且超出产品需要。
- 这些调试 UI 背后依赖完整的共享事件协议和前后端状态管理，单纯隐藏前端入口会留下冗余链路和维护成本。
- 处理中途还遇到少量测试文件字符串编码损坏，导致构建前需要一并修复。

## 尝试的解决办法
1. 收缩 `shared/ai-contract.ts` 中的导入流事件定义，只保留 `status`、`result`、`error`。
2. 修改 `server/app.ts` 与 `server/codex-bridge.ts`，停止向前端发送调试事件，但保留服务端内部日志。
3. 修改 `text-import-job.ts`、`text-import-store.ts`、`TextImportDialog.tsx` 与 `MapEditorPage.tsx`，移除调试状态、调试派生逻辑和所有相关 UI。
4. 更新 `TextImportDialog.test.tsx`、`text-import-store.test.ts`、`text-import-job.test.ts`、`server/app.test.ts`、`server/codex-bridge.test.ts`、`text-import-client.test.ts`，删除旧调试断言并保留主链路覆盖。
5. 修复测试文件中的损坏字符串后重新执行最小测试集与 `pnpm build:web`，确认类型与生产构建通过。

## 是否成功解决
- 状态：成功
- 说明：用户可见的导入调试诊断链路已彻底下线，导入主流程、普通状态展示和错误摘要保留且验证通过。

## 相关文件
- c:\Users\edwar\Desktop\BrainFlow\shared\ai-contract.ts
- c:\Users\edwar\Desktop\BrainFlow\server\app.ts
- c:\Users\edwar\Desktop\BrainFlow\server\codex-bridge.ts
- c:\Users\edwar\Desktop\BrainFlow\src\features\import\text-import-job.ts
- c:\Users\edwar\Desktop\BrainFlow\src\features\import\text-import-store.ts
- c:\Users\edwar\Desktop\BrainFlow\src\features\import\components\TextImportDialog.tsx
- c:\Users\edwar\Desktop\BrainFlow\src\pages\editor\MapEditorPage.tsx
- c:\Users\edwar\Desktop\BrainFlow\src\features\import\components\TextImportDialog.test.tsx
- c:\Users\edwar\Desktop\BrainFlow\src\features\import\text-import-store.test.ts
- c:\Users\edwar\Desktop\BrainFlow\src\features\import\text-import-job.test.ts
- c:\Users\edwar\Desktop\BrainFlow\server\app.test.ts
- c:\Users\edwar\Desktop\BrainFlow\server\codex-bridge.test.ts
- c:\Users\edwar\Desktop\BrainFlow\src\features\import\text-import-client.test.ts
- c:\Users\edwar\Desktop\BrainFlow\Work_Progress\2026-04-06\143500_remove-import-diagnostics-chain.md

## 遗留问题/下一步
- `pnpm build:web` 仍提示现有的 Vite chunk size warning，但不是本次改动引入的问题。
- 若后续仍需要开发期导入排障能力，建议只保留服务端日志和 `requestId`，不要重新暴露前端调试面板。
- 本次验证结果：`pnpm vitest run src/features/import/components/TextImportDialog.test.tsx src/features/import/text-import-store.test.ts src/features/import/text-import-job.test.ts server/app.test.ts server/codex-bridge.test.ts src/features/import/text-import-client.test.ts` 通过 45/45，`pnpm build:web` 通过。