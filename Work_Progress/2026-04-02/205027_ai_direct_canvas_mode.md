# 任务记录

## 任务名称
- AI 改为自然语言直达画布模式

## 执行时间
- 开始时间：2026-04-02 20:50:27
- 结束时间：2026-04-02 21:45:12

## 仓库根目录
- c:\Users\edwar\Desktop\BrainFlow

## 任务目标
- 将当前 AI 从受限提案审批流改成“整图理解 + 选区聚焦 + 直接落图”的工作模式。
- 保留本机 Codex CLI bridge 的安全边界，禁止 AI 访问 repo、后台、文件系统和数据库。
- 将 system prompt 改成应用内可编辑的全局设置，并持久化到用户本地配置目录。

## 解决的问题
- AI 上下文从“仅当前选区”改为“整张脑图 + 当前聚焦选区”。
- AI 返回合法结构化变更后可直接应用到画布，并显示改动摘要与一键撤销入口。
- 结构化操作扩展为新增、更新、移动、删除脑图节点，且对非法操作做严格校验。
- Codex bridge 新增 settings 读写与重置接口，业务 prompt 不再依赖仓库内文件或手动重启。
- AI 侧栏新增全局设置弹层，支持查看、编辑、保存、重置业务 prompt。
- 自动应用 AI 改动后可作为单次历史操作撤销，避免逐条人工审批。

## 问题原因
- 旧实现把 AI 上下文过度限制在手工附加的节点集合上，容易导致模型理解不足。
- 旧实现要求提案预览后再人工确认，交互过重，不符合“自然语言直接落图”的目标。
- 旧 schema 对 `update_topic` 约束过松，允许空更新穿过 schema 后在本地应用时失败。
- system prompt 固定在服务端文件中，修改成本高，无法满足应用内全局设置需求。

## 尝试的解决办法
1. 重写共享 AI contract、上下文构建与提案应用逻辑，把整图快照和选区焦点一起传给 Codex。
2. 扩展结构化脑图操作类型，支持 `move_topic` 和 `delete_topic`，并对空更新、非法移动、非法删除进行严格校验。
3. 重构 AI store，移除待审批提案流，改为收到合法提案后立即本地应用，并记录本轮 AI 改动摘要和撤销信息。
4. 改写 Codex bridge 与 system prompt 加载器，新增本地配置存储、settings API 和只读安全边界 prompt 拼接。
5. 新增 AI 设置弹层和改动摘要 UI，更新 AI 侧栏提示文案，使其反映“整图上下文 + 直接落图”的新模式。
6. 重写端到端测试，覆盖整图上下文、直接落图、侧栏行为、Codex 不可用提示和多选框选交互。

## 是否成功解决
- 状态：成功
- 说明：功能已完成并通过 lint、单测、构建和 E2E 验证；AI 现在默认基于整张脑图理解并可直接将合法结果落到画布。

## 相关文件
- server/app.ts
- server/app.test.ts
- server/codex-bridge.ts
- server/system-prompt.ts
- server/prompts/brainflow-system.md
- shared/ai-contract.ts
- src/features/ai/ai-client.ts
- src/features/ai/ai-context.ts
- src/features/ai/ai-context.test.ts
- src/features/ai/ai-proposal.ts
- src/features/ai/ai-proposal.test.ts
- src/features/ai/ai-storage.ts
- src/features/ai/ai-store.ts
- src/features/ai/components/AiSidebar.tsx
- src/features/ai/components/AiSidebar.module.css
- src/features/ai/components/AiSidebar.test.tsx
- src/features/ai/components/AiComposer.tsx
- src/features/ai/components/AiContextTray.tsx
- src/features/ai/components/AiMessageList.tsx
- src/features/ai/components/AiSettingsDialog.tsx
- src/features/ai/components/AiSettingsDialog.module.css
- src/pages/editor/MapEditorPage.tsx
- src/test/e2e/brainflow.spec.ts
- .env.example

## 遗留问题/下一步
- 当前仍保留本机 Codex CLI bridge 的安全硬边界，AI 不会访问 repo、后台、文件系统或数据库。
- 直接落图模式已经可用，但后续可以继续优化摘要文案生成与复杂移动/删除场景下的结果可解释性。
- 如需把 AI 设置入口提升到全局应用设置页，可在后续迭代中抽离出独立设置面板。
