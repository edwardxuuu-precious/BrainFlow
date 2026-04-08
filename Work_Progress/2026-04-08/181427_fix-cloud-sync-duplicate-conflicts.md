# 任务记录

## 任务名称
- 修复云同步重复文档冲突

## 执行时间
- 开始时间：2026-04-08 18:14:27
- 结束时间：2026-04-08 21:16:05

## 仓库根目录
- `C:\Users\Administrator\Desktop\BrainFlow`

## 任务目标
- 修复云同步中同一实体重复入队、重复生成冲突、冲突解决后旧队列继续反复报冲突的问题，并补齐回归测试。

## 解决的问题
- 修复前端云同步中同一实体重复追加 pending op 的问题，改为按 `workspaceId + entityType + entityId` 合并为单条最新待同步意图。
- 修复服务端与本地缓存中同一实体重复累积 conflict 记录的问题，新增实体级 conflict 去重与覆盖更新。
- 修复冲突解决后旧 pending/conflict 队列仍然残留、导致同文档再次立刻报冲突的问题。
- 将设置页冲突列表改为按实体聚合展示，显示折叠后的冲突数量与标题。
- 补充云同步 orchestrator、冲突聚合、in-memory 仓储去重测试，并验证通过。

## 问题原因
- 同一实体每次保存都会新增一条 pending op，没有合并旧操作，导致本地待同步队列按操作次数膨胀。
- 冲突记录以随机 `conflictId` 直接落库，没有按实体复用活跃冲突，导致同一实体会出现多条未解决冲突。
- 冲突解决后只删除当前 conflictId，没有清理同实体的旧 pending/conflict 记录，导致下一轮同步继续使用过期 `baseVersion` 重推并再次冲突。
- 设置页直接平铺原始 conflict 列表，用户会看到重复冲突条目而误以为多个文档同时异常。

## 尝试的解决办法
1. 为 `cloud-sync-idb` 增加按实体查询和删除 pending op / conflict 的接口，供 orchestrator 做实体级合并与清理。
2. 在 `cloud-sync-orchestrator` 中新增 `upsertPendingOp`，把文档/会话保存统一改为“覆盖同实体旧操作”，冲突时先清理同实体旧 conflict，再写入最新 conflict。
3. 在 `resolveConflict` 成功后删除同实体所有 pending/conflict 记录，避免旧队列再次触发冲突。
4. 调整 `postgres-sync-repository` 与 `in-memory-sync-repository` 的 `createConflict` 语义，若同实体已有未解决 conflict，则更新该记录而不是新建。
5. 新增 `conflict-display` 聚合逻辑，在设置页按实体折叠重复冲突并展示折叠数量。
6. 运行 `npx vitest run src/features/storage/sync/cloud-sync-orchestrator.test.ts src/features/storage/ui/conflict-display.test.ts server/repos/in-memory-sync-repository.test.ts`，通过。
7. 运行 `npx vitest run src/features/storage/services/workspace-storage-service.test.ts server/app.test.ts`，通过。
8. 运行 `npm run build:web`，发现 `src/features/editor/editor-store.test.ts` 中存在与本次改动无关的预存 TypeScript 错误，未在本轮处理。

## 是否成功解决
- 状态：部分成功
- 说明：重复 pending/conflict 与设置页聚合问题已完成实现，新增与受影响测试均通过；但全量 `build:web` 仍被仓库内预存的 `src/features/editor/editor-store.test.ts` 编译错误阻塞。

## 相关文件
- `src/features/storage/sync/cloud-sync-orchestrator.ts`
- `src/features/storage/local/cloud-sync-idb.ts`
- `server/repos/postgres-sync-repository.ts`
- `server/repos/in-memory-sync-repository.ts`
- `server/services/sync-service.ts`
- `src/features/storage/ui/StorageSettingsPage.tsx`
- `src/features/storage/ui/conflict-display.ts`
- `src/features/storage/sync/cloud-sync-orchestrator.test.ts`
- `src/features/storage/ui/conflict-display.test.ts`
- `server/repos/in-memory-sync-repository.test.ts`

## 遗留问题/下一步
- 如需全量构建通过，需要单独修复 `src/features/editor/editor-store.test.ts` 中缺失的 `archiveDocument` 与空值检查问题。
- 若后续要进一步降低用户侧噪音，可以把 App 顶层冲突弹窗也改为按实体聚合，而不仅是设置页列表。
