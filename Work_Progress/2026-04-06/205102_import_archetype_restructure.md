# 任务记录

## 任务名称
- 导入内容原型化重组方案实现

## 执行时间
- 开始时间：2026-04-06 20:51:02
- 结束时间：2026-04-06 21:22:30

## 仓库根目录
- `C:\Users\edwar\Desktop\BrainFlow`

## 任务目标
- 将文本导入流程从“结构抽取”升级为“内容原型识别 -> 信息归槽 -> 树形重组”。
- 为导入请求、预览结果、Codex bridge、前端预览 UI 和本地 deterministic planner 引入 archetype、classification、template slot。
- 支持用户在导入弹窗中覆盖 archetype，并基于已缓存文本即时重跑预览。

## 解决的问题
- 新增 `TextImportArchetype`、`TextImportTemplateSlot`、`TextImportSemanticUnit`、`TextImportClassification`、`TextImportTemplateSummary` 等共享契约。
- 本地导入链路新增 `semanticUnits -> templatePlan -> nodePlans`，不再直接从 `semanticHints` 平铺出树。
- 支持 8 类 archetype：`method / argument / plan / report / meeting / postmortem / knowledge / mixed`。
- 每个 archetype 都有固定 slot 模板，并带有“关键槽位永远显式、其他槽位按数量决定显式/折叠”的编排规则。
- 为 evidence/data/example 增加“优先挂到最近 claim / step / decision / summary” 的确定性归属规则。
- 单文件与 batch 预览结果都补齐了 `classification` 与 `templateSummary`，batch 每个文件摘要也带各自 archetype。
- 导入弹窗增加 archetype 选择器，支持自动识别和手动覆盖；覆盖后会基于缓存文本重跑预览。
- 预览树节点增加 `templateSlot` 保留与展示，编辑预览和最终 apply 时不会丢失。
- Codex bridge 的请求上下文、返回 schema、normalize 逻辑都补上了 `archetype / archetypeMode / classification / templateSummary / templateSlot`。

## 问题原因
- 之前的导入质量主要受限于 `contentProfile + semanticHints + nodePlans` 这条简化链路，缺少“内容到底在讲什么”的中间判型层。
- 本地 pipeline 更像“按原文结构搬运”，Codex pipeline 更像“一次性生成合法 JSON”，两边都没有稳定的 archetype/slot 模板约束。
- 预览编辑、batch 合成、bridge normalize 等后续链路也没有保存语义模板信息，导致即使前面分类做对，后面也会丢失。

## 尝试的解决办法
1. 扩展共享类型，补齐 archetype、semantic unit、classification、template summary、template slot。
2. 重写 `shared/text-import-semantics.ts`，引入 archetype scorer、semantic unit 推断、slot 归类、evidence 挂载、template-driven node plan 编排。
3. 调整 `local-text-import-core.ts`，让单文件和 batch 都输出 `classification`、`templateSummary` 与 slot-aware `previewNodes`。
4. 调整 `text-import-store.ts`，缓存当前导入文本，支持 archetype override 后即时重跑单文件或 batch 预览。
5. 调整 `TextImportDialog.tsx` 与 `MapEditorPage.tsx`，把 archetype 选择器、识别结果、template slot 展示接入 UI。
6. 调整 `text-import-apply.ts`、`text-import-preview-edit.ts`、`text-import-batch-compose.ts`，确保 template slot 在编辑、合成、应用中完整透传。
7. 调整 `server/app.ts` 与 `server/codex-bridge.ts`，补齐请求校验、prompt context、schema 和 normalize。
8. 更新导入相关测试 fixture，并补充 archetype override 与 archetype/template-slot 规划测试。

## 是否成功解决
- 状态：成功
- 说明：
  - 核心 archetype 化导入链路已落地，local 与 Codex 两条 pipeline 已共享新的 archetype/template-slot 契约。
  - 前端可见并可切换 archetype，切换后会重跑预览。
  - 编译和导入相关测试均通过。

## 相关文件
- `shared/ai-contract.ts`
- `shared/text-import-semantics.ts`
- `src/features/import/local-text-import-core.ts`
- `src/features/import/text-import-store.ts`
- `src/features/import/components/TextImportDialog.tsx`
- `src/features/import/text-import-apply.ts`
- `src/features/import/text-import-preview-edit.ts`
- `src/features/import/text-import-batch-compose.ts`
- `src/features/import/text-import-job.ts`
- `src/pages/editor/MapEditorPage.tsx`
- `server/app.ts`
- `server/codex-bridge.ts`
- `src/features/import/local-text-import-core.test.ts`
- `src/features/import/components/TextImportDialog.test.tsx`
- `src/features/import/text-import-apply.test.ts`
- `src/features/import/text-import-job.test.ts`
- `src/features/import/text-import-store.test.ts`
- `server/app.test.ts`

## 遗留问题/下一步
- 当前低置信 archetype 主要通过“置信度暴露 + Codex pipeline 对齐新上下文”来处理，还没有独立拆出单独的 AI archetype adjudication 子流程。
- 当前 slot 归类与 evidence 挂载以本地规则为主，后续可以继续加“复杂归槽/短标题重写”的定点 AI 裁决。
- batch 顶层目前仍然是保守 mixed 容器，只做每文件独立 archetype；跨文件相似主题/行动项建议仍可继续增强。
- 可继续补充更多 archetype 样本文本和质量门槛测试，尤其是 `argument / postmortem / knowledge` 的中文长文样本。
