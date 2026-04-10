# 任务记录

## 任务名称
- 过期冲突 404 时本地兜底另存副本

## 执行时间
- 开始时间：2026-04-09 12:16:06 +08:00
- 结束时间：2026-04-09 12:26:30 +08:00

## 仓库根目录
- C:/Users/Administrator/Desktop/BrainFlow

## 任务目标
- 将 /api/sync/resolve-conflict 返回 Conflict not found 的交互策略改为：按用户点击的“保留本地并另存副本”意图，创建本地副本、清理冲突弹窗并返回主页面。

## 解决的问题
- 已处理：当前 404 会显示错误并保留弹窗，用户希望继续按本地另存副本兜底完成操作。
- 已处理：当 save_local_copy 请求返回 404 时，前端现在会使用本地冲突记录创建新副本、写入 pending sync、清理原冲突和原实体 pending 队列，从而让弹窗关闭。

## 问题原因
- 已确认根因：服务端冲突记录已消失或与本地缓存冲突不同步时，上一轮策略把 404 作为需要用户手动处理的错误展示；用户当前期望是将“保留本地并另存副本”作为可本地完成的兜底操作。
- 已确认风险点：文档 payload 内部也包含 id，会话 payload 包含 id/sessionId，因此创建副本时必须同时更新 envelope id 和 payload 内部 id。

## 尝试的解决办法
1. 创建并同步本轮 Work_Progress 与 Daily_Work 任务记录。
2. 在 cloud-sync-orchestrator.ts 中新增本地副本 ID 生成与 saveLocalCopyForStaleConflict 兜底逻辑。
3. 仅在 SyncApiError 404 且 resolution 为 save_local_copy 时触发本地兜底；其他 404 仍保留错误展示路径。
4. 兜底副本会保存为 local_saved_pending_sync，并创建新的 pending upsert；随后清理原冲突和原实体 pending 队列，更新 sync state 的 hasConflicts/lastError，并刷新状态。
5. 调整 cloud-sync-orchestrator.test.ts，验证 404 时不会抛错、会生成本地副本、payload id 与副本 id 一致、原冲突清除且新副本进入 pending sync。
6. 运行定向 Vitest、定向 ESLint、diff 空白检查和 npm run build 验证。

## 是否成功解决
- 状态：部分成功
- 说明：本轮策略修改和定向测试已通过；npm run build 的前端构建通过，但 server TypeScript 阶段仍失败在未修改的 shared/text-import-layering.test.ts 既有 NodeNext import 后缀与隐式 any 问题。

## 相关文件
- src/features/storage/sync/cloud-sync-orchestrator.ts
- src/features/storage/sync/cloud-sync-orchestrator.test.ts
- src/features/storage/ui/StorageConflictDialog.tsx
- src/features/storage/ui/StorageConflictDialog.test.tsx

## 遗留问题/下一步
- 如需让全量 npm run build 通过，需要另行修复 shared/text-import-layering.test.ts 的既有类型错误。
- 当前工作区还有其他未提交/未跟踪变更，本轮未回滚或覆盖这些无关变更。
