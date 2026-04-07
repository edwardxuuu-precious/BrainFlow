# 任务记录

## 任务名称
- 增强智能导入链路性能日志与细粒度进度展示

## 执行时间
- 开始时间：2026-04-05 11:10:42
- 结束时间：2026-04-05 11:22:29

## 仓库根目录
- C:\Users\edwar\Desktop\BrainFlow

## 任务目标
- 为智能导入链路增加终端结构化耗时日志和前端细粒度进度/耗时展示，定位慢点与卡点。

## 解决的问题
- 为智能导入链路补充了细粒度导入阶段：`loading_prompt`、`starting_codex_primary`、`waiting_codex_primary`、`parsing_primary_result`、`repairing_structure`、`starting_codex_repair`、`waiting_codex_repair`、`parsing_repair_result`。
- 为 `/api/codex/import/preview` 增加了 requestId 级别的结构化日志，记录入口参数规模、总耗时、结果节点/操作/冲突数量，以及失败时的阶段、错误码和摘要。
- 为 bridge 层增加了导入子阶段日志，并通过 runner 观测钩子记录 Codex CLI 的 `spawn_started`、`first_json_event`、`completed` 三个关键时间点。
- 前端导入弹窗现在会显示更细粒度的进度文案，并新增“已耗时 X 秒/分XX秒”的实时显示。
- 新增/更新测试覆盖 runner 观测、bridge 阶段状态、app 导入流事件、store 时间戳状态和导入弹窗耗时显示。

## 问题原因
- 原有智能导入链路只有少量粗阶段，`analyzing_source` 后的大部分时间都落在 `previewTextImport -> runner.execute -> codex exec` 内部，但没有任何更细日志。
- 服务端只在启动和失败时有有限日志，缺少 requestId、阶段耗时、repair 重试和 CLI 首事件延迟等观测数据。
- 前端弹窗只有单条状态文案，没有累计耗时，用户难以区分“正常慢”和“真实卡住”。

## 尝试的解决办法
1. 扩展共享导入阶段类型，补足 bridge/runner 观测钩子。
2. 在 `server/app.ts` 中为导入请求生成 requestId，并记录开始、完成、失败三类结构化日志。
3. 在 `server/codex-bridge.ts` 中将主导入与 repair 重试拆成多个可观测子阶段，结合 `runner.execute(..., { onObservation })` 记录 CLI 启动、首事件和完成时机。
4. 在 `server/codex-runner.ts` 中为 `execute` / `executeMessage` 增加可选观测回调。
5. 在 `src/features/import/text-import-store.ts` 中增加预览开始/结束时间戳。
6. 在 `src/features/import/components/TextImportDialog.tsx` 中展示更细状态文案和实时耗时。
7. 运行 `pnpm vitest run server/codex-runner.test.ts server/codex-bridge.test.ts server/app.test.ts src/features/import/text-import-store.test.ts src/features/import/components/TextImportDialog.test.tsx`。
8. 运行 `pnpm build:web` 与 `pnpm build:server` 做构建验证。

## 是否成功解决
- 状态：成功
- 说明：智能导入链路的终端日志与前端细粒度进度显示已实现，相关测试和前后端构建均已通过。

## 相关文件
- C:\Users\edwar\Desktop\BrainFlow\shared\ai-contract.ts
- C:\Users\edwar\Desktop\BrainFlow\server\app.ts
- C:\Users\edwar\Desktop\BrainFlow\server\codex-bridge.ts
- C:\Users\edwar\Desktop\BrainFlow\server\codex-runner.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\text-import-store.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\components\TextImportDialog.tsx
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\components\TextImportDialog.test.tsx
- C:\Users\edwar\Desktop\BrainFlow\Work_Progress\2026-04-05\111042_import_observability_and_progress.md

## 遗留问题/下一步
- 工作区仍有本任务之外的既有改动，例如 `src/components/illustrations/NetworkConstellation.tsx`、`src/pages/home/HomePage.module.css`、`.stfolder/` 和若干先前任务记录文件，后续提交时需要单独甄别范围。
- 若要进一步定位“为什么慢”，下一步应在真实导入时观察终端中 `[import][requestId=...]` 的日志序列，看主耗时是否长期集中在 `waiting_codex_primary` 或 repair 阶段。
