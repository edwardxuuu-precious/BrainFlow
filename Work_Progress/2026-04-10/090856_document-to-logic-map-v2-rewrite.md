# 任务记录

## 任务名称
- 重写 `document-to-logic-map` 为 v2 判断树 + 执行镜像协议

## 执行时间
- 开始时间：2026-04-10 09:09:00 +08:00
- 结束时间：2026-04-10 09:35:03 +08:00

## 仓库根目录
- `C:/Users/edwar/Desktop/BrainFlow`

## 任务目标
- 将 `.agents/skills/document-to-logic-map` 从 v1 的文档抽取协议升级为 v2 的判断树协议。
- 同步改造 schema、bridge 归一化、semantic/projection 承载、execution view 镜像逻辑、样例与 GTM 测试产物。

## 解决的问题
- 重写 skill 规则，明确主图必须围绕核心问题组织成判断树，一级分支统一为判断模块。
- 输出 schema 新增 `structure_role`、`locked`、`proposed_reorder`、`proposed_reparent`、`source_module_id`、`inferred_output`、`mirrored_task_id` 等字段。
- bridge、semantic layer、preview edit、knowledge import、IndexedDB 持久化链路已支持这些新字段。
- thinking view 改为优先投影 `judgment_module`；execution view 改为仅汇总任务镜像。
- 新增基于 `docs/test_docs/GTM_main.md` 的 v2 expected fixture，移除顶层 task 抢占一级的问题。
- 定向测试、导入链路测试、类型检查、JSON 解析检查均已通过。

## 问题原因
- 旧版 v1 协议过度依赖 heading/source outline，导致一级结构混杂主题词、问题句和 task，且 execution view 会把判断节点一起带入执行区。
- 旧版 task 规则要求 action 与 deliverable 同时显式存在，导致可执行动作召回偏低。
- 旧版 projection 与存储链路没有稳定承载结构优化和任务镜像元数据的字段。

## 尝试的解决办法
1. 重写 `.agents/skills/document-to-logic-map/SKILL.md`、`input.schema.json`、`output.schema.json`、`task-rules.md` 与 examples，建立 v2 判断树协议。
2. 扩展 `shared/ai-contract.ts`、`server/codex-bridge.ts`、`shared/text-import-layering.ts`、`shared/text-import-semantics.ts`，让新字段进入正式接口与 projection。
3. 扩展 `knowledge-import.ts`、`text-import-preview-edit.ts`、`legacy-document-local-service.ts`，确保 round-trip 与持久化不丢字段。
4. 新增 `docs/test_docs/GTM_main.document-to-logic-map.v2.json`，并更新 `server/codex-bridge.test.ts`、`shared/text-import-layering.test.ts`。
5. 执行 `npm test -- shared/text-import-layering.test.ts server/codex-bridge.test.ts`。
6. 执行 `npm test -- src/features/import/local-text-import-core.test.ts src/features/import/knowledge-import.test.ts shared/text-import-semantics.test.ts`。
7. 执行 `npx tsc -p tsconfig.json --noEmit`、`git diff --check` 与 JSON 解析检查。

## 是否成功解决
- 状态：成功
- 说明：v2 判断树 + 执行镜像协议已落地到 skill、schema、bridge、projection、持久化与测试样例，相关测试和类型检查均通过。

## 相关文件
- `Work_Progress/2026-04-10/090856_document-to-logic-map-v2-rewrite.md`
- `.agents/skills/document-to-logic-map/SKILL.md`
- `.agents/skills/document-to-logic-map/references/input.schema.json`
- `.agents/skills/document-to-logic-map/references/output.schema.json`
- `.agents/skills/document-to-logic-map/references/task-rules.md`
- `.agents/skills/document-to-logic-map/references/examples/analysis-expected.json`
- `.agents/skills/document-to-logic-map/references/examples/process-expected.json`
- `server/codex-bridge.ts`
- `server/codex-bridge.test.ts`
- `shared/ai-contract.ts`
- `shared/text-import-layering.ts`
- `shared/text-import-layering.test.ts`
- `shared/text-import-semantics.ts`
- `src/features/import/knowledge-import.ts`
- `src/features/import/text-import-preview-edit.ts`
- `src/features/storage/adapters/indexeddb/legacy-document-local-service.ts`
- `docs/test_docs/GTM_main.document-to-logic-map.v2.json`

## 遗留问题/下一步
- 当前只补了与 v2 协议直接相关的测试，没有额外改动完整 e2e 套件。
- `output/choose-files/` 与 `output/e2e/` 为仓库中已有未跟踪目录，本次未处理。
