# 任务记录

## 任务名称
- 重写 `document-to-logic-map` 的 `SKILL.md` 协议，强化 document-understanding -> semantic-card distillation -> visible-tree emission 流程

## 执行时间
- 开始时间：2026-04-11 11:54:00 +08:00
- 结束时间：2026-04-11 12:08:00 +08:00

## 仓库根目录
- `C:/Users/edwar/Desktop/BrainFlow`

## 任务目标
- 仅修改 `.agents/skills/document-to-logic-map/SKILL.md`。
- 保留 v2 judgment-tree + execution-mirror framing，同时强化文档理解层、语义卡蒸馏层、混合语义拆分、anchor 规则、promotion thresholds、visible-tree emission 与质量门。

## 解决的问题
- 将现有 skill 从“主要约束最终树形”改为“先理解文档、再蒸馏语义卡、再发射 visible tree”的硬流程。
- 在 `SKILL.md` 中新增并写实了 `Document Understanding Layer`、`Sparse Semantic Card Distillation`、`Mixed-Semantics Split Rule`、`Anchor Rule`、`Promotion Thresholds`、`Visible-Tree Emission Rule`、`Distillation Quality Gate`。
- 明确把 `core_question`、`judgment_module`、`hypothesis/judgment`、`evidence`、`validation_method`、`pass_criteria`、`action_intent`、`task_output` 定义为内部语义卡角色，而不是新的输出 schema 字段。
- 将固定 group vocabulary 收紧为“固定命名 + 条件化发射”，要求 unsupported roles 直接省略，禁止 placeholder groups。
- 补强 no-direct-projection、no-fabricated-hypothesis、promotion thresholds、quality gate 与 multi-source 先蒸馏后 merge 的规则。

## 问题原因
- 旧版 `SKILL.md` 虽然已经要求 judgment tree、basis grandchildren、task grounding 与 empty-group guardrail，但没有把语义蒸馏层写成协议主线。
- 在缺少 role-sensitive distillation、mixed-role split、anchor 和 promotion thresholds 的情况下，模型仍可能用 group note + shell nodes 表面满足结构要求。
- 当前输出 schema 不支持新增语义字段，因此新增角色只能作为内部协议层，而不能直接扩展 JSON 字段。

## 尝试的解决办法
1. 重读现有 `SKILL.md`、`GTM_main.md`、example JSON、`task-rules.md` 与相关测试断言，确认当前薄弱点集中在协议前置层而不是输出格式层。
2. 仅重写 `.agents/skills/document-to-logic-map/SKILL.md`，保留 frontmatter、v2 framing、double-track 与现有有效约束。
3. 将 Workflow 改成 schema check -> document understanding -> sparse cards -> mixed-role split -> anchor/local role resolution -> visible-tree emission -> quality gate 的明确顺序。
4. 用文本级检查确认新增章节、角色列表、promotion thresholds、`有则生成，无则不显示` 与 `>30% empty shells` 质量门都已落入文件。
5. 尝试运行 `skill-creator` 的 `quick_validate.py`，但当前环境缺少 `PyYAML` 依赖，未能完成该脚本校验。

## 是否成功解决
- 状态：成功
- 说明：`SKILL.md` 已按要求重写，且仅改动了目标 skill 文件；新增协议章节、角色拆分、锚定规则、升级阈值、条件化发射与质量门均已落入文本。快速校验脚本因本机缺少 `PyYAML` 未运行成功，但文本级自检已完成。

## 相关文件
- `.agents/skills/document-to-logic-map/SKILL.md`
- `Work_Progress/2026-04-11/115400_document-to-logic-map-skill-rewrite.md`

## 遗留问题/下一步
- 如需跑 `quick_validate.py`，需要先在本机 Python 环境安装 `PyYAML`。
- 仓库内存在与本任务无关的未提交改动，本次按用户要求忽略，未做处理。
- 如需进一步验证新 skill 对 bridge prompt 或测试断言的影响，需要在单独任务中同步检查 `server/codex-bridge.ts` 与 `server/codex-bridge.test.ts`。
