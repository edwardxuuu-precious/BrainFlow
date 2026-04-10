# 任务记录

## 任务名称
- 修复冲突处理 500 与弹窗无反馈

## 执行时间
- 开始时间：2026-04-09 11:56:05 +08:00
- 结束时间：2026-04-09 12:12:30 +08:00

## 仓库根目录
- C:/Users/Administrator/Desktop/BrainFlow

## 任务目标
- 修复 /api/sync/resolve-conflict 返回 Conflict not found 时被当作 500、前端弹窗无错误反馈且阻塞主页面的问题。

## 解决的问题
- 已处理：服务端 Conflict not found 原本被映射为 500，前端缺少状态码错误类型和弹窗异步错误态，导致点击冲突处理按钮后无可见反馈。
- 已处理：当服务端找不到冲突时，前端不自动清理本地冲突、不自动另存副本，而是保留冲突并展示可见错误，用户仍可点击“稍后处理”关闭弹窗返回页面。

## 问题原因
- 已确认根因：后端同步 JSON 路由只专门处理 SyncConflictError，其余同步错误统一返回 500；仓库层 Conflict not found 没有被映射为 404。
- 已确认根因：前端 API 层 parseJson 只抛普通 Error，调用方无法区分 404/500；弹窗按钮直接触发异步 onResolve，缺少处理中和失败态，Promise rejection 会变成控制台错误。

## 尝试的解决办法
1. 创建并同步 Work_Progress 与 Daily_Work 任务记录；Daily_Work 辅助脚本参数不适配，改为直接同步 markdown 文件。
2. 在 server/services/sync-service.ts 新增 SyncApiError，并把 Conflict not found 转换为 404；在 server/app.ts 中按 typed error 返回对应状态码；在 Postgres 仓库中补充 workspace 不匹配校验。
3. 在 src/features/storage/cloud/sync-api.ts 新增客户端 SyncApiError，保留 HTTP status 和 payload。
4. 在 src/features/storage/sync/cloud-sync-orchestrator.ts 中处理 404：记录 lastError、刷新状态并继续抛错，不清理本地冲突、不删除 pending op、不创建副本。
5. 在 StorageConflictDialog 中新增处理中状态、内联错误提示和恢复按钮，失败后保留弹窗，并允许“稍后处理”关闭。
6. 增加后端、orchestrator、弹窗 UI 测试，覆盖 404、保留本地冲突和错误提示路径。
7. 运行定向 Vitest、定向 ESLint、diff 空白检查和 npm run build 验证。

## 是否成功解决
- 状态：部分成功
- 说明：计划内代码修改和定向测试已完成；npm run build 的前端构建通过，但 server TypeScript 阶段失败在未修改的 shared/text-import-layering.test.ts 既有 NodeNext import 后缀和隐式 any 问题，未在本轮改动无关文件。

## 相关文件
- server/app.ts
- server/services/sync-service.ts
- server/repos/postgres-sync-repository.ts
- server/app.test.ts
- src/features/storage/cloud/sync-api.ts
- src/features/storage/sync/cloud-sync-orchestrator.ts
- src/features/storage/sync/cloud-sync-orchestrator.test.ts
- src/features/storage/ui/StorageConflictDialog.tsx
- src/features/storage/ui/StorageConflictDialog.module.css
- src/features/storage/ui/StorageConflictDialog.test.tsx

## 遗留问题/下一步
- 如需让全量 npm run build 通过，需要另行修复 shared/text-import-layering.test.ts 中 NodeNext 相对导入缺少 .js 后缀与隐式 any 的既有类型错误。
- 当前工作区有其他未提交/未跟踪变更，本轮未回滚或覆盖这些无关变更。
