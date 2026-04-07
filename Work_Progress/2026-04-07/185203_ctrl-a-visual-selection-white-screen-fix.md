# 任务记录

## 任务名称
- 修复 Ctrl+A 后的假选中视觉与空白点击白屏

## 执行时间
- 开始时间：2026-04-07 18:52:03
- 结束时间：2026-04-07 19:25:43

## 仓库根目录
- C:/Users/edwar/Desktop/BrainFlow

## 任务目标
- 修复画布中节点默认看起来像被选中的视觉误导问题。
- 修复 Ctrl+A 后点击空白画布触发的白屏和 Maximum update depth exceeded。

## 解决的问题
- 修复了 Ctrl+A 后点击空白画布可能触发的 React Flow 选择同步环路。
- 修复了 `clearSelection()` 实际不会清空选中集合的问题，避免空白点击后状态回退到旧 active 节点。
- 调整了节点视觉层级，降低 `active`、`focus`、`task`、`milestone` 在未选中时的高亮强度，避免默认看起来像被选中。
- 补充了 focused 测试，覆盖空白点击清空选择、过滤 React Flow `select` node changes、重复 set/clear selection 的 no-op 行为。

## 问题原因
- `MapEditorPage` 同时通过 `onSelectionChange` 和 `onPaneClick` 清空选择，且仍把 React Flow 的 `select` 类型 node change 继续回写，容易和受控 `selected` 字段形成更新环路。
- `editor-store` 中 `commitWorkspaceDocument()` / `commitContentDocument()` 使用 `??` 读取 `activeTopicId`，导致显式传入 `null` 时会错误回退到旧 active 节点，`clearSelection()` 因而失效。
- `TopicNode.module.css` 中 `.active`、`[data-emphasis='focus']`、`.task`、`.milestone` 的阴影层级过重，视觉上与真实 `.selected` 太接近。

## 尝试的解决办法
1. 在 `MapEditorPage` 中移除 `onPaneClick` 的清空入口，只保留 `onSelectionChange` 空集合分支处理非加选模式的清空行为。
2. 在 `MapEditorPage` 中过滤 `remove` 和 `select` 两类 React Flow node changes，阻断内部选择状态反向写回。
3. 在 `editor-store` 中新增 `hasOwnOption()`，显式区分“未传字段”和“传入 null”，修复 `clearSelection()` / 其他 null 状态提交。
4. 在 `editor-store` 中为重复 `setSelection()` / `clearSelection()` 增加同态 no-op 防护。
5. 在 `TopicNode.module.css` 中让 `.active`、`focus`、`task`、`milestone` 仅在未选中时显示轻量强调，并保留 `.selected` 作为唯一强选中视觉。
6. 在 `MapEditorPage.test.tsx` 和 `editor-store.test.ts` 中补充 focused 测试并完成回归验证。

## 是否成功解决
- 状态：成功
- 说明：本次修改对应的 focused 测试已全部通过，Ctrl+A 后的清空选择路径、React Flow `select` 过滤和视觉误导问题均已修复。

## 相关文件
- Work_Progress/2026-04-07/185203_ctrl-a-visual-selection-white-screen-fix.md
- src/pages/editor/MapEditorPage.tsx
- src/features/editor/editor-store.ts
- src/components/topic-node/TopicNode.module.css
- src/pages/editor/MapEditorPage.test.tsx
- src/features/editor/editor-store.test.ts

## 遗留问题/下一步
- 如果后续还出现极端文档上的选择异常，优先在真实浏览器里复查 React Flow 的 `onSelectionChange` 触发顺序。
- 当前仓库存在大量与本任务无关的已修改文件，后续提交时需要按本次相关文件单独核对范围。
