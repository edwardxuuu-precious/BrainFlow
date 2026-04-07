# 任务记录

## 任务名称
- 智能导入改成先整理后生成节点的闭环

## 执行时间
- 开始时间：2026-04-07 22:14:20
- 结束时间：2026-04-07 22:31:18

## 仓库根目录
- C:\Users\edwar\Desktop\BrainFlow

## 任务目标
- 将智能导入流程改成先生成可评审的整理草案，再由草案编译生成节点预览与导入操作，形成可快速迭代的闭环。

## 解决的问题
- 将 `TextImportResponse` 提升为正式携带 `nodePlans` 的响应结构，导入结果不再只剩节点预览与操作列表。
- Smart Import 第二步改成结构草案评审，第三步 merge review 只有在确认草案后才开放。
- 草案树编辑改为直接作用于 `nodePlans`，编辑后本地重编译 `previewNodes`，不再依赖再次调用 Codex。
- 导入 prompt 的画布上下文改成更轻量的 map-light 版本，去掉大块背景节点正文，只保留焦点节点与少量背景标题。
- 补齐相关单元/组件/桥接测试，并通过定向测试与 `pnpm build:web`。

## 问题原因
- 现有流程把分类、结构规划、节点预览、merge review 混在同一轮结果里，用户看到的是“直接生成节点”，缺少单独评审整理逻辑的闭环。
- `nodePlans` 虽然已经在语义规划链路里存在，但只在 bridge 和本地导入内部短暂使用，没有成为 store/UI 的主状态。
- 预览编辑原先是基于 `previewNodes` 的展示树修改，不是基于整理草案本身，导致“调整结构”与“整理逻辑”脱钩。
- 导入 prompt 会带入大量现有脑图背景节点内容，弱结构文本容易被当前画布结构干扰。

## 尝试的解决办法
1. 扩展 `shared/ai-contract.ts` 与 bridge/local import 响应，统一返回 `nodePlans`，并在缺失时由 `previewNodes` 回推。
2. 重写 `src/features/import/text-import-preview-edit.ts`，把草案树编辑迁移到 `nodePlans` 层，并在编辑后本地重编译预览节点与操作。
3. 调整 `src/features/import/text-import-store.ts`，新增 `draftTree`、`draftConfirmed` 与 `confirmDraft`，让 store 以草案为第一主状态。
4. 调整 `src/features/import/components/TextImportDialog.tsx` 与 `src/pages/editor/MapEditorPage.tsx`，把第二步明确成结构草案评审，并在确认前阻止进入 merge review。
5. 收紧 `server/codex-bridge.ts` 的导入 prompt 上下文，只保留焦点节点和少量背景标题，避免整图背景文本过早干扰整理。
6. 更新 `server/codex-bridge.test.ts`、`server/app.test.ts`、`src/features/import/text-import-store.test.ts`、`src/features/import/components/TextImportDialog.test.tsx`、`src/features/import/text-import-job.test.ts`、`src/features/import/text-import-apply.test.ts`、`src/pages/editor/MapEditorPage.test.tsx`。
7. 运行 `pnpm vitest run src/features/import/text-import-store.test.ts src/features/import/components/TextImportDialog.test.tsx src/features/import/text-import-job.test.ts src/features/import/text-import-apply.test.ts server/codex-bridge.test.ts server/app.test.ts src/pages/editor/MapEditorPage.test.tsx` 与 `pnpm build:web` 验证。

## 是否成功解决
- 状态：成功
- 说明：草案优先的智能导入闭环已落地，目标测试与生产构建均通过。

## 相关文件
- C:\Users\edwar\Desktop\BrainFlow\shared\ai-contract.ts
- C:\Users\edwar\Desktop\BrainFlow\shared\text-import-semantics.ts
- C:\Users\edwar\Desktop\BrainFlow\server\codex-bridge.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\text-import-store.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\text-import-preview-edit.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\local-text-import-core.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\text-import-batch-compose.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\components\TextImportDialog.tsx
- C:\Users\edwar\Desktop\BrainFlow\src\pages\editor\MapEditorPage.tsx

## 遗留问题/下一步
- 当前在“手改草案后确认”的路径里，会清空旧的 merge/conflict 建议，而不是基于新草案重新跑一遍 semantic adjudication；这是首版为保证闭环稳定做的保守选择。
- 如果后续继续优化导入效果，下一步应把“确认草案后重跑 semantic merge review”接上，这样草案编辑后的 merge review 也能保持新鲜。
