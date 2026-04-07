# 任务记录

## 任务名称
- 导入进度可视化与节点生成性能修复

## 执行时间
- 开始时间：2026-04-06 08:26:23
- 结束时间：2026-04-06 08:51:20

## 仓库根目录
- `C:\Users\edwar\Desktop\BrainFlow`

## 任务目标
- 按既定方案实现 Markdown 导入的细粒度进度可视化、Codex 导入上下文压缩，以及 Apply to canvas 的异步分批执行与进度展示。

## 解决的问题
- 为 Markdown/Codex 导入链路新增 `runner_observation` 流事件，前端现在可以看到 Codex 启动、首个 JSON 事件和完成时机，而不是只看到粗粒度阶段百分比。
- 将导入弹窗状态从单条文本扩展为 `currentStatus + statusTimeline`，支持阶段时间线、Runner 状态、长等待阶段的不确定进度条，以及 Apply to canvas 的实时计数进度。
- 重写导入 Prompt 上下文构建逻辑，不再把完整 `request` 直接塞进 Prompt，而是保留完整源文本与焦点路径，同时将背景节点压缩为轻量摘要，减少 Prompt 体积并补充上下文大小日志。
- 将导入落图执行改为单次克隆草稿文档、批量异步执行与批次 yield，避免每条操作都 `structuredClone` 整份文档造成主线程卡顿。
- 补充并通过了导入桥接、导入作业、导入 store、导入弹窗、导入 apply、AI proposal 和 `server/app` 的定向测试；前后端构建也已通过。

## 问题原因
- `.md` 文件默认走 Codex 导入时，会把全文、预处理提示和整张脑图上下文拼成一次结构化生成请求，主耗时集中在 `waiting_codex_primary` 阶段。
- 前端之前只保留当前阶段文案和固定百分比，没有保留阶段历史，也没有把 Runner 的子观测事件透传到 UI，所以用户看不到“卡在哪一步”。
- Apply to canvas 之前在主线程同步逐条执行操作，并且底层每个树操作都会克隆整份文档，节点变多后会明显阻塞渲染。

## 尝试的解决办法
1. 创建任务记录并梳理当前导入/应用链路。
2. 扩展 `shared/ai-contract.ts`、`server/codex-bridge.ts`、`server/app.ts` 与 `src/features/import/text-import-job.ts`，打通 `runner_observation` 协议。
3. 在 `server/codex-bridge.ts` 中新增紧凑导入上下文构建器，保留完整源文本与焦点节点，压缩背景节点，并记录上下文大小日志。
4. 在 `src/features/import/text-import-store.ts` 中增加 `currentStatus`、`statusTimeline`、`progressIndeterminate` 和 Apply 进度字段。
5. 在 `src/features/import/components/TextImportDialog.tsx/.module.css` 中实现阶段时间线、Runner 状态显示、不确定进度条和 Apply 实时进度展示。
6. 在 `src/features/ai/ai-proposal.ts` 中重写提案应用执行器，新增异步批处理版本；在 `src/features/import/text-import-apply.ts` 与 `src/pages/editor/MapEditorPage.tsx` 接入。
7. 运行：
   - `pnpm vitest run server/codex-bridge.test.ts src/features/import/text-import-job.test.ts src/features/import/text-import-store.test.ts src/features/import/text-import-apply.test.ts src/features/import/components/TextImportDialog.test.tsx src/features/ai/ai-proposal.test.ts`
   - `pnpm build`
   - `pnpm vitest run server/app.test.ts`

## 是否成功解决
- 状态：成功
- 说明：方案要求的导入可观测性、Prompt 上下文压缩、Apply 异步批执行与 UI 进度展示均已落地；定向测试与构建通过。

## 相关文件
- `shared/ai-contract.ts`
- `server/app.ts`
- `server/codex-bridge.ts`
- `server/codex-bridge.test.ts`
- `src/features/import/text-import-job.ts`
- `src/features/import/text-import-store.ts`
- `src/features/import/text-import-apply.ts`
- `src/features/import/components/TextImportDialog.tsx`
- `src/features/import/components/TextImportDialog.module.css`
- `src/features/ai/ai-proposal.ts`
- `src/features/ai/ai-proposal.test.ts`
- `src/pages/editor/MapEditorPage.tsx`
- `Work_Progress/2026-04-06/082623_import_progress_and_apply_perf.md`

## 遗留问题/下一步
- 目前只对导入链路做了批次 yield；如果后续发现普通 AI 提案落图也有明显卡顿，可把同样的异步进度 UI 复用到 AI 提案应用链路。
- 生产构建仍提示 `MapEditorPage` chunk 超过 500 kB，这不是本轮功能阻塞项，但后续可以再做拆包优化。
