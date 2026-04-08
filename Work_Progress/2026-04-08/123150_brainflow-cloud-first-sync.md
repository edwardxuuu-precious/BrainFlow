# 任务记录

## 任务名称
- BrainFlow cloud-first local sync 改造实施

## 执行时间
- 开始时间：2026-04-08 12:31:50
- 结束时间：2026-04-08 13:06:03

## 仓库根目录
- C:\Users\Administrator\Desktop\BrainFlow

## 任务目标
- 将 BrainFlow 从 `local-first with backup` 改造为 `cloud-first local sync`
- 让云端成为 document / conversation 的唯一权威数据源
- 将 IndexedDB 重构为缓存、副本、待同步队列和设备态
- 保留 zip 导入导出、文件夹连接、冲突弹窗，但降级为辅助能力

## 解决的问题
- 新增共享同步契约，补齐 document / conversation 的 envelope 字段、冲突结构、bootstrap / push / pull / restore 接口类型
- 新增 Hono 服务端同步接口：`/api/sync/bootstrap`、`/api/sync/push`、`/api/sync/pull`、`/api/sync/resolve-conflict`、`/api/workspace/full`、`/api/workspace/restore`
- 新增 Postgres / 内存双仓储实现，服务端支持 current head、snapshot history、workspace change cursor、conflict record
- 新增前端 IndexedDB v2：`documents_cache`、`conversations_cache`、`pending_ops`、`sync_state`、`device_info`、`sync_conflicts`
- 新增云同步编排层，支持启动、焦点恢复、联网恢复、手动同步、定时同步触发
- 文档与 AI 会话改为真正入云，只有服务端 authoritative ack 后才会进入 `synced`
- 保存指示器改为区分“本地已保存”和“云端已同步”
- 设置页、冲突弹窗、迁移入口改为 cloud-first 语义
- 增加 legacy reader 和迁移上传流程，支持把旧本地数据 bootstrap 到云端
- 保留旧文档存储的兼容镜像与规范化逻辑，避免 legacy 数据、旧测试和导入链路回归
- 修复备份导入时重复文档副本对应的 conversation `id/sessionId` 冲突问题
- 修复同步引入后对编辑器页面测试的副作用，避免测试环境下轮询和即时订阅回调造成额外状态抖动
- 修复新增同步代码的 TypeScript 构建问题，并补齐 `pg` 类型依赖
- 修复构建脚本中对全局 `pnpm` 的假设，改为可在当前环境直接运行

## 问题原因
- 旧架构以浏览器本地存储为主，服务端不保存业务权威数据，无法满足多设备一致性、版本冲突控制和云端持久化要求
- 文档正文与 AI 会话此前没有进入统一的服务端版本链路，导致“本地已保存”不等于“云端已同步”
- 旧版 document 规范化逻辑散落在 legacy local service 中，新链路绕开后会引入 workspace / tree / theme 兼容回归

## 尝试的解决办法
1. 新建 `shared/sync-contract.ts`、`shared/stable-hash.ts`，定义同步模型和服务端权威结构
2. 新建服务端认证上下文、同步配置、仓储接口、内存仓储、Postgres 仓储和 `SyncService`
3. 在 `server/app.ts` 接入 sync / workspace 路由
4. 新建前端同步 domain、IndexedDB v2、legacy reader、REST client、cloud sync orchestrator
5. 重写 document / conversation repository 和 workspace storage service，使前端读写走新同步层
6. 重写保存指示器、存储设置页、冲突弹窗，并把编辑器页接入双状态保存显示
7. 复用 legacy document normalization，恢复新链路对旧文档格式、workspace 选中态和树修复行为的兼容
8. 修复 backup import 中 duplicate document 对应 session copy 的 `id/sessionId` 生成逻辑
9. 关闭测试环境下的同步浏览器触发器，并把状态订阅改成“先读当前值、再监听后续变更”
10. 运行 `corepack pnpm test`、`corepack pnpm build:web`、`corepack pnpm build:server`、`corepack pnpm build` 验证结果

## 是否成功解决
- 状态：成功
- 说明：cloud-first local sync 的 P0 主链路已经完成落地，前后端同步接口、本地缓存/队列、迁移入口、冲突处理、双状态保存提示和服务端持久化骨架均已接入；测试与构建已通过

## 相关文件
- shared/sync-contract.ts
- shared/stable-hash.ts
- shared/ai-contract.ts
- server/app.ts
- server/auth/context.ts
- server/sync-config.ts
- server/repos/sync-repository.ts
- server/repos/in-memory-sync-repository.ts
- server/repos/postgres-sync-repository.ts
- server/repos/create-sync-repository.ts
- server/services/sync-service.ts
- src/features/storage/domain/sync-records.ts
- src/features/storage/local/cloud-sync-idb.ts
- src/features/storage/local/legacy-reader.ts
- src/features/storage/cloud/sync-api.ts
- src/features/storage/sync/cloud-sync-orchestrator.ts
- src/features/storage/services/document-repository.ts
- src/features/storage/services/conversation-repository.ts
- src/features/storage/services/workspace-storage-service.ts
- src/features/storage/ui/StorageConflictDialog.tsx
- src/features/storage/ui/StorageSettingsPage.tsx
- src/components/SaveIndicator.tsx
- src/pages/editor/MapEditorPage.tsx
- src/App.tsx
- src/test/setup.ts
- package.json
- .env.example

## 遗留问题/下一步
- P1 可继续补完整 diff 页面、批量同步、指数退避、跨标签页协调和更强的可观测性
- P2 可继续补 service worker / background sync、细粒度 patch、实时协作和关系化检索索引
- 若正式上线 Postgres，同步表结构建议进一步迁移到正式 migration 管理，而不是只依赖运行时初始化
