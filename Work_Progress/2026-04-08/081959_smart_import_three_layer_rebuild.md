# 任务记录

## 任务名称
- 智能导入三层架构重构

## 执行时间
- 开始时间：2026-04-08 08:19:59
- 结束时间：2026-04-08 09:11:19

## 仓库根目录
- C:\Users\edwar\Desktop\BrainFlow

## 任务目标
- 将当前智能导入从直接生成画布树重构为 source layer / semantic layer / view layer 三层模型，并补齐文档持久化、视图切换、迁移、测试与 GTM 示例。

## 解决的问题
- 将智能导入主链从“Markdown 标题直接生成树”重构为 `source -> semantic -> view` 三层模型。
- 为文档模型新增 `knowledgeImports`、`activeImportBundleId`、`activeKnowledgeViewId`，并通过 `normalizeDocument` 完成旧文档回填。
- 新增 `source / semantic_node / semantic_edge / view / import_bundle / view_projection` 数据结构与持久化。
- 本地单文件、批量导入，以及 Codex bridge 统一支持 bundle、三视图 projection 和默认 `thinking_view`。
- 新增 bundle 挂载、active view 快照回写、Archive/Thinking/Execution 视图切换能力。
- 按 GTM 案例重建默认主画布：中心问题为“第一波应该先打谁”，一级分支固定为四个判断维度，屏蔽“说明/对话记录/用户/助手/备注/结论/拆解/建议下一步”等原文栏目。
- 补齐 GTM fixture、服务端 layer-only 归一化测试、编辑器视图切换测试、迁移测试与全量回归。

## 问题原因
- 旧导入链把来源结构、语义结构和展示结构混在一棵 preview tree 里，导致主画布直接继承 Markdown heading/source 栏目。
- `TextImportResponse` 只有 `nodePlans / previewNodes / operations`，缺少可持久化的 source layer、semantic layer 和 view layer。
- 编辑器没有 bundle 挂载和 view switcher，导入结果只能一次性落成静态 topic 子树，无法按视图切换或回写快照。
- 服务端 bridge 默认要求旧式 preview payload，无法直接消费 layer-only 结果。

## 尝试的解决办法
1. 创建任务记录并梳理当前导入、文档持久化、编辑器视图切换链路。
2. 扩展 `shared/ai-contract.ts`、`MindMapDocument`、`workspace`，补充知识导入 bundle、semantic graph 和 view projection 类型。
3. 新增 `shared/text-import-layering.ts`，实现 `buildSourceLayer / canonicalizeSemanticGraph / projectArchiveView / projectThinkingView / projectExecutionView / buildImportBundlePreview / compileSemanticLayerViews`。
4. 重写 `local-text-import-core.ts` 与 `text-import-batch-compose.ts`，统一改为先产出 layer 数据，再选择 active view 作为 preview cache。
5. 新增 `src/features/import/knowledge-import.ts`，实现 bundle 挂载、mounted subtree 快照回写和 Archive/Thinking/Execution 视图切换。
6. 改造 `text-import-apply.ts`、`text-import-preview-edit.ts`、`editor-store.ts`、`MapEditorPage.tsx`，让导入结果真正持久化并可切换视图。
7. 扩展 `server/codex-bridge.ts`，支持 layer-only payload 归一化，并在缺少 projection cache 时本地编译三视图。
8. 新增 `src/features/import/__fixtures__/GTM_main.md`，重写/补充导入、语义 merge、editor store、document service、bridge 等测试。
9. 运行 `pnpm exec tsc -p tsconfig.app.json --noEmit --pretty false`、`pnpm exec tsc -p server/tsconfig.json --pretty false`、`pnpm test` 完成回归验证。

## 是否成功解决
- 状态：成功
- 说明：三层导入架构、bundle 持久化、主画布默认 thinking_view、GTM 约束、execution_view、服务端 layer-only 归一化和最小回归测试已全部落地，前后端类型检查与全量测试通过。

## 相关文件
- shared/ai-contract.ts
- shared/text-import-layering.ts
- shared/text-import-semantics.ts
- server/codex-bridge.ts
- server/codex-bridge.test.ts
- src/features/documents/types.ts
- src/features/documents/document-factory.ts
- src/features/documents/document-service.ts
- src/features/editor/editor-store.ts
- src/pages/editor/MapEditorPage.tsx
- src/features/import/local-text-import-core.ts
- src/features/import/text-import-batch-compose.ts
- src/features/import/text-import-preview-edit.ts
- src/features/import/text-import-apply.ts
- src/features/import/knowledge-import.ts
- src/features/import/__fixtures__/GTM_main.md

## 遗留问题/下一步
- 当前 `pnpm test` 仍会输出 jsdom 对 `HTMLCanvasElement.getContext()` 的“Not implemented”提示，但不影响测试通过；如需清理，可后续引入 canvas mock。
- v1 仅把手工编辑回写到 active view projection，不反向同步 semantic layer；如果后续需要双向同步，需要补 semantic diff 与 node identity 策略。
