# 任务记录

## 任务名称
- 重做画布节点视觉层级，取消详细内容卡片化

## 执行时间
- 开始时间：2026-04-10 13:46:52 +08:00
- 结束时间：2026-04-10 13:55:28 +08:00

## 仓库根目录
- C:/Users/edwar/Desktop/BrainFlow

## 任务目标
- 重做画布节点视觉层级，让详细内容改为节点标题下的内联正文。
- 弱化节点灰底、边框和卡片感，让节点整体更干净。
- 同步调整布局测量，保证节点高度、连线和兄弟间距仍然稳定。

## 解决的问题
- 把节点内的详细内容从独立小卡片改成了标题下方的内联正文，不再有额外边框、圆角、灰底和内阴影。
- 把锁定/类型状态图标并入标题行右侧，去掉单独状态条，让节点内部层级回到“标题 + 正文 + 轻量元信息”。
- 重新收紧了节点外壳：默认态回到白色系表面，选中/激活态改为边框和 halo 强调，不再整块染色。
- 调整了布局测量逻辑，状态图标不再占独立一行，详细内容预览的宽高补偿改为正文模型，保证节点高度和兄弟间距稳定。
- 补充了节点结构与布局相关测试，并通过了指定单测和前端构建。

## 问题原因
- 旧实现把详细内容渲染成节点中的次级卡片，导致节点内部出现双层容器，视觉上显得厚重、灰、碎。
- 状态图标原本占据单独一行，哪怕信息量很少也会把节点结构切成多层，进一步放大“卡片里再套卡片”的感觉。
- 布局测量使用的是旧的块级预览模型，如果只改视觉样式而不改测量，节点高度、换行和兄弟间距会与真实渲染不一致。

## 尝试的解决办法
1. 创建任务记录并定位节点组件、样式与布局测量代码。
2. 在 `src/components/topic-node/TopicNode.tsx` 重排节点结构，把状态图标移入 `titleRow`，并将 `notePreview` 改为带 `data-inline-detail` 标记的正文预览。
3. 在 `src/components/topic-node/TopicNode.module.css` 重写节点视觉样式，收紧边框、阴影和选中态，同时移除详细内容块的卡片化处理。
4. 在 `src/features/editor/layout.ts` 重写标题行/状态图标/正文预览的测量关系，去掉旧的独立状态行高度模型。
5. 在 `src/components/topic-node/TopicNode.test.tsx` 与 `src/features/editor/layout.test.ts` 增加结构与布局断言，覆盖内联正文、标题行状态图标、root/普通节点一致性、长预览 sibling spacing 和状态图标高度约束。
6. 运行 `npx vitest run src/components/topic-node/TopicNode.test.tsx src/features/editor/layout.test.ts`，21 个测试全部通过。
7. 运行 `npm run build:web`，前端构建通过。
8. 使用本地预览和 Playwright 打开编辑器，检查默认节点、带详细内容节点和锁定后的节点截图，确认已去掉节点内的独立灰色详细内容框。

## 是否成功解决
- 状态：成功
- 说明：节点视觉层级已经按方案重做完成，详细内容改为标题下的内联正文，相关测试、构建和浏览器实看均完成。

## 相关文件
- Work_Progress/2026-04-10/134645_canvas-node-visual-refresh.md
- src/components/topic-node/TopicNode.tsx
- src/components/topic-node/TopicNode.module.css
- src/features/editor/layout.ts
- src/components/topic-node/TopicNode.test.tsx
- src/features/editor/layout.test.ts
- editor-node-visual-check.png
- editor-node-visual-check-detail.png
- editor-node-visual-check-locked.png

## 遗留问题/下一步
- 当前已完成方案要求的实现与验证。
- 如果后续还想继续收紧节点观感，可以再单独微调普通节点的外描边强度和 root 节点的字重对比，但这已经属于第二轮视觉打磨，不影响本轮目标。
