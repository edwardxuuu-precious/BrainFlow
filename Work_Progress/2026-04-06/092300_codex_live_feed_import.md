# 任务记录

## 任务名称
- 导入改为 Codex 实时事件流视图

## 执行时间
- 开始时间：2026-04-06 09:23:00
- 结束时间：2026-04-06 09:47:56

## 仓库根目录
- C:\Users\edwar\Desktop\BrainFlow

## 任务目标
- 将 Markdown/Codex 导入弹窗的主视图从“快阶段时间线”改成“Codex 实时事件流”。
- 透传结构化导入过程中 Codex CLI 的真实 JSONL 事件，并在前端展示最近事件、空闲时长、事件列表和原始 JSON。
- 将 `Extract input / Build context / Load prompt / Start Codex` 等瞬时阶段收纳到折叠诊断区，而不是主视图。

## 解决的问题
- 新增 `codex_event` 导入流事件协议，并贯通到 bridge、HTTP NDJSON、client、job、store、dialog。
- `CodexRunner.execute()` 现在支持像聊天流那样透传结构化导入时的 stdout JSON 事件。
- 导入弹窗主区域现在展示 `Codex live feed`，包括：
- 最新真实 CLI 事件摘要
- `No new Codex events for X` / `Waiting for first CLI event for X`
- 最近 50 条事件列表
- 每条事件可展开查看原始 JSON
- 旧的快阶段与 runner 观察信息被挪到折叠的 `Import diagnostics` 区域。
- 顺手修复了两个阻塞构建的 TypeScript 问题：
- `PropertiesPanel.tsx` 中未使用的 `topicOptions`
- `MapEditorPage.tsx` 中点击外部菜单关闭逻辑误用了业务 `document` 变量而不是 `window.document`

## 问题原因
- 之前结构化导入链路只向前端暴露状态阶段和 runner heartbeat，没有把 Codex CLI 的真实 stdout JSON 事件向上透传。
- 前端把“快阶段时间线”当作主视图，导致真正耗时的 Codex 运行阶段只能看到 heartbeat，而看不到实际事件内容。
- 仓库当前工作树里还存在两个与本次需求无关但会阻塞 `pnpm build` 的 TypeScript 问题。

## 尝试的解决办法
1. 在 `shared/ai-contract.ts` 增加 `TextImportCodexEvent` 和 `TextImportStreamEvent.type = 'codex_event'`。
2. 在 `server/codex-runner.ts` 为结构化 `execute()` 增加 `onEvent` 透传。
3. 在 `server/codex-bridge.ts` 将 CLI 原始 JSON 事件映射为稳定中文摘要，过滤 `thread.started`，并透传 `rawJson`。
4. 在 `server/app.ts` 的导入 NDJSON 路由中发出 `codex_event`。
5. 在 `src/features/import/text-import-job.ts`、`text-import-store.ts` 中新增 `codexEventFeed` 与 `latestCodexEvent`，并限制最近 50 条。
6. 在 `TextImportDialog.tsx`/`.module.css` 中重做主视图为实时事件流，增加原始 JSON 展开和折叠诊断区。
7. 为 runner、bridge、app、client、job、store、dialog 补充测试，并运行构建验证。

## 是否成功解决
- 状态：成功
- 说明：
- 目标中的“真实事件流主视图”“折叠诊断区”“原始 JSON 展开”“heartbeat 只做空闲计时”都已实现。
- 相关单测全部通过，`pnpm build` 也已通过。

## 相关文件
- C:\Users\edwar\Desktop\BrainFlow\shared\ai-contract.ts
- C:\Users\edwar\Desktop\BrainFlow\server\codex-runner.ts
- C:\Users\edwar\Desktop\BrainFlow\server\codex-bridge.ts
- C:\Users\edwar\Desktop\BrainFlow\server\app.ts
- C:\Users\edwar\Desktop\BrainFlow\server\codex-runner.test.ts
- C:\Users\edwar\Desktop\BrainFlow\server\codex-bridge.test.ts
- C:\Users\edwar\Desktop\BrainFlow\server\app.test.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\text-import-client.test.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\text-import-job.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\text-import-job.test.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\text-import-store.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\text-import-store.test.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\components\TextImportDialog.tsx
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\components\TextImportDialog.module.css
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\components\TextImportDialog.test.tsx
- C:\Users\edwar\Desktop\BrainFlow\src\pages\editor\MapEditorPage.tsx
- C:\Users\edwar\Desktop\BrainFlow\src\features\editor\components\PropertiesPanel.tsx

## 遗留问题/下一步
- 当前结构化导入模式下，Codex CLI 自身输出的事件仍然偏稀疏；如果后续仍觉得信息不够，可以再规划“额外解说通道”或“双通道事件流”。
- `vite build` 仍提示 `MapEditorPage` chunk 超过 500 kB，这是警告不是失败，本轮未处理。
