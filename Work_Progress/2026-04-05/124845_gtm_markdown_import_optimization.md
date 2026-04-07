# 任务记录

## 任务名称
- `GTM_main.md` 智能导入链路提速、后台化与并发安全改造

## 执行时间
- 开始时间：2026-04-05 12:48:45
- 结束时间：2026-04-05 13:08:30

## 仓库根目录
- `c:\Users\edwar\Desktop\BrainFlow`

## 任务目标
- 围绕 `C:\Users\edwar\Downloads\GTM_main.md` 建立可复现的 benchmark 与 feedback loop。
- 将 `.md` 智能导入主路径改为 30 秒内可用的确定性本地导入，并提供后台处理、细粒度进度和并发安全 apply。

## 解决的问题
- 新增本地 Markdown 导入主路径，不再让 `.md` 文件默认走 Codex 全文结构化热路径。
- 新增导入 benchmark 命令，可直接对 `GTM_main.md` 反复测量 `preprocess / parse / match / preview / apply` 各阶段耗时。
- 文本导入状态改为 job 模型，关闭弹窗后任务继续运行；顶部按钮会持续显示导入进度或“可应用”状态。
- 导入弹窗新增进度条、耗时、模式提示和合并建议展示。
- 导入 apply 改为对纯新增 `create_child` 导入结果做安全 rebase，不会因为后台处理期间用户继续编辑画布而被整图时间戳直接拦截。

## 问题原因
- 旧 `.md` 导入主路径仍依赖 Codex CLI 对全文和整张脑图做一次性结构化推理，热路径过长。
- 旧文本导入 store 是“单次请求 + 单次 apply”模型，关闭弹窗会丢状态，也不具备后台 job 能力。
- 旧 apply 逻辑完全依赖 `baseDocumentUpdatedAt` 做整图阻断，无法对纯新增导入结果做安全 rebase。

## 尝试的解决办法
1. 新增 `src/features/import/local-text-import-core.ts`，基于 remark/mdast 做确定性 Markdown 导入树构建、预览生成和启发式合并建议。
2. 新增 `src/features/import/text-import.worker.ts` 与 `src/features/import/text-import-job.ts`，将 Markdown 导入放进 Worker 中后台运行，并保留 Codex fallback。
3. 重写 `src/features/import/text-import-store.ts`，改成 job 驱动状态管理，支持关闭弹窗后继续运行、恢复查看和安全 apply。
4. 重写 `src/features/import/components/TextImportDialog.tsx`，补充进度条、耗时、模式提示、合并建议面板。
5. 在 `src/features/import/text-import-apply.ts` 增加安全 rebase：纯新增 `create_child` 导入可应用到更新后的文档版本。
6. 新增 `scripts/benchmark-markdown-import.ts` 和 `pnpm benchmark:markdown-import`，用真实文件跑可复现基准。
7. 运行并验证 `GTM_main.md` benchmark：默认空白快照下 `p50=30ms`、`p95=45ms`，节点数 55、边数 54、预处理线索 71。

## 是否成功解决
- 状态：部分成功
- 说明：
  - 已经把 `.md` 导入主路径切到本地确定性流水线，达到远低于 30 秒的目标。
  - 后台 job、进度可视化和并发安全 apply 已经落地。
  - 旧 Codex 热路径 benchmark 对照模式已接入脚本，但本次实跑时本机 `http://127.0.0.1:8787/api/codex/import/preview` 不可用，未拿到同轮对照数据。

## 相关文件
- `shared/ai-contract.ts`
- `package.json`
- `scripts/benchmark-markdown-import.ts`
- `src/features/import/local-text-import-core.ts`
- `src/features/import/local-text-import-core.test.ts`
- `src/features/import/text-import.worker.ts`
- `src/features/import/text-import-job.ts`
- `src/features/import/text-import-apply.ts`
- `src/features/import/text-import-apply.test.ts`
- `src/features/import/text-import-store.ts`
- `src/features/import/text-import-store.test.ts`
- `src/features/import/components/TextImportDialog.tsx`
- `src/features/import/components/TextImportDialog.module.css`
- `src/features/import/components/TextImportDialog.test.tsx`
- `src/pages/editor/MapEditorPage.tsx`
- `src/features/import/text-import-client.ts`

## 遗留问题/下一步
- 用真实导出的当前脑图 JSON 快照配合 `--snapshot <path>` 再跑一轮 `GTM_main.md` benchmark，补齐真实画布基准。
- 如果需要保留 AI 增强合并，可在现有 Worker 结果基础上追加“仅针对未决节点”的小批量 Codex 建议，而不是恢复全文大 prompt。
- 如果要长期保留后台任务，需要再补“浏览器刷新后恢复 job”能力；本次仅保证同一会话内后台继续执行。
