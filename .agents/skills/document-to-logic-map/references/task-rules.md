# Task Rules

v2 中的 task 提取改为高召回策略。

## Emit `task` when

1. 内容明显指向后续执行动作。
2. 动作属于某个判断模块的推进手段、验证动作、产物整理、外部访谈、核查或汇总。
3. 即使原文没有把 deliverable 说完整，只要可合理补全执行结果，也可以输出 task。

## High-recall action signals

- 收集
- 整理
- 访谈
- 验证
- 生成
- 输出
- 建立
- 制作
- 比较
- 跑一轮
- 评分
- 汇总
- 拉名单
- 补证据

## Output rules

1. `task.output` 尽量写成接近执行结果的描述，而不是抽象名词。
2. 如果 output 由 AI 补全，必须写 `inferred_output=true`。
3. 如果 output 是原文明示，写 `inferred_output=false`。
4. 为每个逻辑 task 生成稳定的 `mirrored_task_id`，供 execution view 镜像。

## Prefer task placement under judgment modules

1. task 默认挂在所属判断模块下的 `潜在动作` 分组。
2. 不要把 task 抬成主图一级，除非整篇文档本身就是纯执行计划。
3. `source_module_id` 应指向该 task 所属的一级判断模块。

## Do not emit `task` for

- 纯背景描述
- 单纯定义
- 单纯结论
- 只有时间点、没有执行意义的提醒
- 不能帮助后续推进的态度表达

## Structure hygiene

1. `核心判断`、`判断依据`、`潜在动作` 是结构分层，不是 note 标签。
2. 不要把判断、依据、动作混在一个节点里。
3. 不要为了减少节点数而把 task 和依据文本压成一个长 note。
