# 任务记录

## 任务名称
- 编辑器独立滚动与左侧树折叠实现

## 执行时间
- 开始时间：2026-04-03 09:22:17
- 结束时间：2026-04-03 10:02:30

## 仓库根目录
- C:\Users\edwar\Desktop\BrainFlow

## 任务目标
- 让画布保持为视口内固定的无限画布区域，不再跟随左右侧边栏内容一起上下滚动。
- 让左右侧边栏各自独立滚动。
- 为左侧层级树增加仅作用于导航树的独立折叠能力，并按文档本地持久化。

## 解决的问题
- 编辑器外层改成固定 `100dvh` 视口布局，页面主滚动被锁定，左右侧栏和中间画布不再互相带动滚动。
- 左侧 `Hierarchy` 树增加了独立 chevron 折叠交互，点击箭头只收起左树分支，不会影响画布节点的 `isCollapsed`。
- 左树折叠状态新增到 `workspace.hierarchyCollapsedTopicIds`，按文档本地持久化，并且不影响 `updatedAt`、不进入内容撤销栈。
- 恢复文档时，如果当前选中节点位于折叠分支内，左树会临时展开其祖先链以保证可见，但不会抹掉原始折叠状态。
- 右侧 `PropertiesPanel` 补了独立滚动容器，AI 侧栏和左侧层级栏也补齐了视口内滚动约束。

## 问题原因
- 之前编辑器根容器只用了 `min-height`，没有把整体工作台锁在视口内，导致侧栏内容变长时会把整页一起撑高。
- 左侧树直接复用了画布节点的 `topic.isCollapsed`，所以树折叠和画布折叠耦合在一起，无法做到“只折树不折画布”。
- 右侧 Inspector 没有独立滚动内容区，页面高度锁死后容易出现内容被截断而不是侧栏自身滚动。
- 当前选中节点的祖先链“自动可见”与“折叠状态持久化”原本混在一起，会把用户手动折叠的状态意外覆盖掉。

## 尝试的解决办法
1. 在 `MindMapWorkspaceState` 中新增 `hierarchyCollapsedTopicIds`，并在 `document-factory`、`document-service` 中补齐默认值和旧文档归一化逻辑。
2. 在 `tree-operations` 中新增 workspace 级树折叠纯函数，在 `editor-store` 中接入 `toggleHierarchyBranch` 等动作，确保它们只走 workspace 保存通路。
3. 重写 `HierarchySidebar` 的树渲染结构，加入独立 chevron 按钮、树行缩进、折叠文案和不影响选择的交互。
4. 调整 `MapEditorPage` 和相关 CSS，让页面固定在 `100dvh`，中间画布与左右侧栏分离滚动；右侧 Inspector 增加内部滚动容器。
5. 将“选中节点祖先链自动可见”改成渲染层派生逻辑，避免为了显示选中路径而永久修改用户原本保存的折叠状态。
6. 补齐单测与 E2E，包括旧文档兼容、workspace-only 保存、左树折叠跨刷新恢复、以及恢复时选中路径自动可见。

## 是否成功解决
- 状态：成功
- 说明：功能实现完成，`pnpm test -- --run`、`pnpm lint`、`pnpm build`、`pnpm test:e2e` 全部通过。

## 相关文件
- C:\Users\edwar\Desktop\BrainFlow\src\features\documents\types.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\documents\document-factory.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\documents\document-service.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\documents\document-service.test.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\editor\tree-operations.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\editor\editor-store.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\editor\editor-store.test.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\editor\components\HierarchySidebar.tsx
- C:\Users\edwar\Desktop\BrainFlow\src\features\editor\components\HierarchySidebar.module.css
- C:\Users\edwar\Desktop\BrainFlow\src\features\editor\components\HierarchySidebar.test.tsx
- C:\Users\edwar\Desktop\BrainFlow\src\features\editor\components\PropertiesPanel.tsx
- C:\Users\edwar\Desktop\BrainFlow\src\features\editor\components\PropertiesPanel.module.css
- C:\Users\edwar\Desktop\BrainFlow\src\features\ai\components\AiSidebar.module.css
- C:\Users\edwar\Desktop\BrainFlow\src\components\ui\icons.tsx
- C:\Users\edwar\Desktop\BrainFlow\src\pages\editor\MapEditorPage.tsx
- C:\Users\edwar\Desktop\BrainFlow\src\pages\editor\MapEditorPage.module.css
- C:\Users\edwar\Desktop\BrainFlow\src\test\e2e\brainflow.spec.ts

## 遗留问题/下一步
- 当前左树折叠是逐分支控制，尚未增加“全部展开/全部折叠”入口。
- 右侧 AI 侧栏虽然已经视口内滚动，但底层 Codex CLI 仍不是逐 token 真流式输出；如需进一步优化，需要继续沿 bridge 层做真实增量流。
