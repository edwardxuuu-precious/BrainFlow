# 任务记录

## 任务名称
- BrainFlow 内嵌 Codex AI 侧栏与受限画布写入实现

## 执行时间
- 开始时间：2026-04-02 16:43:43
- 结束时间：2026-04-02 17:47:37

## 仓库根目录
- c:\Users\edwar\Desktop\BrainFlow

## 任务目标
- 在编辑器右侧接入一个可切换的 AI 侧栏，用受限代理方式接入 Codex 能力。
- 支持显式节点上下文注入、本地聊天持久化、提案审批后再写回脑图。
- 保证系统内的 AI 只能返回待审批的本地脑图提案，不能修改 repo、后台数据、文件系统或任何外部执行环境。

## 解决的问题
- 新增了 `server/` 代理层，提供匿名设备会话、内存限流和 `/api/ai/session`、`/api/ai/chat` 两个受限接口。
- 新增了 `shared/ai-contract.ts`、`src/features/ai/*`，实现了本地 AI 会话存储、上下文构建、提案校验和提案应用。
- 将编辑器右侧栏改为 `Inspector | AI` 双标签，支持把当前选中节点加入 AI 上下文、发送问题、查看提案、手动批准后再本地修改脑图。
- 为真实 OpenAI Key 缺失场景提供了 mock provider，保证本地开发和 E2E 可跑；真实 Key 存在时走 Responses API，显式 `store=false` 且 `tools: []`。

## 问题原因
- 原仓库是纯前端本地脑图应用，没有后端代理、匿名会话、AI 协议，也没有“审批后本地写入”的安全边界。
- 如果直接把 OpenAI key 放到前端或让模型拥有工具执行能力，就无法满足“不能修改 repo 与后台数据”的限制。

## 尝试的解决办法
1. 先梳理现有编辑器、持久化和右侧栏结构，确认最安全的接入点是“右侧栏双标签 + 前端本地提案应用”。
2. 新增 BFF 代理层，只允许会话创建和 AI 对话，不暴露任何 repo、数据库、文件、shell 或后台写接口。
3. 将模型输出限制为严格结构化提案，只允许 `create_child`、`create_sibling`、`update_topic(title/note)` 三类操作。
4. 在前端新增本地 IndexedDB 聊天存储、上下文 chip、提案预览与审批逻辑，并通过现有 editor store 在本地应用提案。
5. 补充单元测试、服务端测试和 E2E，用 mock provider 验证“仅代理 + 审批后本地写入”的边界。

## 是否成功解决
- 状态：成功
- 说明：AI 侧栏、匿名会话、上下文注入、提案审批、本地应用和本地聊天持久化都已接入；代理层没有 repo 或后台写入口，且验证通过。

## 相关文件
- c:\Users\edwar\Desktop\BrainFlow\server\app.ts
- c:\Users\edwar\Desktop\BrainFlow\server\ai-provider.ts
- c:\Users\edwar\Desktop\BrainFlow\server\index.ts
- c:\Users\edwar\Desktop\BrainFlow\shared\ai-contract.ts
- c:\Users\edwar\Desktop\BrainFlow\src\features\ai\ai-store.ts
- c:\Users\edwar\Desktop\BrainFlow\src\features\ai\ai-storage.ts
- c:\Users\edwar\Desktop\BrainFlow\src\features\ai\ai-context.ts
- c:\Users\edwar\Desktop\BrainFlow\src\features\ai\ai-proposal.ts
- c:\Users\edwar\Desktop\BrainFlow\src\features\ai\components\AiSidebar.tsx
- c:\Users\edwar\Desktop\BrainFlow\src\pages\editor\MapEditorPage.tsx
- c:\Users\edwar\Desktop\BrainFlow\src\features\editor\editor-store.ts
- c:\Users\edwar\Desktop\BrainFlow\src\test\e2e\brainflow.spec.ts
- c:\Users\edwar\Desktop\BrainFlow\.env.example

## 遗留问题/下一步
- 当前默认使用匿名设备会话，不做用户体系与跨设备会话同步。
- 未提供删除节点、重排结构、改分支方向、改布局偏移等 AI 自动化能力；如果后续要扩展，仍应保持“提案审批 + 本地应用”的边界。
- 若要接真实 OpenAI 服务，需要在本地或部署环境配置 `OPENAI_API_KEY`，否则会继续使用 mock provider。
