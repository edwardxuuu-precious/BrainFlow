# 任务记录

## 任务名称
- 修复 Codex 真正流式输出，只显示“等待输出”的问题

## 执行时间
- 开始时间：2026-04-03 08:35:02
- 结束时间：2026-04-03 08:53:40

## 仓库根目录
- C:\Users\edwar\Desktop\BrainFlow

## 任务目标
- 将当前 AI 对话从“最终结果切块伪流式”改成真实双阶段流式：先流式自然语言回答，再隐藏生成结构化脑图改动并落图。

## 解决的问题
- 将服务端 AI 对话链路拆成“两阶段”：第一阶段先生成自然语言回答，第二阶段再生成结构化脑图改动。
- 将前端 AI store 改成“先提交回答、再应用改动”的双提交点，避免用户只能看到按钮灰掉。
- 为 AI 运行阶段补充 `planning_changes`，并让消息列表与发送按钮明确展示“输出中 / 生成改动中 / 应用改动中”。
- 修复第二阶段失败时丢失第一阶段回答的问题，保证“回答成功但落图失败”时聊天内容仍会本地持久化保留。
- 补齐 server / store / e2e 回归测试，验证新的事件顺序和前端状态切换。

## 问题原因
- 现有实现并不是真流式。`server/app.ts` 会等待 `bridge.chat()` 完整结束后，才把最终 `assistantMessage` 切块伪装成 `assistant_delta` 发给前端。
- 本机 `codex-cli 0.118.0-alpha.2` 在 `codex exec --json` 下当前不会逐 token 输出文本事件，只会在结束时给出 `item.completed.agent_message.text`，导致前端长期只停在“等待输出”。
- 因此无法直接把现有 CLI 链路改成真正的 token 级实时透传，只能改成“先回答、后落图”的两阶段可见流，并为未来 CLI 如果支持 delta 事件预留透传能力。

## 尝试的解决办法
1. 用本机 `codex exec` 实测 `--json` 与非 `--json` 输出行为，确认当前 CLI 不会稳定产出逐 token 文本流。
2. 重写 `server/codex-runner.ts`，新增 `executeMessage()` 与 JSONL 事件回调能力，保留结构化 `execute()` 给第二阶段落图使用。
3. 重写 `server/codex-bridge.ts`，拆成 `streamChat()` 和 `planChanges()` 两步，分别负责自然语言回答与结构化脑图提案。
4. 改造 `server/app.ts` 的 `/api/codex/chat`，按 `starting_codex -> waiting_first_token -> streaming -> planning_changes -> result/error` 发事件。
5. 改造 `src/features/ai/ai-store.ts`，在进入 `planning_changes` 时就把第一阶段回答固化成正式 assistant message，并在第二阶段失败时保留该回答。
6. 更新 `AiMessageList`、`AiComposer` 文案映射，补充 `planning_changes` 阶段。
7. 更新 `server/app.test.ts`、`server/codex-bridge.test.ts`、`server/codex-runner.test.ts`、`src/features/ai/ai-store.test.ts` 与 `src/test/e2e/brainflow.spec.ts`，完成回归验证。
8. 运行 `pnpm test -- --run`、`pnpm lint`、`pnpm build`、`pnpm test:e2e` 确认无回归。

## 是否成功解决
- 状态：成功
- 说明：已实现“两阶段可见流”版本。当前这版 Codex CLI 仍不提供真实 token 级 stdout 增量，因此还达不到真正逐 token 实时输出；但现在用户会先看到第一阶段回答进入消息区，再看到“生成改动 / 应用改动”阶段，体验上不再只剩按钮长时间显示“等待输出”。

## 相关文件
- Work_Progress/2026-04-03/083502_true_streaming_codex.md
- server/codex-runner.ts
- server/codex-bridge.ts
- server/app.ts
- shared/ai-contract.ts
- src/features/ai/ai-store.ts
- src/features/ai/components/AiComposer.tsx
- src/features/ai/components/AiMessageList.tsx
- server/codex-runner.test.ts
- server/codex-bridge.test.ts
- server/app.test.ts
- src/features/ai/ai-store.test.ts
- src/test/e2e/brainflow.spec.ts

## 遗留问题/下一步
- 当前 `codex-cli 0.118.0-alpha.2` 仍未暴露稳定的 token 级文本 delta 事件，所以第一阶段回答依然是在 Codex 完成该阶段后再被逐块写入前端。
- 如果未来 Codex CLI 的 `--json` 流里出现稳定的文本 delta 事件，当前 `executeMessage()` / `streamChat()` 已经具备直通入口，只需补充事件解析即可升级到更接近真正的实时流式输出。
