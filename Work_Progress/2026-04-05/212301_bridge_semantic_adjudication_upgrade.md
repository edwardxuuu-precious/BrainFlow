# 任务记录

## 任务名称
- 候选对裁决独立接入 Bridge 的语义归并升级

## 执行时间
- 开始时间：2026-04-05 21:23:01
- 结束时间：2026-04-05 21:50:11

## 仓库根目录
- `C:\Users\edwar\Desktop\BrainFlow`

## 任务目标
- 在不回退本地 Markdown 结构导入热路径的前提下，新增候选对语义裁决接口，将导入节点与现有脑图/跨文件节点的语义归并改为“本地候选生成 + Bridge 结构化裁决”。

## 解决的问题
- 新增了独立的候选对语义裁决 contract、HTTP 接口与 bridge 执行链路，不再复用全文导入 preview 接口做语义归并。
- Worker 现已支持“先生成本地结构 preview，再后台批量调用 bridge 做语义裁决”，并把候选总数、已裁决数、fallback 数同步到前端状态。
- 新增了语义归并 helper，用于从 preview 提取 existing/cross-file 候选、回填 bridge 决策、生成高置信度 `update_topic(note+title)`，并将跨文件高置信度节点 canonical 化为最终 apply 图。
- benchmark 输出已补充高置信度归并数、中置信度建议数和 fallback 数，便于后续评估 bridge 裁决质量。

## 问题原因
- 当前强语义归并仍依赖本地启发式，质量上限明显，且 Bridge 侧只有全文导入预览接口，不适合候选对级别的低延迟裁决。

## 尝试的解决办法
1. 核对现有本地导入、worker、store、bridge 与 shared contract 的边界。
2. 在 `shared/ai-contract.ts` 中新增 semantic candidate / decision / adjudication request-response / semanticMerge summary 等共享类型。
3. 在 `server/app.ts` 与 `server/codex-bridge.ts` 中新增 `/api/codex/import/adjudicate`、专用 prompt/schema、结构化语义日志与测试。
4. 在前端新增 `text-import-semantic-merge.ts`，将现有本地结构 preview 当作 draft，再由 worker 执行 bridge 批量裁决并重建最终 preview/operations。
5. 更新 worker、job、store、dialog、MapEditorPage，使结构 preview 可先显示，后台语义裁决继续推进，并展示 candidate/adjudicated/fallback 统计。
6. 补充 `text-import-semantic-merge.test.ts`，并更新现有 app/bridge/dialog/store 相关测试。
7. 运行验证：
   - `pnpm vitest run server/codex-bridge.test.ts server/app.test.ts src/features/import/text-import-store.test.ts src/features/import/components/TextImportDialog.test.tsx src/features/import/text-import-semantic-merge.test.ts src/features/import/text-import-apply.test.ts`
   - `pnpm build:web`
   - `pnpm build:server`
   - `pnpm benchmark:markdown-import --file "C:\Users\edwar\Downloads\GTM_main.md" --runs 1`
   - `pnpm benchmark:markdown-import --dir "C:\Users\edwar\Downloads" --runs 1`

## 是否成功解决
- 状态：成功
- 说明：候选对语义裁决已独立接入 bridge，前端本地主路径保持不变，后台语义裁决可批量执行并回填安全 apply 图；相关测试、构建和 benchmark 均已通过。

## 相关文件
- `shared/ai-contract.ts`
- `server/app.ts`
- `server/codex-bridge.ts`
- `src/features/import/local-text-import-core.ts`
- `src/features/import/text-import-client.ts`
- `src/features/import/text-import.worker.ts`
- `src/features/import/text-import-job.ts`
- `src/features/import/text-import-store.ts`
- `src/features/import/text-import-apply.ts`
- `src/features/import/text-import-semantic-merge.ts`
- `scripts/benchmark-markdown-import.ts`

## 遗留问题/下一步
- 当前 benchmark 仍主要覆盖本地 direct path；如需对 bridge 裁决质量做连续评估，还需要增加“带真实 adjudication endpoint 的 corpus benchmark”。
- cross-file canonical 化目前采用保守的“保留来源树、压缩最终 apply 图”策略，后续可继续优化 summary 生成质量和 cluster 解释文案。
