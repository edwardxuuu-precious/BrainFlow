# 任务记录

## 任务名称
- 强化 `document-to-logic-map` 的 `SKILL.md` 协议，收紧 semantic-card distillation 与 visible-tree emission

## 执行时间
- 开始时间：2026-04-11 18:47:13 +08:00
- 结束时间：2026-04-11 18:50:53 +08:00

## 仓库根目录
- C:\Users\edwar\Desktop\BrainFlow

## 任务目标
- 仅修改 `.agents/skills/document-to-logic-map/SKILL.md`。
- 按既定计划强化 document understanding -> semantic-card distillation -> anchor -> emission -> quality gate 的协议顺序。
- 不修改 schema、导入代码、测试与其它无关文件。

## 解决的问题
- 将 `.agents/skills/document-to-logic-map/SKILL.md` 从“方向性要求”重写为更强的 fail-closed 协议文本。
- 明确要求 `Document Understanding -> Sparse Semantic Card Distillation -> Mixed-Semantics Split -> Anchor / Local Judgment Unit -> Promotion Thresholds -> Visible-Tree Emission -> Double Track -> Distillation Quality Gate` 的顺序执行。
- 新增并写实 `semantic card inventory` / `Semantic Card Contract`，要求每张 card 具备 role、source spans、module binding、local anchor、promotion decision 与 emission target。
- 收紧 `Group Note Limits`、`Empty Group Guardrail` 与 `Distillation Quality Gate`，明确 readable fallback note 不能成为保留空 group 的理由。
- 新增 `Module Validity Gate` 与 `Representative Failure Signatures`，显式拦截“模块只剩 `核心判断 / 判断依据 / 潜在动作` 三个壳组”等失败模式。
- 保留并强化 core-question root、judgment modules、basis descendants、action grounding、double-track、generic protocol 与 no-GTM-special-casing 等非回归约束。

## 问题原因
- 旧版 `SKILL.md` 已有正确方向，但很多约束仍停留在结果描述层，缺少发射前的内部中间层契约。
- 旧版对 `group note` 与质量门的边界不够硬，导致模型仍可能用泛化摘要或 fallback note 表面满足结构。
- 旧版质量门偏全局，不足以拦截单个 judgment module 的壳结构失败。

## 尝试的解决办法
1. 读取并对照现有 `SKILL.md`、代表源文档 `docs/test_docs/GTM_main.md`、以及此前已确认会接受空 group fallback note 的测试上下文，确定本轮只改 skill 文本，不改 schema/代码。
2. 按既定计划重写 `SKILL.md` 主体，保留 frontmatter 与章节骨架，但把关键章节改写为更严格的协议约束。
3. 新增 `Semantic Card Contract`、`Local Judgment Unit`、`Emission Preconditions`、`Emission Targets`、`Group Note Limits`、`Module Validity Gate` 与 `Representative Failure Signatures`。
4. 用文本级校验确认：阶段顺序、required semantic roles、promotion thresholds 的回退逻辑、group note 限制、逐模块失败条件与 batch merge 下的 distill-first 约束均已落入正文。

## 是否成功解决
- 状态：成功
- 说明：已按计划仅修改 `.agents/skills/document-to-logic-map/SKILL.md`，并完成文本级复核。未修改 schema、导入代码、测试或其它业务文件。

## 相关文件
- C:\Users\edwar\Desktop\BrainFlow\.agents\skills\document-to-logic-map\SKILL.md
- C:\Users\edwar\Desktop\BrainFlow\docs\test_docs\GTM_main.md
- C:\Users\edwar\Desktop\BrainFlow\server\codex-bridge.test.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\text-import-semantic-merge.test.ts
- C:\Users\edwar\Desktop\BrainFlow\Work_Progress\2026-04-11\184713_document-to-logic-map-skill-protocol-hardening.md

## 遗留问题/下一步
- 本轮只改 skill 文本；当前导入代码与测试仍接受 fallback-note 空 group，若要让 live output 与新协议完全一致，需后续单独对齐 prompt/runtime/test。
- 本轮未运行代码测试；只做了文本级校验，因为没有改动运行时代码。
