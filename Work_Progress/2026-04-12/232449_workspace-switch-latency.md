# 任务记录

## 任务名称
- 排查首页工作区切换按钮响应缓慢

## 执行时间
- 开始时间：2026-04-12 23:24:49 +08:00
- 结束时间：

## 仓库根目录
- C:\Users\edwar\Desktop\BrainFlow

## 任务背景
- 用户反馈首页顶部工作区下拉中切换工作区按钮响应明显变慢，需要定位实际瓶颈。

## 任务目标
- 查明工作区切换流程中的慢点，并在可控范围内优化交互或实现。

## 已执行动作
1. [23:24] 确认首页工作区切换入口位于 `src/pages/home/HomeHeader.tsx`，服务调用链经过 `workspaceStorageService.switchWorkspace()` 与 `cloudSyncOrchestrator.switchWorkspace()`。
2. [23:27] 检查切换流程，确认切换时会执行 `/api/workspace/full` 全量拉取、`cloudSyncIdb.deleteDatabase()`、快照回写、`documentRepository.rebuildLocalIndex()` 以及管理状态刷新。
3. [23:29] 确认首页文档列表未订阅工作区切换事件，用户点击切换后顶部与列表更新存在滞后，容易感知为“按钮很慢”。
4. [23:31] 修改 `workspaceStorageService.switchWorkspace()`，切换后复用已缓存的管理状态并与本地索引重建并行，减少额外等待。
5. [23:31] 修改首页 `HomeHeader` 与 `HomePage`：切换时立即进入目标工作区的交互态、禁止重复点击，并在工作区状态变更后刷新文档列表。
6. [23:32] 运行首页与同步相关单测、ESLint；记录全量 TypeScript 检查结果。

## 结果
- 工作区切换慢的主要原因不是单个按钮本身，而是点击后串行触发了全量工作区快照加载、浏览器同步库重置、文档索引重建和管理状态刷新。
- 首页原实现没有订阅工作区变更，导致点击后文档列表不立刻跟随当前工作区刷新，放大了“切换很慢”的感受。
- 已优化切换路径与交互反馈，减少一次不必要的服务端状态刷新，并让首页在工作区变更后立即刷新列表。

## 状态
- 成功

## 相关文件
- `Work_Progress\2026-04-12\232449_workspace-switch-latency.md`
- `src\pages\home\HomeHeader.tsx`
- `src\pages\home\HomeHeader.module.css`
- `src\pages\home\HomePage.tsx`
- `src\pages\home\HomePage.test.tsx`
- `src\features\storage\services\workspace-storage-service.ts`

## 验证
- `rg -n "switchWorkspace\\(|选择工作区|管理工作区" src server shared`
- `pnpm vitest run src/pages/home/HomePage.test.tsx src/features/storage/sync/cloud-sync-orchestrator.test.ts`
- `pnpm eslint src/pages/home/HomePage.tsx src/pages/home/HomeHeader.tsx src/features/storage/services/workspace-storage-service.ts`
- `pnpm exec tsc --noEmit -p tsconfig.app.json`：失败，仍有仓库既有类型错误，含 `TopicNode.tsx`、`legacy-document-local-service.ts`、`cloud-sync-orchestrator.ts` 等，与本次首页切换优化不同步清理。

## 遗留问题/下一步
- 如仍感觉切换偏慢，可继续把 `cloudSyncOrchestrator.switchWorkspace()` 改为批量写入 IndexedDB，而不是逐条回写快照记录。
