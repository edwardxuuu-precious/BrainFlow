# 任务记录

## 任务名称
- 解释当前智能导入工作机制与节点扩张对话方式

## 执行时间
- 开始时间：2026-04-07 08:34:46
- 结束时间：2026-04-07 08:37:46

## 仓库根目录
- C:\Users\edwar\Desktop\BrainFlow

## 任务目标
- 结合当前代码实现，详细解释“智能导入”是如何工作的。
- 说明围绕一个具体节点，用户如何通过和 Codex 对话继续扩张后续节点。

## 解决的问题
- 已梳理智能导入的前端入口、预处理、路由选择、本地/桥接导入、语义裁决、预览编辑与应用链路。
- 已梳理 AI 对话围绕单节点扩张的上下文构建、两阶段提示词、提案生成与落图执行机制。
- 已确认两个当前实现层面的关键事实：
  1. AI 对话发送时始终会把整张脑图传给 Codex，焦点节点只是提示，不是硬限制。
  2. AI 侧边栏中的“整张脑图/追加上下文节点”UI 目前未真正接入发送链路，发送时仍只使用当前 activeTopicId 与 selectedTopicIds。
- 已确认智能导入虽然请求里包含 anchorTopicId，但当前应用阶段会基于 previewNodes 重新编译 create_child 操作并默认挂到根节点下，因此导入选区更多用于“理解上下文”，不是稳定控制插入位置。

## 问题原因
- 用户需要基于当前仓库实现理解实际工作流，而不是抽象描述。

## 尝试的解决办法
1. 确认仓库根目录并检查任务记录目录。
2. 创建当日任务文件，准备在分析过程中持续回写。
3. 阅读 `MapEditorPage`、`TextImportDialog`、`text-import-store`，定位前端入口和状态流。
4. 阅读 `text-import-job`、`local-text-import-core`、`text-import-preprocess`、`text-import-semantic-adjudication`，梳理本地导入、混合导入和语义裁决逻辑。
5. 阅读 `text-import-apply`，确认预览应用阶段如何将 previewNodes 转成真实落图操作。
6. 阅读 `ai-store`、`ai-context`、`ai-client`、`ai-proposal`、`server/app.ts`、`server/codex-bridge.ts`、`server/system-prompt.ts`，梳理对话扩张节点的完整路径。
7. 额外比对 `AiContextTray`/`AiSidebar` 与 `MapEditorPage` 的发送逻辑，确认上下文 UI 与实际请求字段之间的偏差。

## 是否成功解决
- 状态：成功
- 说明：已完成代码级解释准备，可向用户说明当前实现、使用方式与已知限制。

## 相关文件
- Work_Progress/2026-04-07/083446_intelligent-import-node-expansion.md
- src/pages/editor/MapEditorPage.tsx
- src/features/import/components/TextImportDialog.tsx
- src/features/import/text-import-store.ts
- src/features/import/text-import-job.ts
- src/features/import/local-text-import-core.ts
- src/features/import/text-import-preprocess.ts
- src/features/import/text-import-semantic-adjudication.ts
- src/features/import/text-import-apply.ts
- shared/text-import-semantics.ts
- src/features/ai/ai-store.ts
- src/features/ai/ai-context.ts
- src/features/ai/ai-client.ts
- src/features/ai/ai-proposal.ts
- src/features/ai/components/AiContextTray.tsx
- src/features/ai/components/AiSidebar.tsx
- server/app.ts
- server/codex-bridge.ts
- server/system-prompt.ts
- server/prompts/brainflow-system.md
- shared/ai-contract.ts

## 遗留问题/下一步
- 如果后续要让“围绕指定节点扩张”更可控，建议把 `aiContextTopicIds` / `useFullDocument` 真正接入 `handleSendAiMessage -> buildAiContext`。
- 如果后续要让智能导入插入到当前选中节点下，建议让 `preview/apply` 阶段尊重 `anchorTopicId`，而不是统一回编译到根节点。
