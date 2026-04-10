# Task Rules

Only emit `task` when both conditions are true:

1. The source contains a clear action.
2. The source contains a concrete deliverable.

## Positive action signals

- 收集
- 整理
- 验证
- 生成
- 输出
- 访谈
- 比较
- 确认
- 推进
- 创建
- 更新
- 记录

## Positive deliverable signals

- 名单
- 表格
- 报告
- 记录
- 定义
- 评分结果
- 结论
- 文档
- 输出物

## Do not emit `task` for

- Principles
- Standards
- Definitions
- Background
- Conclusions
- Owner-only statements
- Timeline-only statements
- Deadlines without a concrete deliverable
- Ordered steps that only describe sequence

## Attachment rules

- Attach `evidence` and `metric` to the nearest supported `claim`.
- If a nearby `claim` does not exist in the current section, attach to the section.
- Never create a shared evidence bucket unless the source explicitly names one.

## Title rules

- Keep titles short and scannable.
- Move explanatory detail, quotations, and evidence text into `note`.
- Avoid sentence-length titles when a 3-12 word label is sufficient.
