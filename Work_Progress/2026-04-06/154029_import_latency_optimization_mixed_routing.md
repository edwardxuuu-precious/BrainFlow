# 任务记录

## 任务名称
- 导入耗时优化与混合路由落地

## 执行时间
- 开始时间：2026-04-06 15:40:29
- 结束时间：2026-04-06 15:54:00

## 仓库根目录
- C:\Users\edwar\Desktop\BrainFlow

## 任务目标
- 落地导入耗时优化方案，避免结构清晰的 Markdown 继续走 Codex 慢路径。
- 压缩 Codex 导入 prompt，降低 `waiting_codex_primary` 阶段耗时。
- 同步更新导入文案、测试与基准验证。

## 解决的问题
- 已将导入路由从“Markdown 扩展名优先走 Codex”改为“按内容结构决定本地/ Codex 路径”。
- 单文件与批量导入现在都会优先让结构清晰的 Markdown 走本地 deterministic 导入，只有弱结构或 prose-heavy 文本才走 Codex。
- 已压缩 Codex 导入 prompt：保留完整 `rawText`，但将 `preprocessedHints` 改为摘要，并将 focused topics 的完整 `note` 改为仅对 active/selected/locked 主题保留短 `notePreview`。
- 已更新导入模式提示文案，并补齐路由与 prompt 压缩相关测试。
- 已完成性能复测：样本文档本地 benchmark `p50=10ms / p95=24ms`；强制走 Codex 时 `promptContextLength` 从 23134 降到 6634，`promptLength` 从 27645 降到 10256。

## 问题原因
- `.md/.markdown` 文件当前默认优先走 Codex 导入，导致结构清晰的 Markdown 也进入高延迟的 `waiting_codex_primary` 阶段。
- Codex 导入上下文中保留了过多 `preprocessedHints` 明细和 focused topic 完整 note，prompt 体积偏大。

## 尝试的解决办法
1. 在 `src/features/import/local-text-import-core.ts` 中取消 Markdown 扩展名强制走 Codex 的特判，改为根据 `heading/bullet/ordered/task/table` 提示数或 `#` 标题判断是否走本地导入。
2. 在 `src/features/import/text-import-job.ts` 中引入统一路由判定，单文件直接按内容选路；批量导入改为逐文件判定，仅当 batch 中存在弱结构文件时才进入 hybrid/Codex 批处理。
3. 在 `src/features/import/text-import-batch-compose.ts` 中为批量来源补充内部 `route` 字段，用于批处理中区分 local 与 Codex 子路径。
4. 在 `src/features/import/text-import-store.ts` 中更新模式提示与初始化状态文案，不再把 Markdown 等同于 Codex。
5. 在 `server/codex-bridge.ts` 中压缩 `preprocessedHints` 为摘要，focused topics 默认不再携带完整 note，只对 active/selected/locked 主题保留 `notePreview`，并同步缩短导入 prompt 说明。
6. 更新 `src/features/import/text-import-job.test.ts` 与 `server/codex-bridge.test.ts`，覆盖结构化 Markdown 本地路由、弱结构 Markdown Codex 路由、batch 混合路由和 prompt 压缩断言。
7. 运行验证：
   - `pnpm exec vitest run src/features/import/text-import-job.test.ts`
   - `pnpm exec vitest run server/codex-bridge.test.ts`
   - `pnpm exec vitest run src/features/import/text-import-store.test.ts src/features/import/components/TextImportDialog.test.tsx`
   - `pnpm exec vitest run server/app.test.ts`
   - `pnpm exec vitest run src/features/import/text-import-client.test.ts`
   - `pnpm build:web`
   - `pnpm build:server`
   - `pnpm benchmark:markdown-import --file "C:\\Users\\edwar\\Desktop\\工作汇报_2026-04-05至04-06.md" --runs 5`
8. 通过临时 bridge 采样 `[import][requestId=...]` 日志，确认 `promptContextLength` 与 `promptLength` 显著下降。

## 是否成功解决
- 状态：成功
- 说明：
  - 相关导入测试、bridge 测试、客户端测试均通过。
  - `build:web` 与 `build:server` 均通过。
  - 性能目标满足：样本文档本地预览稳定低于 100ms，Codex prompt 上下文长度下降超过 40%。

## 相关文件
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\local-text-import-core.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\text-import-job.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\text-import-store.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\text-import-batch-compose.ts
- C:\Users\edwar\Desktop\BrainFlow\server\codex-bridge.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\text-import-job.test.ts
- C:\Users\edwar\Desktop\BrainFlow\server\codex-bridge.test.ts
- C:\Users\edwar\Desktop\BrainFlow\Work_Progress\2026-04-06\154029_import_latency_optimization_mixed_routing.md

## 遗留问题/下一步
- 即使 prompt 已显著缩小，强制走 Codex 时仍可能长期停留在 `waiting_codex_primary`；本轮通过“结构清晰内容默认走本地路径”绕开主要体验瓶颈，但没有根治 Codex 本身的长等待。
- 如后续要继续压缩 Codex 等待时间，可进一步减少 focused topic 数量或把导入 prompt 中剩余的 schema/规则说明继续外提。
