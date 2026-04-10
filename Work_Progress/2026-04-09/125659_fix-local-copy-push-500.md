# 任务记录

## 任务名称
- 修复本地兜底副本 push 500

## 执行时间
- 开始时间：2026-04-09 12:56:59 +08:00
- 结束时间：2026-04-09 13:01:28 +08:00

## 仓库根目录
- C:/Users/Administrator/Desktop/BrainFlow

## 任务目标
- 修复点击保留本地并另存副本后，启动同步推送本地副本时 /api/sync/push 返回 500 的问题。

## 解决的问题
- 已处理：本地兜底副本创建后进入 pending sync，但开发服务器使用内存同步仓库时，如果服务端重启丢失 workspace，本地仍认为已 bootstrap，导致 push 返回 500。
- 已处理：push 遇到 Workspace not found 时现在会返回 404，前端识别后会清空 bootstrap 标记并用当前 IndexedDB 缓存重新 bootstrap，再继续 pull。

## 问题原因
- 已确认根因：默认未配置 BRAINFLOW_SYNC_DATABASE_URL 时使用内存同步仓库；dev server 重启会丢失 workspace，而浏览器 IndexedDB 仍保留 bootstrapCompletedAt，启动同步跳过 bootstrap 直接 push，服务端写 head 时抛出 Workspace not found 并被同步路由映射为 500。

## 尝试的解决办法
1. 检查服务端 SyncService.push、in-memory/postgres repository applyMutation/writeHead、前端 pushPendingOps 与本地副本 pending op 形状。
2. 在 SyncService.push 中把 Workspace not found 转换为 SyncApiError 404，避免作为 500 返回。
3. 在 cloud-sync-orchestrator.ts 的 pushPendingOps 中处理 SyncApiError 404 + Workspace not found：将 bootstrapCompletedAt 清空、lastPulledCursor 重置为 0，并调用 bootstrapCurrentCache(workspaceId) 重新恢复服务端 workspace。
4. 增加 server/app.test.ts 用例，验证 /api/sync/push 的 Workspace not found 返回 404。
5. 增加 cloud-sync-orchestrator.test.ts 用例，验证 push 404 后会按 push -> bootstrap -> pull 顺序恢复，并清空 pending ops、更新 bootstrapCompletedAt。
6. 运行定向 Vitest、定向 ESLint、npm run build 和 diff 空白检查。

## 是否成功解决
- 状态：部分成功
- 说明：本轮代码修改、定向测试和定向 lint 已通过；npm run build 前端构建通过，但 server TypeScript 阶段仍失败在未修改的 shared/text-import-layering.test.ts 既有 NodeNext import 后缀与隐式 any 问题。

## 相关文件
- server/services/sync-service.ts
- server/app.test.ts
- src/features/storage/sync/cloud-sync-orchestrator.ts
- src/features/storage/sync/cloud-sync-orchestrator.test.ts

## 遗留问题/下一步
- 需要刷新浏览器或等待 HMR 加载后重新触发同步，确认 /api/sync/push 不再停留在 500；如果仍有错误，需要查看响应 message 是否不再是 Workspace not found。
- 如需让全量 npm run build 通过，需要另行修复 shared/text-import-layering.test.ts 的既有类型错误。
