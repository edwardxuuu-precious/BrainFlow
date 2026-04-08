# 任务记录

## 任务名称
- Thinking 与 Execution 单图融合重构

## 执行时间
- 开始时间：2026-04-08 13:27:13
- 结束时间：2026-04-08 14:24:30

## 仓库根目录
- C:\Users\Administrator\Desktop\BrainFlow

## 任务目标
- 将导入画布收敛为单一 Thinking 主图，移除 Archive 入口，将 Execution 以任务子节点形式融入主图，并把内容编辑统一回写到 semantic layer。

## 解决的问题
- 将导入画布从 `Archive / Thinking / Execution` 三视图收敛为单一 `Thinking` 主图。
- 移除编辑器顶部知识视图切换入口，前台不再暴露 `Archive` 与 `Execution` 标签。
- 将执行语义节点并入 thinking projection，GTM 场景会把 goal / project / task 作为主图中的执行分支展示。
- 将原先“只回写 active projection 快照”的同步逻辑改为“从挂载子树回推 semantic layer，再重编译主图 projection”。
- 旧 bundle 文档在 IndexedDB 归一化时会自动压缩为单图结构，保存后不再继续产出多视图数据。
- 更新本地导入、bridge 与编辑器测试，覆盖单图 bundle、旧数据兼容与 GTM 执行分支展示。

## 问题原因
- 现有 Archive/Thinking/Execution 采用多 projection 快照模型，导致各视图内容漂移，用户在一个视图中的编辑不会自动联动其他视图。

## 尝试的解决办法
1. 确认项目根目录、桌面 Daily_Work 目录和脚本可用。
2. 梳理 `text-import-layering`、`knowledge-import`、`editor-store`、`legacy-document-local-service` 与编辑器页面的多视图入口。
3. 重构 `shared/text-import-layering.ts`，将 bundle/view 编译收敛为单一 thinking projection，并新增从 `previewNodes` 反推 `semanticNodes / semanticEdges` 的公共逻辑。
4. 重写 `src/features/import/knowledge-import.ts`，让文档编辑回写到 semantic layer，再基于语义层重编译主图 projection。
5. 改造 `src/pages/editor/MapEditorPage.tsx`，移除 Archive / Thinking / Execution 的 segmented control。
6. 改造 `src/features/storage/adapters/indexeddb/legacy-document-local-service.ts`，对旧 bundle 自动做单图迁移与归一化。
7. 更新 `local-text-import-core`、`codex-bridge`、`editor-store` 等测试断言，使其符合单图模型与 execution 融合后的 GTM 结构。
8. 运行 `npx tsc -p tsconfig.app.json --noEmit --pretty false`、`npx tsc -p server/tsconfig.json --pretty false`、`npx vitest run --reporter=dot` 完成验证。

## 是否成功解决
- 状态：成功
- 说明：单图融合、语义层事实源回写、旧 bundle 迁移、GTM 执行分支展示与相关回归测试均已完成并通过验证。

## 相关文件
- server/codex-bridge.test.ts
- shared/ai-contract.ts
- shared/text-import-layering.ts
- src/features/storage/adapters/indexeddb/legacy-document-local-service.ts
- src/features/editor/editor-store.test.ts
- src/features/import/knowledge-import.ts
- src/features/import/local-text-import-core.test.ts
- src/pages/editor/MapEditorPage.tsx

## 遗留问题/下一步
- 当前保留了 `KnowledgeViewType` 的旧枚举值以兼容历史数据和协议输入，但新保存结果已只产出 thinking 单图；后续如需继续收敛类型定义，可再做一次纯类型清理。
- 执行任务的 `status / owner / due_date / priority` 已保留在 semantic layer 并会进入主图投影 note，但前台暂未增加专门的任务字段编辑 UI；如需可继续在属性面板补齐。
