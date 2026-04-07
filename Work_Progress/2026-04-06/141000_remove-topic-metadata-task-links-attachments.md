# 任务记录

## 任务名称
- 撤销主题元数据中的任务、链接、附件能力

## 执行时间
- 开始时间：2026-04-06 14:10:00
- 结束时间：2026-04-06 14:31:07

## 仓库根目录
- c:\Users\edwar\Desktop\BrainFlow

## 任务目标
- 移除主题元数据中的 `task`、`links`、`attachments` 三类能力，包括右侧详情入口、节点展示、层级目录、AI 契约和归一化处理。

## 解决的问题
- 从主题元数据中移除了 `task`、`links`、`attachments` 三类能力，右侧详情面板不再显示相关入口。
- 移除了节点卡片与目录侧栏里基于任务、链接、附件的状态提示和图标，避免用户继续感知这些能力。
- 收缩了文档类型、topic metadata 归一化逻辑、共享 AI 契约和 Codex bridge schema，保证 AI 与导入链路不再读写这些字段。
- 增加了旧文档兼容测试，确认历史 `task` / `links` / `attachments` 在加载后会被忽略，并在下一次保存时从持久化 JSON 中清掉。

## 问题原因
- 最近为修复回归在 `PropertiesPanel` 中重新补回了任务、链接、附件编辑区块，但这与当前产品方向不一致，用户没有可理解的使用路径。
- 这三类字段不仅出现在详情面板，还渗透到节点展示、层级目录、AI 契约和导入 prompt context；仅隐藏入口会留下半截能力与历史数据包袱。

## 尝试的解决办法
1. 创建本轮任务记录并登记目标。
2. 在 `src/features/documents/types.ts` 与 `src/features/documents/topic-defaults.ts` 删除任务、链接、附件相关类型、默认值和 patch/normalize 逻辑。
3. 在 `shared/ai-contract.ts` 与 `server/codex-bridge.ts` 收缩 metadata schema 和标准化逻辑，不再接收或传播这三类字段。
4. 重写 `PropertiesPanel.tsx`，只保留标签编辑、主题类型切换和 AI 锁定区块。
5. 清理 `TopicNode.tsx`、`HierarchySidebar.tsx` 及相关测试中的任务/链接/附件展示。
6. 在 `document-service.test.ts` 增加旧文档兼容用例，直接向 IndexedDB 写入带历史字段的原始文档，验证加载与再次保存后的清理行为。
7. 运行 `pnpm vitest run src/features/editor/components/PropertiesPanel.test.tsx src/features/documents/document-service.test.ts src/features/ai/ai-proposal.test.ts server/codex-bridge.test.ts src/features/import/text-import-apply.test.ts`。
8. 运行 `pnpm build:web` 做类型检查与前端打包验证。

## 是否成功解决
- 状态：成功
- 说明：主题元数据中的任务、链接、附件能力已从 UI、类型、AI 契约和持久化链路中移除；最小验证集 28/28 通过，`pnpm build:web` 通过。

## 相关文件
- c:\Users\edwar\Desktop\BrainFlow\Work_Progress\2026-04-06\141000_remove-topic-metadata-task-links-attachments.md
- c:\Users\edwar\Desktop\BrainFlow\src\features\documents\types.ts
- c:\Users\edwar\Desktop\BrainFlow\src\features\documents\topic-defaults.ts
- c:\Users\edwar\Desktop\BrainFlow\shared\ai-contract.ts
- c:\Users\edwar\Desktop\BrainFlow\server\codex-bridge.ts
- c:\Users\edwar\Desktop\BrainFlow\src\features\editor\components\PropertiesPanel.tsx
- c:\Users\edwar\Desktop\BrainFlow\src\components\topic-node\TopicNode.tsx
- c:\Users\edwar\Desktop\BrainFlow\src\features\editor\components\HierarchySidebar.tsx
- c:\Users\edwar\Desktop\BrainFlow\src\features\documents\document-service.test.ts
- c:\Users\edwar\Desktop\BrainFlow\src\features\editor\components\PropertiesPanel.test.tsx
- c:\Users\edwar\Desktop\BrainFlow\src\pages\editor\MapEditorPage.tsx

## 遗留问题/下一步
- 当前无功能性遗留问题。
- `vite build` 仍保留现有的大 chunk 警告，这不是本次改动引入的问题，可后续单独做代码拆分优化。
