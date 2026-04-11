# 任务记录

## 任务名称
- 智能导入切换为 CLI 风格运行过程流

## 执行时间
- 开始时间：2026-04-10 23:10:47
- 结束时间：2026-04-10 23:23:37

## 仓库根目录
- C:\Users\edwar\Desktop\BrainFlow

## 任务目标
- 将智能导入默认展示从 raw trace 改为基于真实事件派生的 CLI 风格运行过程流，并把原始事件流移到 internals/debug。

## 解决的问题
- 智能导入默认主面板不再直接显示 raw trace，而是显示基于真实 trace/progress 派生的 CLI 风格运行过程流。
- 导入运行中会把 assistant commentary、命令/搜索等工具步骤、等待心跳、修复重试分段整理成更接近 Codex 面板的过程块。
- 原始事件流保留在 internals/debug 区域，默认隐藏，展开后仍可查看 raw JSON。
- 本地导入路径新增基于 progressEntries 的本地过程展示，不再出现 Codex trace 术语。

## 问题原因
- 之前的智能导入主界面直接把 `traceEntries` 渲染成 `Communication trace / Live Codex stream`，导致主视图暴露了 `attempt/channel/eventType/raw JSON` 这类调试信息。
- 用户真正想要的是类似 Codex CLI/桌面里的 activity feed，而不是底层 trace/event stream。

## 尝试的解决办法
1. 分析当前 trace、status、progress 的展示链路。
2. 新增 `src/features/import/text-import-activity.ts`，把真实 `traceEntries` 与本地 `progressEntries` 派生为 CLI 风格 activity blocks。
3. 改造 `TextImportDialog`：主面板改为“运行过程流”，raw trace 移到 internals 下的“原始事件流”。
4. 在 `MapEditorPage` 给对话框补传 `progressEntries`，让 `local_markdown` 路径也能显示真实本地过程。
5. 新增/更新 helper、组件、页面相关测试，并运行 Vitest 与 TypeScript 检查。

## 是否成功解决
- 状态：成功
- 说明：默认主展示已切换为 CLI 风格运行过程流；raw trace 仍可在 internals 中查看，相关测试与类型检查已通过。

## 相关文件
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\text-import-activity.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\text-import-activity.test.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\components\TextImportDialog.tsx
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\components\TextImportDialog.module.css
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\components\TextImportDialog.test.tsx
- C:\Users\edwar\Desktop\BrainFlow\src\pages\editor\MapEditorPage.tsx

## 遗留问题/下一步
- 当前仓库里的 runner 测试样本主要覆盖 `agent_message` 和基本 runner 事件；如果后续接到更丰富的 `command_execution/search/browser` payload 变体，可以继续补强工具事件识别规则。
- 若需要进一步贴近 Codex 桌面样式，可继续微调 activity block 的视觉层次，但当前语义与默认展示层已经切换完成。
