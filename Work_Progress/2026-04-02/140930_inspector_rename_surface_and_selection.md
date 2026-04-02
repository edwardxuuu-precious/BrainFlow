# 任务记录

## 任务名称
- Inspector 标题重命名改为右侧输入框，并强化画布选中态

## 执行时间
- 开始时间：2026-04-02 14:09:30
- 结束时间：2026-04-02 14:40:55

## 仓库根目录
- c:\Users\edwar\Desktop\BrainFlow

## 任务目标
- 将右侧 Inspector 的“重命名”改为在标题区直接编辑，而不是触发画布节点内联输入。
- 强化画布中被选中节点的视觉反馈，并与画布内联编辑态区分开。
- 为本次交互变化补齐组件测试、store 测试与 E2E 验证。

## 解决的问题
- 右侧“重命名”按钮现在会把 Inspector 标题区切换为可编辑输入框，并自动聚焦与全选。
- 画布节点仅在 `editingSurface === 'canvas'` 时显示节点内联输入框，Inspector 编辑时不再干扰画布。
- 选中节点的描边、浅色底和外发光明显增强，当前选中对象更容易识别。
- 新交互已同步覆盖单测和 E2E，确保右侧改名、左侧层级树与画布标题文本保持一致。

## 问题原因
- 之前编辑状态只有 `editingTopicId`，无法区分“正在画布编辑”还是“正在 Inspector 编辑”。
- Inspector 的“重命名”复用了画布内联编辑逻辑，导致反馈位置与用户预期不一致。
- 节点选中态的边框和高亮强度偏弱，视觉层级不足。

## 尝试的解决办法
1. 在 `editor-store` 中增加 `editingSurface`，把编辑状态拆成“目标节点 + 编辑表面”。
2. 在 `MapEditorPage` 中引入按节点维度管理的重命名草稿，并将 Inspector 重命名改为独立提交流程。
3. 在 `PropertiesPanel` 中把标题区改成展示态 / 输入态切换，补上自动聚焦、Enter 保存、Escape 取消和 blur 保存。
4. 在 `TopicNode` 中只为画布编辑态渲染输入框，同时强化 `selected` 与 `editing` 样式层级。
5. 更新 `PropertiesPanel`、`TopicNode`、`editor-store` 和 Playwright E2E 测试，回归验证完整交互链路。

## 是否成功解决
- 状态：成功
- 说明：功能实现完成，`pnpm lint`、`pnpm test`、`pnpm build`、`pnpm test:e2e` 全部通过。

## 相关文件
- c:\Users\edwar\Desktop\BrainFlow\src\pages\editor\MapEditorPage.tsx
- c:\Users\edwar\Desktop\BrainFlow\src\features\editor\editor-store.ts
- c:\Users\edwar\Desktop\BrainFlow\src\features\editor\use-editor-shortcuts.ts
- c:\Users\edwar\Desktop\BrainFlow\src\features\editor\components\PropertiesPanel.tsx
- c:\Users\edwar\Desktop\BrainFlow\src\features\editor\components\PropertiesPanel.module.css
- c:\Users\edwar\Desktop\BrainFlow\src\features\editor\components\PropertiesPanel.test.tsx
- c:\Users\edwar\Desktop\BrainFlow\src\components\topic-node\TopicNode.tsx
- c:\Users\edwar\Desktop\BrainFlow\src\components\topic-node\TopicNode.module.css
- c:\Users\edwar\Desktop\BrainFlow\src\components\topic-node\TopicNode.test.tsx
- c:\Users\edwar\Desktop\BrainFlow\src\features\editor\editor-store.test.ts
- c:\Users\edwar\Desktop\BrainFlow\src\test\e2e\brainflow.spec.ts
- c:\Users\edwar\Desktop\BrainFlow\Work_Progress\2026-04-02\140930_inspector_rename_surface_and_selection.md

## 遗留问题/下一步
- 当前两侧侧栏仍未实现图一那种整块式可隐藏工作台布局，后续可以继续按侧栏折叠方案推进。
- 后续若要做“按文档持久化 Inspector/侧栏状态”，可在现有 `editingSurface` 分离基础上继续扩展工作台状态存储。
