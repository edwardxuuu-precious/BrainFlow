# 任务记录

## 任务名称
- 画布节点内联展示详细内容摘要并统一视觉样式

## 执行时间
- 开始时间：2026-04-10 12:41:13 +08:00
- 结束时间：2026-04-10 12:47:40 +08:00

## 仓库根目录
- C:/Users/edwar/Desktop/BrainFlow

## 任务目标
- 重设计画布节点展示方式，让包含详细内容的节点直接在节点内显示一部分详细内容，而不是单独用标记提示。
- 新节点样式需要与当前 BrainFlow 画布整体 UI 保持高一致性。

## 解决的问题
- 取消了画布节点里单独的“已添加详细内容”图标提示，改为在节点内部直接展示详细内容摘要。
- 为带详细内容的节点增加了标题下方的内联摘录区，并让选中态、激活态、锁定态下的摘要视觉和节点整体状态保持一致。
- 同步修改了画布布局测量逻辑，确保摘要出现后节点高度、连线和兄弟节点间距仍然正确。
- 增加了摘要生成 helper 和对应测试，验证节点渲染与布局高度都按新设计生效。

## 问题原因
- 旧方案只用一个 note 图标表示“节点里有详细内容”，信息密度过低，用户必须切到右侧属性面板才能看到内容本身。
- 节点高度是由 `layout.ts` 预先测量的，如果只在组件层加摘要而不更新布局测量，会导致节点内容溢出或连接线位置失真。
- 节点样式已经形成了比较克制的浅色产品化视觉语言，新摘要设计必须复用现有分支色、边框和状态层级，不能做成割裂的小卡片。

## 尝试的解决办法
1. 创建任务记录并定位节点组件、画布渲染逻辑和相关样式。
2. 在 `src/features/documents/topic-rich-text.ts` 新增 `getTopicNotePreview`，把 rich text / plain text 统一归一成适合节点展示的单段摘要文本。
3. 在 `src/features/editor/layout.ts` 给 render data 增加 `notePreview`，并把摘要块的宽度和高度纳入节点测量，取消 note 对状态栏的占位影响。
4. 在 `src/components/topic-node/TopicNode.tsx` 和 `TopicNode.module.css` 中移除 note 图标，改成标题下方的内联摘要块，并重做状态图标与摘要块的样式层级。
5. 运行 `npx vitest run src/components/topic-node/TopicNode.test.tsx src/features/editor/layout.test.ts` 和 `npm run build:web`，确认测试与构建通过。

## 是否成功解决
- 状态：成功
- 说明：节点现在会在画布内直接展示详细内容摘录，不再依赖单独标记提示；相关单测和前端构建均已通过。

## 相关文件
- Work_Progress/2026-04-10/124113_canvas-node-inline-detail-preview.md
- src/features/documents/topic-rich-text.ts
- src/features/editor/layout.ts
- src/features/editor/layout.test.ts
- src/components/topic-node/TopicNode.tsx
- src/components/topic-node/TopicNode.module.css
- src/components/topic-node/TopicNode.test.tsx

## 遗留问题/下一步
- 本轮完成的是实现、单测和构建级验证；如果需要进一步微调视觉观感，下一步可以在真实业务数据的长摘要节点上做一轮人工走查，继续微调摘要行数、宽度和选中态层次。
