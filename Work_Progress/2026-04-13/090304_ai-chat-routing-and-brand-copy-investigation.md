# 任务记录

## 任务名称
- 排查 AI 聊天重复文案、品牌名残留与 Codex 误触发问题

## 执行时间
- 开始时间：2026-04-13 09:03:04 +0800
- 结束时间：

## 仓库根目录
- C:\Users\edwar\Desktop\BrainFlow

## 任务背景
- 用户在接入 DeepSeek 测试时发现欢迎回复内容重复、界面仍出现 BrainFlow/Codex 相关文案，并伴随 network error。

## 任务目标
- 定位欢迎词重复来源、品牌名残留位置，以及 DeepSeek 场景下为何仍触发 Codex bridge。

## 已执行动作
1. [09:03:04] 创建本轮任务记录文件。
2. [09:05:00] 检查 AI store、client、sidebar 与 provider factory，确认前端通过 `X-AI-Provider` 传递当前 provider，后端在 `/api/codex/chat` 内按 header 分发到具体 provider。
3. [09:08:00] 检查 DeepSeek/Kimi 流式实现与 bridge 转发逻辑，确认 provider 同时触发 `onDelta` 与 `onEvent`，bridge 又同时消费两路 delta，导致流式文本重复拼接。
4. [09:10:00] 检查系统 Prompt 存储与默认 Prompt 文件，确认默认文案和安全 Prompt 仍使用 BrainFlow/Codex 命名，且数据库中的 `system_prompts` 记录会优先覆盖文件默认值。
5. [09:11:00] 检查 AI 侧边栏与消息列表文案，确认多处状态提示和错误标题仍硬编码为 Codex。
6. [09:18:00] 新增 `server/system-prompt-defaults.ts`，统一 Flow 品牌默认 Prompt 与安全 Prompt，并在文件存储/数据库存储两条链路加入旧 BrainFlow Prompt 自动迁移逻辑。
7. [09:20:00] 调整 DeepSeek/Kimi/Kimi Code 流式 provider，移除重复的 delta 事件转发；同步收敛 bridge 聊天流式消费逻辑，只保留 `onDelta` 通道。
8. [09:21:00] 重写 `AiMessageList` 错误与运行状态文案，使错误标题按当前 provider 显示；同步将 AI 侧栏系统 Prompt 标签改为“系统 Prompt”。
9. [09:23:00] 运行相关单测与构建校验，并执行一次数据库默认 Prompt 检查确认当前 `system_prompts.default` 已为 Flow 文案。

## 结果
- 已完成修复：DeepSeek/Kimi 流式重复输出已去除，AI 消息错误标题改为 provider-aware，默认系统 Prompt 与数据库/本地存储中的旧 BrainFlow 品牌文案会自动迁移到 Flow。

## 状态
- 成功

## 相关文件
- Work_Progress/2026-04-13/090304_ai-chat-routing-and-brand-copy-investigation.md
- server/system-prompt-defaults.ts
- server/providers/deepseek-provider.ts
- server/providers/kimi-provider.ts
- server/codex-bridge.ts
- server/services/system-prompt-db-store.ts
- server/system-prompt.ts
- server/prompts/brainflow-system.md
- server/system-prompt.test.ts
- src/features/ai/components/AiMessageList.tsx
- src/features/ai/components/AiSidebar.tsx
- src/features/ai/ai-client.ts
- server/app.ts

## 验证
- 代码核对：已检查流式 provider、bridge、Prompt store、前端 AI 消息与侧栏文案链路。
- 单测：`npx vitest run server/system-prompt.test.ts src/features/ai/components/AiMessageList.test.tsx src/features/ai/components/AiSidebar.test.tsx src/features/ai/ai-store.test.ts` 通过；`npx vitest run server/providers/kimi-provider.test.ts` 通过。
- 构建：`npm run build:server` 通过；`npm run build:web` 失败，失败项位于 `TopicNode.tsx`、`document-service.test.ts`、`text-import-batch-compose.ts`、`legacy-document-local-service.ts`、`document-repository.ts`，属于本轮修改外的既有问题。
- 数据库检查：执行脚本查询 `system_prompts.default`，结果为 `SYSTEM_PROMPT_ALREADY_FLOW`。

## 遗留问题/下一步
- 若需进一步收口品牌重命名，可继续排查文档、测试与非 AI 页面中的 `BrainFlow` 字样；本轮未处理与当前需求无关的全站命名残留及前端既有构建错误。
