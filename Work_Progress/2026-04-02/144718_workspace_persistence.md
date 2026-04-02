# 任务记录

## 任务名称
- 画布内容与工作台状态持久化改造

## 执行时间
- 开始时间：2026-04-02 14:47:18
- 结束时间：2026-04-02 15:09:52

## 仓库根目录
- c:\Users\edwar\Desktop\BrainFlow

## 任务目标
- 扩展 BrainFlow 的持久化模型，在保留现有文档内容持久化的基础上，增加按文档保存的工作台状态。
- 保证旧文档可兼容加载，并区分内容修改时间与工作台状态保存。

## 解决的问题
- 为 `MindMapDocument` 增加了 `workspace.selectedTopicId` 和 `workspace.chrome`，工作台状态现在可随文档一起存入 IndexedDB。
- `document-service` 现在会补齐旧文档缺失的 `workspace`，并在读取时把无效选中节点回退到根节点。
- `saveDocument` 改为保留调用方传入的 `updatedAt`，从而区分内容修改和工作台状态保存。
- `editor-store` 现在拆分出 `isDirty` 与 `hasPendingWorkspaceSave`，选中节点、viewport、侧栏开关会单独走工作台保存通路。
- 刷新后可恢复选中节点与视口；纯工作台操作不会推动文档 `updatedAt`，而拖拽节点等内容修改仍会更新 `updatedAt`。

## 问题原因
- 之前只有文档内容与 `viewport` 会落盘，选中节点和未来侧栏开关等工作台状态不会持久化。
- `saveDocument` 之前会无条件覆盖 `updatedAt`，导致工作台状态保存和内容修改时间混在一起。
- store 只有单一 `isDirty`，无法区分“文档内容未保存”和“工作台状态未保存”。

## 尝试的解决办法
1. 扩展 `MindMapDocument` 与文档工厂，加入 `workspace` 默认值。
2. 在 `document-service` 中新增 viewport/workspace 归一化逻辑，并调整 `saveDocument` 的时间戳语义。
3. 在 `tree-operations` 中拆出不触碰 `updatedAt` 的工作台更新函数。
4. 在 `editor-store` 中新增 `hasPendingWorkspaceSave`、侧栏开关动作，并让选中节点与 viewport 同步写回文档。
5. 调整首页文档重命名保存路径，确保该内容型修改仍会刷新 `updatedAt`。
6. 补充 document-service、editor-store 和 Playwright E2E 验证，覆盖刷新恢复与时间戳边界。

## 是否成功解决
- 状态：成功
- 说明：`pnpm lint`、`pnpm test`、`pnpm build`、`pnpm test:e2e` 全部通过。

## 相关文件
- c:\Users\edwar\Desktop\BrainFlow\src\features\documents\types.ts
- c:\Users\edwar\Desktop\BrainFlow\src\features\documents\document-factory.ts
- c:\Users\edwar\Desktop\BrainFlow\src\features\documents\document-service.ts
- c:\Users\edwar\Desktop\BrainFlow\src\features\documents\document-service.test.ts
- c:\Users\edwar\Desktop\BrainFlow\src\features\editor\tree-operations.ts
- c:\Users\edwar\Desktop\BrainFlow\src\features\editor\editor-store.ts
- c:\Users\edwar\Desktop\BrainFlow\src\features\editor\editor-store.test.ts
- c:\Users\edwar\Desktop\BrainFlow\src\pages\editor\MapEditorPage.tsx
- c:\Users\edwar\Desktop\BrainFlow\src\pages\home\HomePage.tsx
- c:\Users\edwar\Desktop\BrainFlow\src\test\e2e\brainflow.spec.ts
- c:\Users\edwar\Desktop\BrainFlow\Work_Progress\2026-04-02\144718_workspace_persistence.md

## 遗留问题/下一步
- `workspace.chrome` 已经持久化，但左右侧栏的可隐藏 UI 还没有正式接入，目前主要作为后续侧栏方案的持久化底座。
- 当前仍不持久化撤销/重做栈与输入中的临时编辑态；如果后续需要跨刷新恢复这类瞬时状态，需要单独设计运行时快照策略。
