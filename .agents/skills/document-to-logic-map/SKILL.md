---
name: document-to-logic-map
description: Transform arbitrary documents into a judgment-tree plus execution-mirror import protocol for BrainFlow. Use when Codex needs to convert conversation exports, Markdown files, notes, analysis docs, plans, or process docs into a core-question-centered judgment tree with fixed module syntax, mirrored execution tasks, structure metadata, and source spans.
---

# Document To Logic Map

将单个源文档转换为 BrainFlow 的 `document-to-logic-map/v2` 导入 JSON。

## Workflow

1. 先读 `references/input.schema.json`，确认输入字段与 `spec_version`。
2. 再读 `references/output.schema.json`，输出前严格对齐字段。
3. 判断 task、依据、动作时，读 `references/task-rules.md`。
4. 只把 `references/examples/*.json` 当行为锚点，不要照抄标题或 id。

## Core Objective

主图不是 source outline，不是标题树，也不是普通资料脑图。

主图必须是：

1. 围绕核心问题展开的判断树。
2. 以“判断模块”而不是“原文标题”组织主体。
3. 同时支持逻辑主图与 execution view 的双轨任务镜像。

对 conversation export、notes、analysis 文档：

1. 根节点可以在 `note` 中轻量保留原始问题背景。
2. 可见主图主体必须只保留核心问题与判断模块。
3. `用户`、`助手`、`对话记录`、`说明`、`备注`、`Markdown 记录` 只能留在 archive handling，不得进入可见主干。

## Required Behavior

1. 将源文档分类为且仅为 `analysis`、`process`、`plan`、`notes` 之一。
2. 选择最高信息密度的核心问题/主判断作为可见根节点，不得默认用文件标题。
3. 一级分支必须是回答核心问题所必经的独立判断模块。
4. 一级分支标题优先使用判断性短语，不默认使用中性主题词、问题句或顶层 task。
5. 一级分支必须优先按 prerequisite / causal dependency 排序；原文顺序只作弱参考。
6. 每个一级判断模块默认必须采用固定骨架：
   - 判断模块节点
   - `核心判断`
   - `判断依据`
   - `潜在动作`
7. 具体依据、证据、观察点、访谈问题、核查项必须挂在 `判断依据` 之下。
8. 具体动作与 task 必须挂在 `潜在动作` 之下。
9. 节点是否继续拆分取决于语义角色是否不同，而不是 note 是否变长。
10. 同类内容尽量同层保留；不同性质内容必须拆开。
11. 不要用一个长 `note` 压缩混合的判断、依据、动作。
12. `semantic_role` 在 v2 中继续等于 `type`；结构语法主要由 `structure_role` 表达。
13. `structure_role` 至少使用这些值：
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
14. 输出节点仍保持 flat `nodes` 数组；不要输出递归 `children`。

## Task Rules

1. task 提取采用高召回策略，只要明显帮助后续执行，就可以提为 task 候选。
2. 如果动作明确但 deliverable 不完整，可以补全 `task.output`。
3. 被补全的输出必须明确标记 `task.inferred_output=true`。
4. 不要把 AI 推断伪装成原文明示。
5. task 默认挂在所属判断模块的 `潜在动作` 下。
6. 只有当整篇文档本身就是纯执行计划时，task 才能主导一级结构。
7. 每个逻辑 task 都必须可被 execution view 镜像；为 task 填写 `mirrored_task_id`，并保留 `source_module_id`。

## Double Track

1. 逻辑主图中，task 保留在所属判断模块下，保留“为什么做”。
2. execution view 中，同一任务要以镜像形式汇总，不再复制整棵判断树。
3. execution view 只服务执行汇总，不要再挂一堆判断节点。
4. 若需要支持人工确认与后续结构优化，请输出：
   - `locked`
   - `proposed_reorder`
   - `proposed_reparent`
   - `source_module_id`
   - `task.inferred_output`
   - `task.mirrored_task_id`

## Hard Prohibitions

1. 不要把 source outline、wrapper headings、archive branches 当成可见主图主干。
2. 不要混用“问题句 / 主题词 / 判断短语 / 顶层 task”作为同一层一级标题。
3. 不要让 `制作筛选表`、`整理名单` 这类 task 抢占一级分支，除非整篇就是执行计划。
4. 不要把判断、依据、动作直接并排挂在判断模块下而缺少中间层。
5. 不要把大量异质信息塞回 `note`。
6. 不要按原文顺序机械保留主链。
7. 不要为美观把判断树重新压回资料树。

## Output Rules

1. 只返回合法 JSON。
2. `spec_version` 必须是 `document-to-logic-map/v2`。
3. `nodes` 保持 flat，按 `parent_id` + `order` 可重建层级。
4. 每个节点都要带 `source_spans`、`confidence`、`structure_role`、`locked`、`source_module_id`、`proposed_reorder`、`proposed_reparent`。
5. 每个 task 节点都要带完整 `task` 对象；非 task 节点的 `task` 必须为 `null`。
6. 保守使用 `confidence`；只在结构与判定都足够明确时使用 `high`。
