# 任务记录

## 任务名称
- 按 XMind 模型升级单个 Node 的 Note 富文本编辑

## 执行时间
- 开始时间：2026-04-03 20:43:22
- 结束时间：2026-04-03 20:54:06

## 仓库根目录
- C:/Users/edwar/Desktop/BrainFlow

## 任务目标
- 保持 Title 和 Label 轻量化不变，只将单个 Topic 的 Note 升级为结构化富文本编辑，并兼容现有纯文本 note、AI、导出与文档加载逻辑。

## 解决的问题
- 为 `TopicNode` 增加了 `noteRich` 结构化富文本数据，并保留 `note` 作为纯文本快照。
- 在 Inspector 中用轻量富文本 Note 编辑器替换了原来的 `TextArea`，支持编辑/预览切换、粗体、斜体、下划线、项目列表、链接和纯文本粘贴。
- 保持了画布节点、层级树、AI 上下文和导出逻辑继续基于 `note` 纯文本快照工作，避免现有链路断裂。
- 增加了富文本转换与同步测试，覆盖纯文本转结构化、HTML 解析、`note`/`noteRich` 双向同步。

## 问题原因
- 当前单个 Topic 的 Note 仅是纯文本字符串，Inspector 只能用 `textarea` 编辑，无法承载 XMind 式的富文本备注。
- 现有 AI、节点图标判断、导出和文档兼容链路都依赖 `note: string`，如果直接替换为富文本会造成大面积回归。

## 尝试的解决办法
1. 扩展 `TopicNode` 的 note 数据结构，增加 `noteRich` 并保留 `note` 纯文本快照，加载时优先从 `noteRich` 反算快照。
2. 新增 `topic-rich-text.ts` 处理纯文本转结构化、HTML 序列化/反序列化、纯文本提取与空值归一化。
3. 在 `tree-operations` 和 `editor-store` 中拆出富文本更新路径：Inspector 写 `noteRich + note`，AI 纯文本更新仍走 `updateTopicNote` 并自动补 paragraph 结构。
4. 在 Inspector 中接入仓库内轻量 `contenteditable` 富文本组件，加入工具栏、预览态和快捷键处理。
5. 跑通 `pnpm exec tsc -b --pretty false` 与 `pnpm test`，修正测试样本和 `MapEditorPage` 中的 `document` 命名冲突。

## 是否成功解决
- 状态：成功
- 说明：实现已完成，编译和全量测试通过。

## 相关文件
- src/features/documents/types.ts
- src/features/documents/topic-rich-text.ts
- src/features/documents/topic-rich-text.test.ts
- src/features/documents/topic-defaults.ts
- src/features/documents/document-factory.ts
- src/features/documents/document-service.ts
- src/features/editor/tree-operations.ts
- src/features/editor/editor-store.ts
- src/features/editor/components/PropertiesPanel.tsx
- src/features/editor/components/TopicRichTextEditor.tsx
- src/features/editor/components/TopicRichTextEditor.module.css
- src/pages/editor/MapEditorPage.tsx

## 遗留问题/下一步
- 当前富文本只覆盖 `paragraph` 和 `bullet_list`，不支持图片、颜色、高亮、有序列表、表格和代码块。
- AI 仍只读写纯文本 `note`，如果 AI 改写 Note，会按纯文本重建 `noteRich`，不会保留人工格式。
- 后续如果要继续贴近 XMind，可以在 Note 编辑器上补有序列表、快捷链接编辑反馈和更细的 selection 状态高亮。
