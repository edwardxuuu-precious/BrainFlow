# 任务记录

## 任务名称
- 禁止 AI 自动写入节点标记与贴纸

## 执行时间
- 开始时间：2026-04-07 07:55:26
- 结束时间：2026-04-07 08:04:29

## 仓库根目录
- C:\Users\edwar\Desktop\BrainFlow

## 任务目标
- 禁止 AI 在聊天 proposal、bridge 归一化和文本导入语义编译中自动写入节点 `markers` 与 `stickers`
- 保留人工手动编辑标记和贴纸的能力，同时允许 AI 继续读取这些字段作为上下文
- 为相关链路补齐回归测试，确保旧模型输出也会被兜底清洗

## 解决的问题
- 收窄了 `AiTopicMetadataPatch`，AI 可写 metadata 仅保留 `labels` 和 `type`
- 新增共享 sanitize helper，在客户端 apply 和服务端 bridge 两侧都丢弃 AI proposal 中的 `markers` / `stickers`
- 更新了 planning prompt 和系统提示，明确标记与贴纸由人工维护，AI 不得创建或修改
- 移除了文本导入语义编译器对 `markers` / `stickers` 的自动分配，仅保留语义 `labels` 和必要的 `type`
- 补充并通过了客户端 apply、bridge 归一化、文本导入语义生成三组定向测试

## 问题原因
- `AiTopicMetadataPatch` 之前把 `markers` 和 `stickers` 也作为 AI 可写字段，导致模型输出会直接透传到落图层
- `server/codex-bridge.ts` 的 metadata 归一化此前会保留 `markers` / `stickers`，缺少服务端兜底
- `shared/text-import-semantics.ts` 的 `IMPORT_ROLE_META` 会基于语义角色自动注入标记和贴纸，即使没有经过聊天式 AI 也会写入这些字段

## 尝试的解决办法
1. 新增 `shared/ai-metadata-patch.ts`，统一定义 AI 可写 metadata 的 sanitize 规则，只保留 `labels` 和 `type`
2. 修改 `shared/ai-contract.ts`、`src/features/ai/ai-proposal.ts`、`server/codex-bridge.ts` 和 `server/prompts/brainflow-system.md`，同时收紧类型、客户端 apply、服务端归一化和提示词约束
3. 修改 `shared/text-import-semantics.ts`，移除导入语义角色的自动 `markers` / `stickers` 分配
4. 补充 `src/features/ai/ai-proposal.test.ts`、`server/codex-bridge.test.ts`、`shared/text-import-semantics.test.ts` 并执行定向测试

## 是否成功解决
- 状态：成功
- 说明：AI 生成和文本导入流程不再自动写入节点标记与贴纸；已有人工标记/贴纸仍可读取和手动维护，定向测试全部通过

## 相关文件
- shared/ai-contract.ts
- shared/ai-metadata-patch.ts
- shared/text-import-semantics.ts
- shared/text-import-semantics.test.ts
- src/features/ai/ai-proposal.ts
- src/features/ai/ai-proposal.test.ts
- server/codex-bridge.ts
- server/codex-bridge.test.ts
- server/prompts/brainflow-system.md

## 遗留问题/下一步
- 本次未追溯清理历史上已由 AI 写入的旧 `markers` / `stickers`
- 本次未跑全量测试和 e2e，仅完成直接相关的定向单测
