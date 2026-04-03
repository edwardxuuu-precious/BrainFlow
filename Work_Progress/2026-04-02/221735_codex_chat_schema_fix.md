# 任务记录

## 任务名称
- 修复 Codex 聊天不可用与“重新验证无反馈”问题

## 执行时间
- 开始时间：2026-04-02 22:17:35
- 结束时间：2026-04-02 22:36:21

## 仓库根目录
- `c:\Users\edwar\Desktop\BrainFlow`

## 任务目标
- 修复本机 Codex chat 因输出 schema 不兼容而失败的问题。
- 修正 AI 侧栏中“重新验证/检查状态”的交互反馈，明确区分登录状态与最近一次执行失败。

## 解决的问题
- 修复 `server/codex-bridge.ts` 中传给 Codex CLI 的 JSON Schema 判别字段写法，兼容当前 `codex-cli 0.118.x`。
- 在共享错误码中新增 `schema_invalid`，把 schema 格式错误与登录、订阅、网络类错误分流。
- 调整前端 `ai-store`，把 `status.ready` 与 `lastExecutionError` 分开管理，不再把 schema 错误误导成重新验证问题。
- 调整 AI 侧栏与消息列表 UI，显示“检查状态/重新验证”的动态按钮文案、状态检查成功反馈，以及独立的执行错误卡片。
- 补齐 server、store、组件和 E2E 回归测试，覆盖“status 可用但 chat 因 schema 失败”的真实场景。

## 问题原因
- bridge 传给 `codex exec --output-schema` 的 schema 中，操作判别字段使用了 `{ const: 'create_child' }` 这类写法，缺少显式的 `type: 'string'`，被当前 Codex CLI 判定为 `invalid_json_schema`。
- 侧栏顶部的“重新验证”只会刷新 `codex login status`，不会覆盖聊天链路的 schema 错误，因此用户看到按钮点击后像是“没反应”。
- 前端原先把执行失败统一折叠成泛化报错文案，导致 schema 错误也被描述成登录问题。

## 尝试的解决办法
1. 在 `server/codex-bridge.ts` 中抽出操作 schema helper，并为所有操作类型补齐显式字符串 schema。
2. 在 `server/codex-runner.ts` 与 `shared/ai-contract.ts` 中新增 `schema_invalid` 错误码和错误映射，确保服务端能准确返回错误类型。
3. 在 `src/features/ai/ai-store.ts` 中新增 `lastExecutionError` 与 `statusFeedback`，仅对认证类错误触发重新验证，对 schema 错误只展示执行错误。
4. 在 `AiSidebar` 与 `AiMessageList` 中新增状态反馈区和错误卡片，把“本机 Codex 当前可用”和“最近一次执行失败”拆开展示。
5. 补充并运行 `server`、`store`、组件与 Playwright E2E 测试，验证“检查状态”有明确反馈，且 schema 错误不会再误导成登录问题。

## 是否成功解决
- 状态：成功
- 说明：Codex chat 的 schema 兼容问题已修复，前端也能明确区分登录可用性与最近一次执行失败；完整验证已通过。

## 相关文件
- `server/codex-bridge.ts`
- `server/codex-runner.ts`
- `server/codex-runner.test.ts`
- `server/codex-bridge.test.ts`
- `server/app.test.ts`
- `shared/ai-contract.ts`
- `src/features/ai/ai-client.ts`
- `src/features/ai/ai-store.ts`
- `src/features/ai/ai-store.test.ts`
- `src/features/ai/components/AiMessageList.tsx`
- `src/features/ai/components/AiMessageList.module.css`
- `src/features/ai/components/AiSidebar.tsx`
- `src/features/ai/components/AiSidebar.module.css`
- `src/features/ai/components/AiSidebar.test.tsx`
- `src/pages/editor/MapEditorPage.tsx`
- `src/test/e2e/brainflow.spec.ts`

## 遗留问题/下一步
- 当前只修复了 schema 兼容性与状态反馈链路，没有改动 Codex 权限边界，也没有恢复任何 mock fallback。
- 如果后续还出现 `codex exec` 级别的新兼容问题，应继续优先在 bridge 和错误分类层补充细分错误码，而不是把所有失败都归并为“重新验证”。
