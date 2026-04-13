# 任务记录

## 任务名称
- 修复首页脑图列表与主库存储不一致

## 执行时间
- 开始时间：2026-04-11 22:22:00
- 结束时间：2026-04-11 22:26:20

## 仓库根目录
- c:\Users\edwar\Desktop\BrainFlow

## 任务目标
- 让首页脑图列表以当前 workspace 的同步缓存/主库视图为准，不再被旧 localStorage 索引误导。

## 解决的问题
- 首页脑图列表不再盲信 `localStorage` 的 `brainflow:document-index:v1`，而是以当前 workspace 的同步缓存结果重建索引。
- 同步层的 `listDocuments/getDocument/listConversations/getConversation` 现在会按当前 workspace 过滤，避免跨 workspace 数据串进当前视图。
- 已验证首页在 `http://127.0.0.1:4173` 下从原有错位状态恢复为显示当前 workspace 的 2 张“未命名脑图”，底部计数也同步变为 `2 份脑图`。

## 问题原因
- `DocumentRepository.listDocuments()` 之前只要发现本地索引非空，就直接返回旧摘要，不会从同步缓存重建。
- `CloudSyncOrchestrator.listDocuments()` 之前没有按当前 workspace 过滤缓存记录，逻辑上允许不同 workspace 的文档混入同一列表。

## 尝试的解决办法
1. 修改 [document-repository.ts](/c:/Users/edwar/Desktop/BrainFlow/src/features/storage/services/document-repository.ts) 的 `listDocuments()`，改为每次从同步缓存读取当前 workspace 文档并重建本地索引。
2. 修改 [cloud-sync-orchestrator.ts](/c:/Users/edwar/Desktop/BrainFlow/src/features/storage/sync/cloud-sync-orchestrator.ts)，让文档与会话读取都按当前 `workspaceId` 过滤。
3. 在 [document-service.test.ts](/c:/Users/edwar/Desktop/BrainFlow/src/features/documents/document-service.test.ts) 新增“旧索引 + 其他 workspace 文档”场景，验证列表只保留当前 workspace 文档并刷新索引。
4. 在 [cloud-sync-orchestrator.test.ts](/c:/Users/edwar/Desktop/BrainFlow/src/features/storage/sync/cloud-sync-orchestrator.test.ts) 新增 workspace 过滤测试。
5. 执行 `npx vitest run src/features/documents/document-service.test.ts src/features/storage/sync/cloud-sync-orchestrator.test.ts src/pages/home/HomePage.test.tsx`、`npx tsc -p tsconfig.json --noEmit`，并用 Playwright 实际打开首页验证显示结果。

## 是否成功解决
- 状态：成功
- 说明：首页列表数据源与当前 workspace 重新对齐，当前 `127.0.0.1:4173` 首页已显示 2 张“未命名脑图”，不再显示旧的 `测试1` 摘要。

## 相关文件
- c:\Users\edwar\Desktop\BrainFlow\Work_Progress\2026-04-11\222200_fix-home-document-list-source.md
- c:\Users\edwar\Desktop\BrainFlow\src\features\storage\services\document-repository.ts
- c:\Users\edwar\Desktop\BrainFlow\src\features\storage\sync\cloud-sync-orchestrator.ts
- c:\Users\edwar\Desktop\BrainFlow\src\features\documents\document-service.test.ts
- c:\Users\edwar\Desktop\BrainFlow\src\features\storage\sync\cloud-sync-orchestrator.test.ts

## 遗留问题/下一步
- 主库中仍保留两个历史 workspace；当前首页虽然已按当前 workspace 正确显示，但如果你希望最终只保留 `测试1` 那套数据，还需要继续做 workspace 清理或迁移收口。
