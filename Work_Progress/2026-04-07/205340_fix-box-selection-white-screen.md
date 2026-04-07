# 任务记录

## 任务名称
- 修复框选节点导致白屏与闪烁

## 执行时间
- 开始时间：2026-04-07 20:53:40
- 结束时间：2026-04-07 21:10:24

## 仓库根目录
- `c:\Users\edwar\Desktop\BrainFlow`

## 任务目标
- 修复 React Flow 框选节点时的闪烁、白屏和 `Maximum update depth exceeded` 报错。

## 解决的问题
- 将框选从“拖拽过程中实时写 editor store”改为“拖拽期间仅维护 React Flow 临时选区，结束后一次性提交”。
- 恢复 `ReactFlow` 的 `onNodesChange` 管道，让框选高亮由本地 `nodes` state 即时更新，避免业务 store 与 React Flow 内部 selection listener 互相回写。
- 为框选引入会话状态，记录基础选区、active 节点、是否 additive、pending 选区和结束提交结果。
- 补充单测验证：框选开始与变化阶段不调用 `setSelection`，仅在 `onSelectionEnd` 后提交一次业务选区。
- 补充 e2e 断言代码：增加空框选和 `Maximum update depth exceeded` console 监测逻辑。

## 问题原因
- 未提交的框选重构把选中态做成了双向受控：
  - React Flow 内部 `SelectionListenerInner` 在框选拖拽时持续发 `onSelectionChange`。
  - 页面层又在同一手势里立刻调用 `setSelection` 写 editor store。
  - editor store 再通过 `nodes[].selected` 回灌给 React Flow，导致框选过程中的临时选区被不断覆盖。
- 同时 `TopicNode` 已改成只信任 React Flow `selected` prop，画布视觉完全依赖 `nodes.selected`；一旦外部 store 与内部框选状态打架，就会出现节点闪烁。
- 在高频框选拖拽下，这条回路会不断触发 React Flow / zustand / React 的订阅刷新，最终抛出 `Maximum update depth exceeded` 并出现白屏。

## 尝试的解决办法
1. 在 `src/pages/editor/MapEditorPage.tsx` 中恢复 `onNodesChange`，继续过滤 `remove`，让 React Flow 本地节点状态可以即时接收 selection 变化。
2. 新增框选会话 `boxSelectionSessionRef`，在 `onSelectionStart` 冻结本次手势的基础选区和 additive 语义。
3. 将 `onSelectionChange` 分流：
   - 框选进行中：只更新 `pendingSelectedTopicIds` / `pendingActiveTopicId`。
   - 非框选场景：保留原有点击类同步逻辑。
4. 在 `onSelectionEnd` 统一提交业务选区；空框选时显式清空 store 选区。
5. 调整 store -> canvas 对齐逻辑，框选会话进行中保留当前 `nodes.selected`，不再用 `selectedTopicIds` 覆盖 React Flow 的临时选区。
6. 更新 `MapEditorPage.test.tsx` mock，使其支持 `onSelectionStart` / `onSelectionEnd` 时序并新增延迟提交断言。
7. 更新 `src/test/e2e/brainflow.spec.ts`，补充空框选和 console/pageerror 断言。
8. 执行 `pnpm vitest run src/pages/editor/MapEditorPage.test.tsx src/components/topic-node/TopicNode.test.tsx src/features/editor/editor-store.test.ts`。
9. 执行 `pnpm build:web`，确认类型检查与生产构建通过。
10. 执行 `pnpm playwright test -g "box selection"` 与单用例重跑；两次都在首页“新建脑图”按钮定位阶段超时，未进入框选断言。

## 是否成功解决
- 状态：部分成功
- 说明：
  - 代码实现、Vitest 和 `build:web` 已通过。
  - Playwright 回归未完成验证，阻塞点是现有 e2e 在首页“新建脑图”按钮点击前超时，属于当前测试环境/用例定位问题，尚未证明与本次框选改动相关。

## 相关文件
- `src/pages/editor/MapEditorPage.tsx`
- `src/pages/editor/MapEditorPage.test.tsx`
- `src/test/e2e/brainflow.spec.ts`
- `Work_Progress/2026-04-07/205340_fix-box-selection-white-screen.md`

## 遗留问题/下一步
- 排查 Playwright 首页按钮定位超时问题，再补跑 `box selection` 相关 e2e。
- 在真实浏览器手动复测框选拖拽，确认不再闪烁、不再出现白屏和最大更新深度报错。
