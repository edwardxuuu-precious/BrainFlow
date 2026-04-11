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
4. `references/examples/*.json` 只作为结构锚点，不要照抄标题、id、措辞或 `source_spans`。
5. 严格按以下阶段执行，**不得从 source text 直接一步投到 visible tree**：
   - Document Understanding Layer
   - Sparse Semantic Card Distillation
   - Mixed-Semantics Split Rule
   - Anchor Rule 与 Local Judgment Unit
   - Promotion Thresholds
   - Visible-Tree Emission Rule
   - Double Track
   - Distillation Quality Gate
6. 在进入 visible-tree emission 之前，必须先形成内部的 `semantic card inventory`；它是必经协议层，不是新的输出字段。
7. 任一阶段发现 role 支撑不足、局部锚点不成立或发射结果只会得到壳节点时，优先回退到更弱角色或省略 unsupported output；不要用 placeholder、fallback note 或更长 summary 糊过去。
8. `semantic cards` 仅用于内部蒸馏与发射决策。最终输出仍然只遵守 `document-to-logic-map/v2` schema。

## Core Objective

主图不是 source outline，不是标题树，也不是普通资料脑图。

主图必须是：

1. 围绕核心问题展开的判断树。
2. 以“判断模块”而不是“原文标题”组织主体。
3. 由 semantic-card distillation 投影成 visible tree，而不是由原文段落、原文标题或 wrapper heading 直接投影。
4. 同时支持逻辑主图与 execution view 的双轨任务镜像。

对 conversation export、notes、analysis 文档：

1. 根节点可以在 `note` 中轻量保留原始提问背景。
2. 可见主图主体必须只保留核心问题与判断模块。
3. `用户`、`助手`、`对话记录`、`说明`、`备注`、`Markdown 记录` 只能留在 archive/provenance handling，不得进入可见主干。

## Required Behavior

1. 将源文档分类为且仅为 `analysis`、`process`、`plan`、`notes` 之一。
2. 选择信息密度最高的核心问题、主判断或 main job-to-be-done 作为可见根节点，不默认使用文件标题。
3. 一级分支必须是回答核心问题所必经的独立 judgment modules，而不是 source headings。
4. 一级分支标题优先使用判断性短语，不默认使用中性主题词、问题句或顶层 task。
5. 一级分支优先按 prerequisite / causal dependency 排序；原文顺序只作弱参考。
6. visible tree 的固定 group vocabulary 继续使用：
   - `核心判断`
   - `判断依据`
   - `潜在动作`
7. 上述 group 是条件化发射的可见结构语法，不是自动补齐清单。只有当对应 role 被 source-backed concrete cards 支持时才显示；不支持时直接省略。
8. `semantic_role` 在 v2 中继续等于 `type`；结构语法主要由 `structure_role` 表达。
9. `structure_role` 至少使用这些值：
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
10. 输出节点保持 flat `nodes` 数组，不输出递归 `children`。
11. visible tree 必须是 fail-closed 的：宁可稀疏也不要完整假象；宁可省略 unsupported group，也不要保留壳节点模块。
12. 任一 judgment module 若最终只剩 group 标签、group note 或泛化 summary，而没有 source-backed concrete descendants，视为失败结果，不得作为合格输出。
13. `semantic cards` 不是 schema 字段，不得写入最终 JSON；它们只作为内部发射协议存在。

## Document Understanding Layer

1. 先理解文档在说什么，再决定树怎么长；不要从 source text 直接一步生成 visible tree。
2. 在此阶段先识别：
   - 文档的核心问题、主判断或 main job-to-be-done
   - 候选 judgment modules
   - source wrappers / archive parts / provenance-only parts
   - role-bearing spans：哪些段落在提供 judgment、evidence、validation、criteria、action intent、task output
   - mixed-role spans：哪些 source spans 同时承担多种语义角色
3. 区分“语义主干”与“记录性外壳”：
   - `说明`、`对话记录`、`备注`、wrapper headings 不是 visible root 的自动候选
   - archive / provenance 内容只在追溯层保留，不得反向驱动 visible root 或一级模块
4. 根节点应来自最高信息密度的语义单元，例如 core question、thesis、main decision，而不是文件名或包裹标题。
5. judgment modules 必须回答核心问题；不要因为原文有并列标题就直接把标题抬成一级结构。
6. 在进入下一阶段前，至少要确认 root anchor、module boundaries、wrapper boundaries 与 role-bearing spans；若这四项未确认，不得开始 visible-tree emission。

## Sparse Semantic Card Distillation

1. 在构造 visible tree 之前，先把源文蒸馏成稀疏、source-backed 的 `semantic card inventory`。
2. 每张 card 只承载一个主导 role；不要让一张 card 同时混装 judgment、依据、动作、验证方法和验收标准。
3. 每张 card 都必须绑定最小充分的 `source_spans`，保持可追溯。
4. 至少区分这些内部 role：
   - `core_question`
   - `judgment_module`
   - `hypothesis` 或 `judgment`
   - `evidence`
   - `validation_method`
   - `pass_criteria`
   - `action_intent`
   - `task_output`
5. 这些 role 只用于内部蒸馏与发射决策，不是新的输出 schema 字段。
6. 只提取 source 真正支持的 roles，不要为了让树更完整而补齐缺失角色。
7. 如果一个 role 在 source 中没有足够支撑，就保持更弱角色或直接省略，不要升级。
8. 优先保留稀疏而具体的 cards，不要保留宽泛但失真的 summary cards。

### Semantic Card Contract

每张 `semantic card` 至少要回答以下问题：

1. 这张 card 的主导 `role` 是什么。
2. 它由哪些最小充分的 `source_spans` 支持。
3. 它属于哪个 `judgment_module`。
4. 它是否绑定某个 local judgment anchor；若没有，必须显式保持 `null`，而不是偷用 summary 代替。
5. 它当前是否达到 promotion threshold；若未达到，应保留成什么更弱角色。
6. 它最终应发向哪个 visible branch：
   - root context
   - judgment module
   - `核心判断`
   - `判断依据`
   - `潜在动作`
   - execution mirror

## Mixed-Semantics Split Rule

1. 如果一个 source span 同时包含 judgment、evidence、validation、pass criteria、action intent 或 task output，默认拆成多张 cards。
2. mixed-role span 的拆分优先级高于“减少节点数量”；不要为了少几个节点，把多种语义压回一段 note 或一个 summary child。
3. 即使多个 role 共用同一个 `source_spans`，也必须拆成多张 cards；共享 span 合法，混装 role 不合法。
4. 不要把 `judgment + evidence + action` 压成一个 summary child。
5. 不要把 `validation_method` 与 `pass_criteria` 混写成一句模糊总结；能拆就拆。
6. 只有当两个片段承担同一 role 且缺少明确边界时，才允许保留在同一张 card。
7. 如果 source 已经支持多个可拆角色，summary card 不能替代这些具体 cards。

## Anchor Rule

1. 如果 source 中存在明确 judgment，就用该 judgment 作为局部锚点，先形成 `local judgment unit`，再组织后续结构。
2. 在同一 local judgment unit 下：
   - `evidence`、`validation_method`、`pass_criteria` 进入 local basis 路径
   - `action_intent`、`task_output` 进入 local action 路径
3. 如果一个判断模块里存在多个明确 judgments，就拆成多个具体 `core_judgment` 子节点；必要时拆成多个 modules，不要用一句 summary 覆盖多条判断。
4. 如果 source 没有明确 judgment，不要发明 hypothesis anchor。
5. 没有显式 judgment 时，可以只保留 evidence cards 和/或 action-intent cards；visible tree 不需要为了对称性硬造 `核心判断`。

### Local Judgment Unit

1. local judgment unit 是 card inventory 的本地绑定单元，不是新的输出 schema。
2. validation method 与 pass criteria 只要真正被 source 支持，就必须挂回同一个 local judgment unit 的 `判断依据` 路径，而不是漂成跨模块摘要。
3. action intent 与 task output 只要真正被 source 支持，就必须挂回同一个 local judgment unit 的 `潜在动作` 路径，而不是写成模块级提醒语。

## Promotion Thresholds

1. 只有当 source 包含可支持、可反驳或可验证的明确判断时，才提升为 `hypothesis` 或 `judgment`。
2. 如果文本只是背景、主题、提醒、担忧或方向感，就保持为背景、主题或问题语义，不要提升为 `hypothesis`。
3. 只有当 source 给出具体 test、compare、interview、inspect、score、verify 方法时，才提升为 `validation_method`。
4. 如果文本只是“需要验证一下”“最好看看”“后面再确认”，就保留为较弱的 evidence hint 或 action intent，不要提升为 `validation_method`。
5. 只有当 source 给出明确 threshold、success condition、acceptance condition 或 convergence standard 时，才提升为 `pass_criteria`。
6. 如果文本只是“做到更好”“尽量明确”“形成判断”，就保留为较弱的 judgment context 或 validation context，不要提升为 `pass_criteria`。
7. 只有当 `action_intent` 已经具体到能支撑 identifiable execution output 时，才提升为 task。
8. 如果动作存在但输出仍不可信，就保留为较弱的 `action_intent`，并在 visible tree 中发为非 task 的 `action_item`。
9. `task_output` 是内部 role，用来判断任务是否足够落地；它最终映射到 `task.output`，不是新的节点 schema。
10. 遇到边界不清时，宁可保留较弱角色，也不要为了完整性升级。

## Visible-Tree Emission Rule

1. visible tree 必须在 card inventory 完成局部角色解析之后再生成；不要跳过蒸馏层。
2. 一级可见分支仍然是 judgment modules，而不是 source headings。
3. 模块内部继续使用固定可见 group labels：`核心判断`、`判断依据`、`潜在动作`。
4. 发射顺序必须服从 card inventory，而不是服从原文段落顺序或标题顺序。

### Emission Preconditions

1. 只有在 card 已经完成 module binding、local anchor binding、promotion decision 与 emission target 决议后，才允许发射 visible nodes。
2. `核心判断` 只有在存在 concrete `hypothesis` / `judgment` cards 时才发射。
3. `判断依据` 只有在存在 concrete `evidence`、`validation_method`、`pass_criteria`、criteria、checks、interview questions、observations、conditions 等 basis cards 时才发射。
4. `潜在动作` 只有在存在 concrete `action_intent`、`task_output`、task 或非 task action cards 时才发射。
5. 不支持的 group 直接省略；不要为了结构对称而保留壳组。

### Emission Targets

1. `核心判断` 下面优先挂具体 `claim` / `decision` / `core_judgment` descendants。
2. `判断依据` 下面优先挂具体 `basis_item` descendants；其中可以承载 evidence、validation_method、pass_criteria 等内部 cards 映射出的可见节点。
3. `潜在动作` 下面优先挂具体 `task` 或非 task 的 `action_item` descendants；其中 `task_output` 最终进入 `task.output`。
4. 如果 source 已经提供 basis items、checklists、访谈题、观察点、标准、证据条目、评分维度、筛选表字段、权重或具体动作，就必须下沉发射，不得停留在 group-level summary。
5. 如果一个模块只支持 evidence 和 action-intent，不要为了形式完整制造 `核心判断`。
6. 如果一个模块只支持 judgment 和 evidence，不要为了形式完整制造 `潜在动作`。
7. “有则生成，无则不显示”是协议行为，不是渲染偏好。

### Group Note Limits

1. group note 不是 basis/action/core 的主载荷容器。
2. `判断依据` 与 `潜在动作` 不得只靠 group note 存在；若没有 concrete descendants，就必须省略该 group。
3. 即使能够写出可读的 fallback note，也不能把它作为保留空 group 的理由。
4. 任何 concrete descendants 一旦已被 source 支持，就必须优先发 descendants，不得被 group note 替代。

## Task Rules

1. task 提取继续采用高召回策略，但只能围绕原文已经存在的 `action_intent` 落地。
2. task 提取应从 `action_intent` cards 出发，而不是从主题联想 workflow。
3. 可以 task 化的动作类型包括：验证、整理、核查、汇总、访谈、评分、建立表格、输出结论、跑一轮验证。
4. 只有当 `action_intent` 已被 `task_output` 支撑到可形成 identifiable execution output 时，才升级为 task。
5. 如果动作明确但 deliverable 不完整，可以在不改变原意的前提下补全 `task.output`。
6. 被补全的输出必须明确标记 `task.inferred_output=true`。
7. 原文明示的输出写 `task.inferred_output=false`。
8. 如果动作意图不足以支撑可信的 execution output，就不要升级成 task；保留为非 task 的 `action_item`。
9. 不要围绕主题自由发挥，不要额外发明新的 workflow、策略包、分析框架或多阶段方案。
10. task 默认挂在所属判断模块的 `潜在动作` 之下。
11. 只有当整篇文档本身就是纯执行计划时，task 才能主导一级结构。
12. 每个逻辑 task 都必须可被 execution view 镜像；为 task 填写 `mirrored_task_id`，并保留 `source_module_id`。

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

1. `core_judgment_group`、`judgment_basis_group`、`potential_action_group` 是 grouping layers，不是默认摘要槽位。
2. 如果 distillation 后存在 concrete cards，就必须发 descendants，而不是保留空壳 group。
3. 如果某个 role 不被 source 支持，就省略对应 group；不要为了看起来完整而保留空壳。
4. 可读的 fallback note 不能成为保留空 group 的理由。
5. empty shell 不是中性结果，而是质量失败信号。
6. 壳模块同样不允许存在：一个 judgment module 不能只由 `核心判断`、`判断依据`、`潜在动作` 三个标签构成。
7. 这些规则是通用协议，不要按 GTM 标题、固定措辞或文档名做特殊判断。

## Distillation Quality Gate

1. 在输出最终 JSON 前，自检结果是否真的来自 semantic-role distillation，而不是 source outline projection。
2. 如果超过 30% 的 visible module children 仍是 empty shells，视为失败，必须继续修正或直接省略 unsupported groups。
3. 如果 visible root 由 wrapper heading、archive branch、文件标题或记录性外壳驱动，视为失败。
4. 质量门未通过时，优先修正 document understanding、card distillation、anchor 绑定与 emission；不要用补充 note 或 placeholder 节点糊过去。

### Module Validity Gate

对每个 judgment module 逐一检查：

1. 若模块只剩 group 标签、group note 或泛化 summary，而没有 source-backed concrete descendants，视为失败。
2. 若 `判断依据` 只剩 generic summary，而 source 中其实有可拆的证据、标准、核查项、访谈题、观察点、评分维度或条件，视为失败。
3. 若 `潜在动作` 只剩 abstract reminder、态度语或方向提示，而 source 中其实有具体 action intent、task output 或可识别 deliverable，视为失败。
4. 若 mixed-role span 明明可拆却仍被压成 summary node 或长 note，视为失败。
5. 若 source-backed concrete descendants 已存在却没有发射出来，而是被 group note 取代，视为失败。
6. 若模块结构仍然主要镜像 source outline，而不是按语义角色重组，视为失败。

## Representative Failure Signatures

以下都是本协议必须拦截的失败签名：

1. 某个 judgment module 只包含：
   - `核心判断`
   - `判断依据`
   - `潜在动作`
   而没有任何 concrete descendants。
2. `判断依据` 只剩“需要看行为证据”“需要进一步验证”这类泛化摘要。
3. `潜在动作` 只剩“后续可以继续看”“建议再确认”这类泛化提醒。
4. source 已经给出具体 basis items、访谈题、核查项、标准、评分维度、权重、筛选表字段或行动输出，但结果没有把它们蒸馏成 descendants。
5. 输出主体仍然过于接近 source outline，而不是 semantic-role split 后的 judgment tree。

## Hard Prohibitions

1. 不要把 source outline、wrapper headings、archive branches 当成可见主图主干。
2. 不要从源文直接一步投射 visible tree；必须先经过 document understanding、semantic-card distillation、anchor binding 与 promotion decision。
3. 不要为了结构完整性而补齐不存在的 roles。
4. 不要发明 source 中没有的 hypothesis anchor。
5. 不要混用“问题句 / 主题词 / 判断短语 / 顶层 task”作为同一层一级标题。
6. 不要让 `制作筛选表`、`整理名单` 这类 task 抢占一级分支，除非整篇就是执行计划。
7. 不要把 `判断依据` 或 `潜在动作` 当成单句摘要层。
8. 不要用更长的 note 代替 basis descendants 或 task descendants。
9. 不要把原文已有的具体访谈题、核查项、判断条件、评分维度或筛选字段再压缩回一句泛化总结。
10. 不要把模糊提醒语、态度语、背景句强行 task 化。
11. 不要因为想让结果“更完整”而脱离原文自由扩写方案。
12. 不要保留“模块只有 `核心判断 / 判断依据 / 潜在动作` 三个壳子”的结果。
13. 不要保留“`判断依据` 只有泛化摘要”“`潜在动作` 只有提醒语”的结果。
14. 不要按 GTM 标题、GTM 词汇、GTM 模块名或任一样本文档的固定表达做 special-casing。

## Output Rules

1. 只返回合法 JSON。
2. `spec_version` 必须是 `document-to-logic-map/v2`。
3. `semantic cards` 是内部协议，不要把它们作为新的输出字段写进最终 JSON。
4. 内部 cards 必须映射回现有 schema 可承载的 `type`、`semantic_role`、`structure_role`、`task` 字段组合。
5. `nodes` 保持 flat，按 `parent_id` + `order` 可重建层级。
6. 每个节点都要带 `source_spans`、`confidence`、`structure_role`、`locked`、`source_module_id`、`proposed_reorder`、`proposed_reparent`。
7. 每个 task 节点都要带完整 `task` 对象；非 task 节点的 `task` 必须为 `null`。
8. title 尽量简短；basis/action 的主要信息放子节点，不放长 note。
9. 保守使用 `confidence`；只有当结构与判断都足够明确时使用 `high`。

## Multi-Source Same-Topic Merge (v2 Batch)

When multiple files are imported in one batch, do **not** assume one visible root per file.

1. Always infer `source_role` for each file:
   - `canonical_knowledge`: curated knowledge skeleton, compressed conclusions, stable long-term backbone
   - `context_record`: dialogue turns, process trace, quote/reference-heavy context logs
   - `supporting_material`: supplementary references
2. Distill semantic cards for each source first, then decide merge behavior. Do not merge raw headings, raw summaries, or file titles directly into a shared visible root.
3. The same `semantic card inventory` discipline still applies in batch mode: merge after distillation, not before.
4. Always emit merge metadata fields in output:
   - `source_role`
   - `canonical_topic_id`
   - `same_as_topic_id`
   - `merge_mode` (`create_new | merge_into_existing | archive_only`)
   - `merge_confidence`
   - `semantic_fingerprint`
5. For high-overlap same-topic imports:
   - Thinking view must keep only **one** canonical root.
   - `context_record` sources must not create a second parallel root.
6. `context_record` injection policy:
   - Inject concrete basis into `judgment_basis_group`.
   - Inject concrete task/action intent into `potential_action_group`.
   - Preserve pure provenance traces in archive/provenance layer.
   - If conflict exists, attach source-backed conflict notes under the matched module/group; do not fork a parallel root.
7. Archive/provenance must still retain all original sources so reverse trace is preserved.
