# 任务记录

## 任务名称
- 诊断 AI 返回无效 update_topic 提案的原因

## 执行时间
- 开始时间：2026-04-02 20:32:46
- 结束时间：2026-04-02 20:35:34

## 仓库根目录
- `c:\Users\edwar\Desktop\BrainFlow`

## 任务目标
- 分析当前 AI 侧栏返回“Codex 返回了无效的 update_topic 提案”的真实原因，并给出明确解释。

## 解决的问题
- 已定位当前提示“Codex 返回了无效的 update_topic 提案”的直接原因。
- 已确认报错来自本地 bridge 对结构化提案的二次校验，而不是 Codex CLI 不可用、权限失效或 repo/后台保护边界触发。

## 问题原因
- 当前 AI 只拿到用户选中的节点标题、备注、祖先链、直属子节点和选区内关系摘要；如果选中的节点本身几乎没有业务语义，模型上下文会非常稀薄。
- 当前 system prompt 要求“只基于选区上下文回答，不假设整张脑图其他内容”，因此在信息不足时模型更容易输出不稳定的提案。
- 当前 `server/codex-bridge.ts` 中的 schema 允许 `update_topic` 的 `topicId/title/note` 都为 `null`，只在后续 `normalizeOperation()` 时再拦截；因此模型可能先通过 schema，再因为缺少有效 `title`/`note` 被本地判定为无效提案。

## 尝试的解决办法
1. 检查 Codex bridge 的结构化输出约束与本地提案校验逻辑。
2. 对照当前 system prompt 和选区上下文设计，判断为什么会触发无效提案。
3. 确认 `server/codex-bridge.ts` 中 `update_topic` 的二次校验条件，以及 `src/features/ai/ai-context.ts` 的实际上下文范围。

## 是否成功解决
- 状态：成功
- 说明：已确认这是“模型返回了空/无效 update_topic 操作，被本地 bridge 拦截”的问题，原因与当前选区信息不足和 schema 约束不够细有关。

## 相关文件
- `Work_Progress/2026-04-02/203246_ai_invalid_update_topic_diagnosis.md`
- `server/codex-bridge.ts`
- `server/prompts/brainflow-system.md`
- `src/features/ai/ai-context.ts`
- `src/features/ai/ai-proposal.ts`

## 遗留问题/下一步
- 如需避免再次出现同类报错，下一步应收紧 `update_topic` 的输出 schema，并在 prompt 中明确“当用户要生成计划时优先返回 create_child/create_sibling，而不是空的 update_topic”。
