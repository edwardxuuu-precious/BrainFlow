# 任务记录

## 任务名称
- 修复长标题在画布节点和右侧详情中的完整显示

## 执行时间
- 开始时间：2026-04-06 22:35:43
- 结束时间：2026-04-06 22:48:11

## 仓库根目录
- C:\Users\edwar\Desktop\BrainFlow

## 任务目标
- 修复画布节点标题被截断的问题，使长标题可以完整显示。
- 让右侧详情标题与画布节点共用同一套长度分级和字体尺寸规则。
- 补充布局、组件和页面级回归测试，确保长标题显示不会导致布局错位。

## 解决的问题
- 修复了画布节点标题被 `nowrap + ellipsis` 截断的问题，长标题现在会按长度分级自动换行并同步增高节点。
- 修复了右侧详情顶部标题与画布节点字号规则不一致的问题，右侧标题现在也会完整换行显示，并与画布共用同一套长度分级。
- 修复了布局测量仍按旧单行标题估算的问题，节点高度与兄弟节点间距已根据真实标题行数重新计算。
- 补充了共享 helper、布局、节点、右侧详情和页面级回归测试。

## 问题原因
- 画布节点标题在 `TopicNode.module.css` 中被强制单行显示并使用省略号截断，视觉上无法看到完整文本。
- `layout.ts` 的节点尺寸只按旧的单行标题长度估算宽高，没有把长标题换行后的真实高度计入布局。
- 右侧 `PropertiesPanel` 顶部标题没有复用画布标题的长度分级逻辑，导致两处同一标题的字号和密度不一致。

## 尝试的解决办法
1. 在 `src/features/editor/topic-title-display.ts` 新增共享标题 helper，统一处理中英混排权重、三档字号和换行高度估算。
2. 在 `src/features/editor/layout.ts` 中改为使用共享 helper 计算标题宽度、行数和节点高度，并把状态栏、元信息行的高度一起计入布局。
3. 在 `src/components/topic-node/TopicNode.tsx` 与 `TopicNode.module.css` 中取消标题省略号，改为多行显示，并通过共享 helper 输出的 CSS 变量控制字号、行高和字距。
4. 在 `src/features/editor/components/PropertiesPanel.tsx` 与 `PropertiesPanel.module.css` 中让右侧标题应用同一套长度分级，完整换行显示。
5. 为 helper、layout、TopicNode、PropertiesPanel 和 MapEditorPage 增加回归测试，验证长标题显示和布局测量都正确。

## 是否成功解决
- 状态：成功
- 说明：画布节点和右侧详情中的长标题都已能完整显示，节点高度会随内容自动调整，相关单元测试全部通过。

## 相关文件
- src/features/editor/topic-title-display.ts
- src/features/editor/topic-title-display.test.ts
- src/features/editor/layout.ts
- src/features/editor/layout.test.ts
- src/components/topic-node/TopicNode.tsx
- src/components/topic-node/TopicNode.module.css
- src/components/topic-node/TopicNode.test.tsx
- src/features/editor/components/PropertiesPanel.tsx
- src/features/editor/components/PropertiesPanel.module.css
- src/features/editor/components/PropertiesPanel.test.tsx
- src/pages/editor/MapEditorPage.test.tsx
- Work_Progress/2026-04-06/223543_topic-title-full-display.md

## 遗留问题/下一步
- 暂无本任务遗留问题。
- 如果后续还要处理目录树、标签区或其他面板里的文本截断，可以继续复用本次新增的标题测量 helper。
