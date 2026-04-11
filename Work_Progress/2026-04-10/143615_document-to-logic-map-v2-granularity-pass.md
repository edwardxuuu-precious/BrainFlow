# 任务记录

## 任务名称
- document-to-logic-map/v2 下一轮精修：Basis 下沉 + Action Task 化

## 执行时间
- 开始时间：2026-04-10 14:36:15 +08:00
- 结束时间：2026-04-10 14:59:57 +08:00

## 仓库根目录
- `C:/Users/edwar/Desktop/BrainFlow`

## 任务目标
- 在当前 v2 顶层主干不大改的前提下，提升模块内部颗粒度。
- 让 `判断依据` 主要承载具体 `basis_item` 孙节点，让 `潜在动作` 主要承载贴着原文动作意图的 `task` / `action_item` 孙节点。
- 同步更新 skill、task-rules、bridge prompt、examples、GTM expected fixture 与测试期望。

## 解决的问题
- 重写 `SKILL.md` 与 `task-rules.md`，把“group 只是分组层”“basis/action 必须优先下沉成孙节点”“task 只能贴着原文动作意图落地”的规则写死。
- 更新 bridge prompt，新增 basis grandchildren、source-grounded taskization、禁止自由扩写 workflow 的约束。
- 重写 examples，使样例明确展示一个模块下多个 `basis_item` 与多个 `task` 孙节点。
- 基于 `GTM_main.md` 重新生成并增厚 repo-tracked expected fixture，重点补齐痛感、购买成熟度、触达效率、案例扩散、四维评分、discovery 的 basis/action grandchildren。
- 更新 `server/codex-bridge.test.ts` 与 `shared/text-import-layering.test.ts`，验证 thinking view 保留 grandchildren，execution view 仍只镜像任务。

## 问题原因
- 当前 v2 顶层判断树方向已经正确，但 prompt 和样例对“必须下沉成可检查 basis items 与可执行 task items”的约束还不够硬。
- GTM fixture 里多个模块仍停留在单个 basis summary 或动作提示，导致结果更像骨架正确的摘要图，而不是可下钻、可执行、可复核的判断树。

## 尝试的解决办法
1. 重写 `.agents/skills/document-to-logic-map/SKILL.md` 与 `references/task-rules.md`。
2. 更新 `server/codex-bridge.ts` prompt 文案，并在 `server/codex-bridge.test.ts` 中加入对应断言。
3. 重写 `references/examples/analysis-expected.json` 与 `references/examples/process-expected.json`。
4. 增量补丁改造 `docs/test_docs/GTM_main.document-to-logic-map.v2.json`，保持顶层主干不变，只扩展模块内部 grandchildren。
5. 更新 `shared/text-import-layering.test.ts` 的 v2 投影断言，确认 `判断依据` 与 `潜在动作` 下的孙节点可见。
6. 执行 `npm test -- shared/text-import-layering.test.ts server/codex-bridge.test.ts`。
7. 执行 `npm test -- src/features/import/local-text-import-core.test.ts src/features/import/knowledge-import.test.ts shared/text-import-semantics.test.ts`。
8. 执行 `npx tsc -p tsconfig.json --noEmit`、JSON 解析检查与 `git diff --check`。

## 是否成功解决
- 状态：成功
- 说明：本轮已完成结构颗粒度提升，skill、examples、bridge prompt、GTM fixture 与相关测试都已更新，定向测试和类型检查均通过。

## 相关文件
- `Work_Progress/2026-04-10/143615_document-to-logic-map-v2-granularity-pass.md`
- `.agents/skills/document-to-logic-map/SKILL.md`
- `.agents/skills/document-to-logic-map/references/task-rules.md`
- `.agents/skills/document-to-logic-map/references/examples/analysis-expected.json`
- `.agents/skills/document-to-logic-map/references/examples/process-expected.json`
- `docs/test_docs/GTM_main.document-to-logic-map.v2.json`
- `server/codex-bridge.ts`
- `server/codex-bridge.test.ts`
- `shared/text-import-layering.test.ts`

## 遗留问题/下一步
- projection/layering 代码本体本轮未改，因为现有实现已经能保留 grandchildren；本轮只收紧规则、fixture 与测试期望。
- 仓库中存在与本任务无关的 UI 改动：`.gitignore`、`src/components/topic-node/*`、`src/features/editor/*`，本次未处理。
