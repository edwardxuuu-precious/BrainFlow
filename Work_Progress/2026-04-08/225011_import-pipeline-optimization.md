# 任务记录

## 任务名称
- 导入理解与生成全流程优化

## 执行时间
- 开始时间：2026-04-08 22:50:11
- 结束时间：2026-04-08 23:22:42

## 仓库根目录
- `C:\Users\edwar\Desktop\BrainFlow`

## 任务目标
- 补齐导入链路的阶段级诊断、基线与 benchmark 输出。
- 引入可复用的导入 artifact，减少重复预处理、语义抽取与规划。
- 提升批量导入、语义裁决和高密度展示的效率，同时保持信息覆盖与可追溯性。
- 给预览编辑和 apply 前检查增加更可读的诊断与影响摘要。

## 解决的问题
- 修复了 `scripts/benchmark-markdown-import.ts` 请求构造不完整导致的直接报错。
- 扩展了导入响应诊断字段，增加阶段耗时、密度统计、artifact reuse、质量信号、apply 预估和语义裁决统计。
- 在 `shared/text-import-semantics.ts` 中加入了基于内容 hash 的 in-memory artifact 复用，并把规划摘要扩展为包含结构评分、推荐路由、是否需要 deep pass。
- 单文件和批量本地导入现在都会把诊断信息挂到 `TextImportResponse.diagnostics` 上。
- 语义裁决阶段加入了候选分组和代表样本裁决，existing-topic 的低歧义高置信候选直接留在本地启发式路径，不再全部走 bridge。
- 批量导入文件包装节点增加了 route / archetype / slots / warning 扫描信息。
- 预览编辑后会重新计算诊断，并记录 `dirtySubtreeIds` 和最近一次编辑动作。
- `TextImportDialog` 增加了开发向 Debug diagnostics 面板，用于查看阶段耗时、密度、质量、merge 与 apply 预估。

## 问题原因
- 原有导入链路缺少统一的诊断结构，导致性能优化前无法可靠对比。
- 预处理、语义 hints、semantic units 和 planner 结果会在 store、本地 worker、repair、benchmark 中被重复计算。
- 语义裁决把候选逐批平铺发送到 bridge，没有利用候选重复度和低歧义启发式。
- UI 只能看到粗粒度状态和 warnings，无法判断慢在哪一段、是否复用了 artifact、是否存在深挖需求。

## 尝试的解决办法
1. 扩展 `shared/ai-contract.ts`，为导入响应增加 `diagnostics` 和更细的候选分组字段。
2. 在 `shared/text-import-semantics.ts` 中加入 `prepareTextImportArtifacts`、结构评估与内存缓存，并让 `resolveTextImportPlanningOptions` 统一输出 `preparedArtifacts`。
3. 让 `buildImportBundlePreview(...)` 支持直接消费预计算 planner 结果，减少单文件重复规划。
4. 在 `local-text-import-core.ts`、`text-import-batch-compose.ts`、`text-import-preview-edit.ts`、`text-import-store.ts` 中接通诊断与 artifact reuse。
5. 在 `text-import-semantic-adjudication.ts` / `text-import-semantic-merge.ts` 中加入候选 grouping、representative adjudication 与统计回写。
6. 修复 benchmark 脚本并补充相关测试，最后运行定向 vitest、store test、benchmark 与 `npm run build:web` 验证。

## 是否成功解决
- 状态：成功
- 说明：
  - 已完成代码实现。
  - 已通过以下验证：
    - `npm run benchmark:markdown-import -- --file src/features/import/__fixtures__/GTM_main.md --runs 1`
    - `npx vitest run shared/text-import-semantics.test.ts src/features/import/local-text-import-core.test.ts src/features/import/text-import-semantic-merge.test.ts src/features/import/components/TextImportDialog.test.tsx`
    - `npx vitest run src/features/import/text-import-store.test.ts`
    - `npm run build:web`

## 相关文件
- `Work_Progress/2026-04-08/225011_import-pipeline-optimization.md`
- `scripts/benchmark-markdown-import.ts`
- `shared/ai-contract.ts`
- `shared/text-import-layering.ts`
- `shared/text-import-semantics.ts`
- `shared/text-import-semantics.test.ts`
- `src/features/import/components/TextImportDialog.tsx`
- `src/features/import/components/TextImportDialog.test.tsx`
- `src/features/import/knowledge-import.ts`
- `src/features/import/local-text-import-core.ts`
- `src/features/import/local-text-import-core.test.ts`
- `src/features/import/text-import-batch-compose.ts`
- `src/features/import/text-import-diagnostics.ts`
- `src/features/import/text-import-job.ts`
- `src/features/import/text-import-preview-edit.ts`
- `src/features/import/text-import-semantic-adjudication.ts`
- `src/features/import/text-import-semantic-merge.ts`
- `src/features/import/text-import-semantic-merge.test.ts`
- `src/features/import/text-import-store.ts`

## 遗留问题/下一步
- 当前 artifact reuse 还是会话内内存级缓存，尚未做持久缓存或跨会话索引。
- 预览编辑阶段已记录脏子树和重编译耗时，但仍是全量 compile，后续可继续下钻到真正的 subtree incremental compile。
- 批量导入目前已经具备 deep-pass 信号和诊断，但“只对高价值文件深挖”的执行策略仍偏保守，可继续把这部分推进成真正的两段式调度。
