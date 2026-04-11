---
name: document-to-logic-map
description: Transform arbitrary documents into a judgment-tree plus execution-mirror import protocol for BrainFlow. Use when Codex needs to convert conversation exports, Markdown files, notes, analysis docs, plans, or process docs into a core-question-centered judgment tree with fixed module syntax, basis grandchildren, source-grounded task mirrors, and source spans.
---

# Document To Logic Map

将单个源文档转换为 BrainFlow 的 `document-to-logic-map/v2` 导入 JSON。

## Workflow

1. 先读 `references/input.schema.json`，确认输入字段与 `spec_version`。
2. 再读 `references/output.schema.json`，输出前严格对齐字段。
3. 判断 task、依据与动作时，读 `references/task-rules.md`。
4. `references/examples/*.json` 只作为结构锚点，不要照抄标题、id 或 source spans。

## Core Objective

主图不是 source outline，不是标题树，也不是普通资料脑图。

主图必须是：

1. 围绕核心问题展开的判断树。
2. 以“判断模块”而不是“原文标题”组织主体。
3. 同时支持逻辑主图与 execution view 的双轨任务镜像。

对 conversation export、notes、analysis 文档：

1. 根节点可以在 `note` 里轻量保留原始提问背景。
2. 可见主图主体必须只保留核心问题与判断模块。
3. `用户`、`助手`、`对话记录`、`说明`、`备注`、`Markdown 记录` 只能留在 archive handling，不得进入可见主干。

## Required Behavior

1. 将源文档分类为且仅为 `analysis`、`process`、`plan`、`notes` 之一。
2. 选择信息密度最高的核心问题/主判断作为可见根节点，不默认使用文件标题。
3. 一级分支必须是回答核心问题所必经的独立判断模块。
4. 一级分支标题优先使用判断性短语，不默认使用中性主题词、问题句或顶层 task。
5. 一级分支优先按 prerequisite / causal dependency 排序；原文顺序只作弱参考。
6. 每个一级判断模块默认必须采用固定骨架：
   - 判断模块节点
   - `核心判断`
   - `判断依据`
   - `潜在动作`
7. `核心判断`、`判断依据`、`潜在动作` 是分组层，不是主要信息承载层。主要信息必须优先出现在它们的子节点里。
8. `核心判断` 下面应挂具体 claim / decision 节点。
9. `判断依据` 下面应优先挂具体 `basis_item` 孙节点，而不是只留一句概括 note。
10. 只要原文里存在具体标准、核查项、访谈问题、观察点、判断条件、证据条目，就必须拆成多个 basis item。
11. basis item 应可检查、可访谈、可复核；同类 basis item 保持同层，不要混进动作或结论。
12. `潜在动作` 下面应优先挂具体 `task` 或 `action_item` 孙节点，不要只保留动作提示语。
13. 只有当动作意图还不足以落成 task 时，才保留为非 task 的 `action_item`。
14. 节点是否继续拆分，看语义角色是否不同，而不是看 note 是否变长。
15. 不要把判断、依据、动作混在同一个长 `note` 里；group note 只能做轻量 summary，不能替代 basis/action grandchildren。
16. `semantic_role` 在 v2 中继续等于 `type`；结构语法主要由 `structure_role` 表达。
17. `structure_role` 至少使用这些值：
    - `root_context`
    - `judgment_module`
    - `core_judgment_group`
    - `judgment_basis_group`
    - `potential_action_group`
    - `core_judgment`
    - `basis_item`
    - `action_item`
    - `execution_root`
    - `execution_task_mirror`
18. 输出节点保持 flat `nodes` 数组，不输出递归 `children`。

## Task Rules

1. task 提取采用高召回策略，但只能围绕原文已经存在的动作意图落地。
2. 可以 task 化的动作类型包括：验证、整理、核查、汇总、访谈、评分、建立表格、输出结论、跑一轮验证。
3. 不要围绕主题自由发挥，不要额外发明新的 workflow、策略包、分析框架或多阶段方案。
4. 如果动作明确但 deliverable 不完整，可以补全 `task.output`。
5. 被补全的输出必须明确标记 `task.inferred_output=true`。
6. 原文明示的输出写 `task.inferred_output=false`。
7. task 默认挂在所属判断模块的 `潜在动作` 之下。
8. 只有当整篇文档本身就是纯执行计划时，task 才能主导一级结构。
9. 每个逻辑 task 都必须可被 execution view 镜像；为 task 填写 `mirrored_task_id`，并保留 `source_module_id`。

## Double Track

1. 逻辑主图中，task 保留在所属判断模块下，保留“为什么要做”。
2. execution view 中，同一任务要以镜像形式汇总，不再复制整棵判断树。
3. execution view 只服务执行汇总，不要再挂判断节点。
4. 若需要支持人工确认与后续结构优化，请输出：
   - `locked`
   - `proposed_reorder`
   - `proposed_reparent`
   - `source_module_id`
   - `task.inferred_output`
   - `task.mirrored_task_id`

## Empty Group Guardrail

1. `core_judgment_group`, `judgment_basis_group`, and `potential_action_group` are grouping layers, but they must not degrade into empty shells.
2. If a group note or the source spans already contain concrete claim, basis, or action content, emit grandchildren instead of leaving the group empty.
3. If `judgment_basis_group` still has no concrete grandchildren after distillation, prefer omitting the empty shell over surfacing an empty visible branch.
4. If `potential_action_group` only contains abstract reminders or attitude statements, do not invent tasks. Keep it empty internally or omit it from the visible tree rather than fabricating a workflow.
5. The protocol is generic. Do not special-case GTM module titles, fixed phrases, or document names when deciding whether to emit basis/action grandchildren.

## Hard Prohibitions

1. 不要把 source outline、wrapper headings、archive branches 当成可见主图主干。
2. 不要混用“问题句 / 主题词 / 判断短语 / 顶层 task”作为同一层一级标题。
3. 不要让 `制作筛选表`、`整理名单` 这类 task 抢占一级分支，除非整篇就是执行计划。
4. 不要把 `判断依据` 或 `潜在动作` 当成单句摘要层。
5. 不要用更长的 note 代替 basis grandchildren 或 task grandchildren。
6. 不要把原文已有的具体访谈题、核查项、判断条件再压缩回一句“看行为证据”式总结。
7. 不要把模糊提醒语、态度语、背景句强行 task 化。
8. 不要因为想让结果“更完整”而脱离原文自由扩写方案。

## Output Rules

1. 只返回合法 JSON。
2. `spec_version` 必须是 `document-to-logic-map/v2`。
3. `nodes` 保持 flat，按 `parent_id` + `order` 可重建层级。
4. 每个节点都要带 `source_spans`、`confidence`、`structure_role`、`locked`、`source_module_id`、`proposed_reorder`、`proposed_reparent`。
5. 每个 task 节点都要带完整 `task` 对象；非 task 节点的 `task` 必须为 `null`。
6. title 尽量简短；basis/action 的主要信息放子节点，不放长 note。
7. 保守使用 `confidence`；只有当结构与判断都足够明确时使用 `high`。

## Multi-Source Same-Topic Merge (v2 Batch)

When multiple files are imported in one batch, do **not** assume one visible root per file.

1. Always infer `source_role` for each file:
   - `canonical_knowledge`: curated knowledge skeleton, compressed conclusions, stable long-term backbone
   - `context_record`: dialogue turns, process trace, quote/reference-heavy context logs
   - `supporting_material`: supplementary references
2. Always emit merge metadata fields in output:
   - `source_role`
   - `canonical_topic_id`
   - `same_as_topic_id`
   - `merge_mode` (`create_new | merge_into_existing | archive_only`)
   - `merge_confidence`
   - `semantic_fingerprint`
3. For high-overlap same-topic imports:
   - Thinking view must keep only **one** canonical root.
   - `context_record` sources must not create a second parallel root.
4. `context_record` injection policy:
   - Inject concrete basis into `judgment_basis_group`.
   - Inject concrete task/action intent into `potential_action_group`.
   - Preserve pure provenance traces in archive/provenance layer.
   - If conflict exists, attach source-backed conflict notes under the matched module/group; do not fork a parallel root.
5. Archive/provenance must still retain all original sources so reverse trace is preserved.
