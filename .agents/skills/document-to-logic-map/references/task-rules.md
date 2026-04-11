# Task Rules

v2 中的 task 提取继续采用高召回策略，但本轮新增一条更硬的边界：
**只能把原文中已经存在的动作意图落成 task，不能围绕主题自由发挥。**

## Emit `task` when

1. 内容明显指向后续执行动作。
2. 动作属于某个判断模块的验证、整理、核查、汇总、访谈、评分、建立表格、生成结论或输出动作。
3. 原文虽然没有把 deliverable 写完整，但可以在不改变原意的前提下补全执行结果。

## High-recall action signals

- 列出
- 整理
- 收集
- 核查
- 访谈
- 验证
- 跑一轮
- 建立
- 制作
- 比较
- 评分
- 汇总
- 输出
- 生成
- 拉名单
- 补证据

## Grounding boundary

1. task 必须贴着原文已有动作意图落地。
2. 允许补全 `task.output`，但不允许额外发明新的工作流、阶段包、策略框架或分析体系。
3. 如果一句话只是提醒语、态度语、背景句或抽象建议，不要强行 task 化。
4. 如果动作意图不足以写成 task，就保留为非 task 的 `action_item`。

## Empty-group boundary

1. `potential_action_group` should not stay empty when the source already contains clear action intent plus a recoverable output hint.
2. If the source only contains abstract reminders or attitude statements, do not force them into tasks just to fill the group.
3. If a repaired action item still cannot support a trustworthy `task.output`, keep it as a non-task `action_item` or omit the empty visible group.
4. These rules are generic. Do not special-case GTM wording when deciding whether to emit repaired task children.

## Output rules

1. `task.output` 尽量写成接近执行结果的描述，而不是抽象名词。
2. 如果 output 由 AI 补全，必须写 `inferred_output=true`。
3. 如果 output 是原文明示，写 `inferred_output=false`。
4. 为每个逻辑 task 生成稳定的 `mirrored_task_id`，供 execution view 镜像。

## Prefer task placement under judgment modules

1. task 默认挂在所属判断模块下的 `潜在动作` 分组。
2. 不要把 task 抬成主图一级，除非整篇文档本身就是纯执行计划。
3. `source_module_id` 应指向该 task 所属的一级判断模块。

## Structure hygiene

1. `核心判断`、`判断依据`、`潜在动作` 是分组层，不是 note 标签。
2. `判断依据` 下面优先放具体 basis items，不要拿一句总结 note 代替。
3. `潜在动作` 下面优先放 task / action grandchildren，不要拿一句动作提示 note 代替。
4. 不要为了减少节点数而把 task 与 basis 文本重新压成长 note。
