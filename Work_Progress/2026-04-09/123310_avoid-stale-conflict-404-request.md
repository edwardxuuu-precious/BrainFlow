# 任务记录

## 任务名称
- 避免过期冲突另存副本触发 404 请求

## 执行时间
- 开始时间：2026-04-09 12:33:10 +08:00
- 结束时间：2026-04-09 12:39:23 +08:00

## 仓库根目录
- C:/Users/Administrator/Desktop/BrainFlow

## 任务目标
- 当冲突显示云端版本缺失且用户点击“保留本地并另存副本”时，直接走本地兜底副本流程，避免先请求 /api/sync/resolve-conflict 产生浏览器 404 网络日志。

## 解决的问题
- 已处理：当前 404 已被兜底，但浏览器控制台仍会显示 POST /api/sync/resolve-conflict 404，让用户误以为仍然报错。
- 已处理：云端版本缺失的 save_local_copy 场景现在会在发起 fetch 前短路，本地创建副本并清理冲突，不再触发该 404 请求。

## 问题原因
- 已确认根因：只要 fetch 请求收到 404，浏览器 DevTools 会记录网络错误；要消除该日志，需要在已知云端缺失的场景避免发起这次请求。
- 已确认场景：冲突记录中 cloudRecord 为 null 时，服务端没有可解析的云端冲突记录，此时“保留本地并另存副本”可以完全由本地兜底逻辑完成。

## 尝试的解决办法
1. 创建并同步本轮 Work_Progress 与 Daily_Work 任务记录。
2. 在 cloud-sync-orchestrator.ts 的 resolveConflict 中新增 save_local_copy 且 cloudRecord 缺失时的本地短路逻辑。
3. 复用上一轮 saveLocalCopyForStaleConflict 逻辑创建副本、写入 pending sync、清理原冲突和原实体 pending 队列。
4. 在 cloud-sync-orchestrator.test.ts 中新增测试，断言云端记录缺失时不会调用 fetch，且仍会创建本地副本并进入 pending sync。
5. 运行定向 Vitest、定向 ESLint、npm run build 和 diff 空白检查。

## 是否成功解决
- 状态：部分成功
- 说明：本轮代码修改、定向测试和定向 lint 已通过；npm run build 的前端构建通过，但 server TypeScript 阶段仍失败在未修改的 shared/text-import-layering.test.ts 既有 NodeNext import 后缀与隐式 any 问题。

## 相关文件
- src/features/storage/sync/cloud-sync-orchestrator.ts
- src/features/storage/sync/cloud-sync-orchestrator.test.ts

## 遗留问题/下一步
- 需要刷新浏览器页面或确保 Vite HMR 已加载最新模块后，再点击“保留本地并另存副本”验证控制台不再出现该 resolve-conflict 404 请求。
- 如需让全量 npm run build 通过，需要另行修复 shared/text-import-layering.test.ts 的既有类型错误。
