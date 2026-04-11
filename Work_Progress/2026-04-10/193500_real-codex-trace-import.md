# 任务记录

## 任务名称
- 智能导入改为真实 Codex 通讯流展示

## 执行时间
- 开始时间：2026-04-10 19:35:00
- 结束时间：2026-04-10 22:42:48

## 仓库根目录
- C:\Users\edwar\Desktop\BrainFlow

## 任务目标
- 把智能导入默认过程展示从摘要型 `progress` 改成真实的 Codex 通讯流。
- 直接透传 runner 观察事件和 Codex `--json` 原始事件，并在前端显示 raw trace。
- 保留顶部阶段状态和进度条，但不再把那套摘要文案当作主过程流。

## 解决的问题
- 新增了 `TextImportTraceEntry` 和 `trace` 流事件协议，用于承载真实请求元数据、runner 观察事件和 Codex JSON 事件。
- `server/codex-bridge.ts` 现在会发出 `request.dispatched`、runner `spawn_started/heartbeat/first_json_event/completed`、以及原始 Codex 事件，不再用中文摘要驱动默认 UI。
- `/api/codex/import/preview` 已透传 `trace` NDJSON 事件，并补齐顶层和嵌套 `requestId`。
- 前端 `client/job/store` 已接入 `traceEntries`，支持 `replaceKey` 去重心跳，并保留最近 200 条事件。
- `TextImportDialog` 已改成默认展示终端式通讯流面板，支持：
  - 显示事件时间偏移、attempt、channel、eventType
  - 合并连续 `item.delta` 为单个流式文本块
  - 点击非 delta 事件查看 raw JSON
- 相关测试已经切换到 `trace` 预期并全部通过。

## 问题原因
- 之前智能导入 UI 展示的是 bridge 基于原始 runner/Codex 事件重新编写的摘要文案，不是实际拿到的通讯流。
- 用户要的是类似 VSCode Codex 面板里的真实运行事件，而不是“更可读但经过编纂”的状态句子。

## 尝试的解决办法
1. 在共享协议层新增 `TextImportTraceEntry` 与 `type: 'trace'` 流事件，保持 `status/result/error` 不变。
2. 在 `server/codex-bridge.ts` 增加 `onTrace`，把请求元数据、runner 观察事件、Codex 原始 JSON 事件直接透传出去。
3. 在 `server/app.ts` 的导入预览接口里改为输出 `trace` 事件，并补齐 `requestId`。
4. 在 `text-import-client.ts`、`text-import-job.ts`、`text-import-store.ts` 新增 `trace` 事件链路和 `traceEntries` 状态。
5. 把 `TextImportDialog` 的默认过程区改成 raw trace 面板，合并 `item.delta`，并为非 delta 事件提供 raw JSON 展开。
6. 更新相关测试，验证 trace 流、requestId 透传、心跳替换、以及新 UI 行为。
7. 运行类型检查和目标测试，确认改动可用。

## 是否成功解决
- 状态：成功
- 说明：智能导入默认过程展示已经切换为真实 Codex 通讯流，测试和类型检查均已通过。

## 相关文件
- shared/ai-contract.ts
- server/app.ts
- server/app.test.ts
- server/codex-bridge.ts
- server/codex-bridge.test.ts
- src/features/import/text-import-client.ts
- src/features/import/text-import-job.ts
- src/features/import/text-import-store.ts
- src/features/import/components/TextImportDialog.tsx
- src/features/import/components/TextImportDialog.module.css
- src/features/import/components/TextImportDialog.test.tsx
- src/pages/editor/MapEditorPage.tsx

## 遗留问题/下一步
- 现有 `progress` 结构仍保留兼容用途，但 `codex_import` 默认 UI 已不再依赖它；后续可视情况继续收缩旧摘要链路。
- 如果后面要开放“更原始的请求侧信息”，需要再决定是否允许展示更多 request metadata 或单独的诊断面板入口。
