# 任务记录

## 任务名称
- 修复画布 Ctrl + A 全选与批量删除一致性

## 执行时间
- 开始时间：2026-04-07 08:37
- 结束时间：2026-04-07 08:50

## 仓库根目录
- C:\Users\edwar\Desktop\BrainFlow

## 任务目标
- 修复画布区域 `Ctrl + A` 只能选中部分节点、视觉选中态与真实选中集合不一致、批量删除只删掉一个节点的问题。
- 确保锁定节点可以被选中查看，但不能被删除或被快捷键修改。

## 解决的问题
- 统一了 store 选中集合、React Flow `node.selected` 与节点组件视觉态，消除了“看起来已选中但实际删不掉”的状态分叉。
- `Ctrl + A` 现在只在非输入态触发，输入框和编辑态保留原生文本全选。
- 删除快捷键改为一次性批量删除，避免逐个删除造成 active/selection 中途重置。
- 锁定节点以及包含锁定后代的选中子树不会被删除；`Ctrl + A + Delete` 会保留根节点、锁定节点和必要祖先。
- 删除后会保留仍然存活的选中节点；如果没有存活选中节点，则回退到根节点。

## 问题原因
- `Ctrl + A` 只更新了 store 里的 `selectedTopicIds`，而画布视觉选中还依赖 React Flow 自身的 `selected` 状态，导致两套状态不同步。
- `TopicNode` 同时读取 React Flow `selected` 和 store 里的 `selectedTopicIds`，放大了“看起来已选中但实际不可操作”的错位。
- 删除快捷键逐个调用 `removeTopic`，每删一个节点都会重置 active/selection，导致批量删除中间状态污染后续删除。
- `Ctrl + A` 绑定在输入态判断之前，会劫持文本输入框原生全选。

## 尝试的解决办法
1. 统一画布与 store 的选择来源，梳理 `selectAll`、`onSelectionChange`、节点渲染同步逻辑。
2. 增加批量删除 action，一次性删除非根且未锁定节点，并保留仍存活的选择。
3. 在 tree 操作层增加锁定子树保护，防止删除父节点时连带删除锁定后代。
4. 补充 store、快捷键、节点组件、页面层测试，覆盖全选、批量删除、锁定节点不可删除、输入态 `Ctrl + A` 不劫持、旧高亮清理等场景。

## 是否成功解决
- 状态：成功
- 说明：focused tests 全部通过，相关选择与删除链路已修复。

## 相关文件
- Work_Progress/2026-04-07/083700_ctrl-a-select-all-delete-fix.md
- src/features/editor/editor-store.ts
- src/features/editor/tree-operations.ts
- src/features/editor/use-editor-shortcuts.ts
- src/pages/editor/MapEditorPage.tsx
- src/components/topic-node/TopicNode.tsx
- src/features/editor/editor-store.test.ts
- src/features/editor/use-editor-shortcuts.test.tsx
- src/components/topic-node/TopicNode.test.tsx
- src/pages/editor/MapEditorPage.test.tsx

## 遗留问题/下一步
- 本次只执行了 focused tests，未运行整仓 `pnpm test` / `pnpm build`。
- 若后续继续扩展锁定语义，可再审查手动拖拽、侧栏编辑、结构调整等非快捷键入口是否也需要对锁定节点做同等级保护。
