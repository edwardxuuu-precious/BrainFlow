# 任务记录

## 任务名称
- AI 会话管理、流式运行反馈、节点锁定与提案稳健化改造

## 执行时间
- 开始时间：2026-04-03 07:47:05
- 结束时间：2026-04-03 08:27:55

## 仓库根目录
- C:\Users\edwar\Desktop\BrainFlow

## 任务目标
- 为 AI 侧边栏增加多会话管理、可见运行状态与流式输出、节点 AI 锁定能力，并修复提案引用新建节点时的稳健性问题。

## 解决的问题
- AI 侧边栏从单会话改成了本地持久化多会话，支持新建、切换、归档、永久删除，并在 AI 设置弹层中恢复归档会话。
- AI 对话过程补齐了显式运行阶段与流式状态，前端可以看到“检查状态/整理上下文/调用 Codex/等待输出/流式输出/应用改动”等阶段，而不是只有发送按钮置灰。
- 脑图节点新增了 `aiLocked` 持久化字段与人工锁定入口，AI 可读锁定节点但不可修改、移动、删除锁定节点；命中锁定冲突时改成部分应用并输出跳过原因。
- AI 提案执行器改成“顺序执行 + 临时引用 + 宽松 wire schema + 本地语义校验”，解决了一轮提案内先创建父节点再引用子节点时的 `tmp_gtm_pricing` 这类不存在父节点错误。
- 更新了 server/client/store/test/e2e 契约，保证新 session、stream、lock、temp ref 语义在本地持久化、构建和回归测试中全部打通。

## 问题原因
- 原实现只有单一默认会话，且聊天记录结构仍依赖旧 `conversationId`，无法支持真实多 session 生命周期管理。
- AI 运行反馈只靠按钮禁用态表达，bridge 在等待 Codex 返回结果前没有连续状态事件，导致用户体感上像“卡住”。
- 提案模型只能稳定引用已有真实节点 id，无法在同一轮提案中安全引用刚创建的新节点，因此会在生成分层结构时触发父节点不存在错误。
- 节点数据结构中没有 AI 锁定字段，也没有 Inspector/层级树/节点上的锁定 UI，导致 AI 与人工操作之间缺少写保护边界。
- 旧测试与旧接口仍然假设 `default conversationId`、旧提案字段和旧流式事件格式，导致迁移后大量假失败。

## 尝试的解决办法
1. 重写 `shared/ai-contract.ts`，引入 `sessionId`、`AiSessionSummary`、`AiRunStage`、`status` 流事件、`topic:/ref:` 目标引用、`resultRef`、`AiApplySummary` 与跳过操作摘要。
2. 重写 `src/features/ai/ai-storage.ts`，把 AI 聊天改成按 `documentId + sessionId` 存储，并补齐归档/恢复/删除/列举会话能力，同时兼容旧记录的 `conversationId`。
3. 扩展 `src/features/ai/ai-store.ts`，加入多会话切换、归档列表、运行阶段状态、最近一次应用摘要和最近一次执行失败状态；发送消息时改成基于整图上下文直接落图。
4. 重写 `src/features/ai/ai-proposal.ts`，加入顺序执行器、`tempRef -> realTopicId` 映射、锁定节点部分应用规则，以及“全无合法操作才整轮失败”的策略。
5. 重写 `server/codex-bridge.ts`，把 Codex CLI 输出 schema 改成宽松 wire schema，并通过 bridge 做二次语义归一化；同时增加对 `tmp_/temp_/ref_` 临时引用的容错映射。
6. 在 `src/features/documents/types.ts`、`document-factory.ts`、`document-service.ts`、`layout.ts`、`tree-operations.ts` 中接入 `aiLocked` 持久化字段，并在 `PropertiesPanel`、`HierarchySidebar`、`TopicNode` 中补齐锁定交互与徽标。
7. 重写 `AiSidebar`、`AiMessageList`、`AiComposer`、`AiSettingsDialog`，加入会话选择/新建/归档/删除、运行阶段提示、设置页恢复归档聊天等 UI。
8. 补齐和修正 `server/app.test.ts`、`server/codex-bridge.test.ts`、`src/features/ai/ai-store.test.ts`、`src/features/ai/ai-proposal.test.ts`、`src/features/ai/components/AiSidebar.test.tsx`、`src/features/editor/components/PropertiesPanel.test.tsx`、`src/features/editor/tree-operations.test.ts`、`src/test/e2e/brainflow.spec.ts` 等回归测试。
9. 执行验证：`pnpm test -- --run`、`pnpm build`、`pnpm lint`、`pnpm test:e2e`，全部通过。

## 是否成功解决
- 状态：成功
- 说明：会话管理、流式运行反馈、节点 AI 锁定与提案稳健化已经全部落地，构建、单测、Lint 与 E2E 均已通过。

## 相关文件
- shared/ai-contract.ts
- server/app.ts
- server/app.test.ts
- server/codex-bridge.ts
- server/codex-bridge.test.ts
- src/features/ai/ai-storage.ts
- src/features/ai/ai-store.ts
- src/features/ai/ai-store.test.ts
- src/features/ai/ai-proposal.ts
- src/features/ai/ai-proposal.test.ts
- src/features/ai/components/AiSidebar.tsx
- src/features/ai/components/AiSidebar.test.tsx
- src/features/ai/components/AiSettingsDialog.tsx
- src/features/ai/components/AiMessageList.tsx
- src/features/ai/components/AiComposer.tsx
- src/features/documents/types.ts
- src/features/documents/document-factory.ts
- src/features/documents/document-service.ts
- src/features/editor/tree-operations.ts
- src/features/editor/tree-operations.test.ts
- src/features/editor/layout.ts
- src/features/editor/components/PropertiesPanel.tsx
- src/features/editor/components/PropertiesPanel.test.tsx
- src/features/editor/components/HierarchySidebar.tsx
- src/components/topic-node/TopicNode.tsx
- src/pages/editor/MapEditorPage.tsx
- src/test/e2e/brainflow.spec.ts

## 遗留问题/下一步
- 当前流式输出仍然是“bridge 先返回完整结果，再由前端分块展示 assistantMessage”，还不是真正从 Codex CLI 逐 token 转发；如果后续要更细的实时输出，需要在 bridge 层改成真实增量流转发。
- AI 锁定目前是“AI 写保护”，不会阻止人工直接编辑；如果后续要做更严格的人工锁定规则，需要再细分人工锁和 AI 锁两套语义。
