# 任务记录

## 任务名称
- 将文本导入重构为 `document-to-logic-map` repo skill，并全量替换前后端导入链路

## 执行时间
- 开始时间：2026-04-09 20:40:46 +08:00
- 结束时间：2026-04-09 21:12:30 +08:00

## 仓库根目录
- `C:/Users/edwar/Desktop/BrainFlow`

## 任务目标
- 新增 `.agents/skills/document-to-logic-map` skill bundle。
- 让系统内 Codex 在导入时显式加载该 skill。
- 将导入 contract、前端 UI、共享语义与测试统一切换到新的 document-to-logic-map 语义。

## 解决的问题
- 新增了 `.agents/skills/document-to-logic-map` skill bundle，补齐 `SKILL.md`、输入输出 schema、任务判定规则与两份样例。
- `server/codex-runner.ts` 现已显式使用仓库根目录执行 `codex exec`，并注入 repo skill 的 `skills.config`。
- `server/codex-bridge.ts` 已切换到 `document-to-logic-map/v1` prompt 与 schema，新增 skill 输出归一化逻辑，将 skill-native JSON 适配成 `TextImportResponse`。
- `shared/text-import-layering.ts`、`shared/ai-contract.ts` 已对齐新的节点类型与视图投影，thinking / execution / archive 视图统一基于规范节点类型生成。
- 前端导入链路已改成单一路径 skill-backed import，移除了旧 preset / route / template slot 的主要展示，导入对话框与 job/store 流程不再依赖本地结构化导入分支。
- 已更新并通过相关测试，覆盖 runner、bridge、layering、job、store、dialog、client 等核心改动面。

## 问题原因
- 现有文本导入仍混用旧模板化语义、双路径导入模式与旧 UI，且当前 Codex runner 以临时目录作为工作根，无法稳定发现 repo skill。

## 尝试的解决办法
1. 创建任务记录并锁定实现范围。
2. 新建 `.agents/skills/document-to-logic-map`，编写 skill 说明、schema、规则与样例。
3. 重构 `server/codex-runner.ts`，显式注入 `--cd <repoRoot>` 与 `skills.config`。
4. 重构 `server/codex-bridge.ts`，将导入 prompt 改为薄封装 skill 输入，并新增 skill 输出到 `TextImportResponse` 的归一化层。
5. 调整共享语义层与前端导入 UI，去掉旧 preset/template route 展示，保留文档类型覆盖和 skill 导入进度。
6. 收敛 `text-import-job.ts` 的公开入口到统一 `codex_import` 路径，并修正对应测试与 UI 语义合并进度展示。
7. 运行并修复针对性测试，确认 runner / bridge / layering / job / store / dialog / client 行为与新协议一致。

## 是否成功解决
- 状态：成功
- 说明：本轮计划中的 repo skill、后端调用、导入适配、前端单一路径切换和相关测试已完成并通过验证。

## 相关文件
- `Work_Progress/2026-04-09/204046_document-to-logic-map-skill.md`
- `.agents/skills/document-to-logic-map/SKILL.md`
- `.agents/skills/document-to-logic-map/references/input.schema.json`
- `.agents/skills/document-to-logic-map/references/output.schema.json`
- `.agents/skills/document-to-logic-map/references/task-rules.md`
- `.agents/skills/document-to-logic-map/references/examples/analysis-expected.json`
- `.agents/skills/document-to-logic-map/references/examples/process-expected.json`
- `server/codex-runner.ts`
- `server/codex-runner.test.ts`
- `server/codex-bridge.ts`
- `server/codex-bridge.test.ts`
- `shared/ai-contract.ts`
- `shared/text-import-layering.ts`
- `src/features/import/text-import-job.ts`
- `src/features/import/text-import-job.test.ts`
- `src/features/import/text-import-store.ts`
- `src/features/import/text-import-store.test.ts`
- `src/features/import/components/TextImportDialog.tsx`
- `src/features/import/components/TextImportDialog.test.tsx`
- `src/features/import/text-import-preview-edit.ts`
- `src/features/import/knowledge-import.ts`

## 遗留问题/下一步
- 旧的本地结构化导入核心与 worker 文件仍保留在仓库中，当前已不走公开导入主链路；后续可单独做一次清理，删除完全失活的 legacy 代码与类型。
- 若后续要扩展 `semantic_role` 为比 `type` 更细的语义层，需要升级 `document-to-logic-map` schema 版本，而不是在 v1 内继续塞兼容字段。
