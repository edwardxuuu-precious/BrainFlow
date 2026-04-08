# 任务记录

## 任务名称
- BrainFlow 本地优先持久化架构升级

## 执行时间
- 开始时间：2026-04-08 10:02:25
- 结束时间：2026-04-08 10:42:30

## 仓库根目录
- C:\Users\Administrator\Desktop\BrainFlow

## 任务目标
- 在不改变“本地优先”原则的前提下，为 BrainFlow 实现存储抽象层、备份导出/导入、可选同步文件夹、冲突处理 UI 和设置页入口，并保留未来云同步接口。

## 解决的问题
- 为文档与 AI 会话引入 repository / adapter 分层，旧的 `document-service` 与 `ai-storage` 改为兼容封装。
- 实现了备份 zip 的导出/导入，覆盖文档、索引、AI 会话，并包含 `schemaVersion`、`createdAt`、`exportedAt`、重复文档导入为副本、导入后自动修复索引。
- 实现了基于 File System Access API 的同步文件夹镜像写入、启动扫描、冲突检测与三种冲突处理决策。
- 新增 `/settings` 设置页、首页与编辑器入口，以及全局冲突弹窗，用户可以直接执行导出、导入、连接文件夹、重新扫描、断开文件夹。
- 增加了备份与导入相关测试，并验证现有文档服务和 AI 会话逻辑未回归。

## 问题原因
- 原有持久化逻辑分散在 `document-service.ts`、`ai-storage.ts`、`localStorage` 与多套 IndexedDB 中，缺少统一抽象，导致数据只能保存在单一浏览器上下文，无法迁移到另一台电脑，也无法在可读文件结构中做镜像与冲突处理。

## 尝试的解决办法
1. 在 `src/features/storage/` 下新增 `core / adapters / services / ui` 结构，补齐 `storage-types`、`sync-types`、`sync-engine`、`sync-metadata-idb`、`filesystem-sync-adapter` 等核心模块。
2. 复用现有 IndexedDB 行为作为默认本地层，通过新的 repository 接管文档与 AI 会话的保存、删除、复制和索引修复，并在保存后异步通知同步引擎。
3. 使用 `JSZip` 实现标准 zip 备份导出与导入，补齐 manifest 校验、重复 documentId remap、部分失败报告与索引修复。
4. 新增设置页、首页入口、编辑器菜单入口和全局冲突弹窗，把“数据存储与同步”能力暴露到 UI，同时保持编辑器 `320ms` 自动保存节奏不变。
5. 运行 `npm test`、`npm run build:web` 做回归验证，并尝试执行 `npm run lint`；lint 失败是仓库内既有 React hooks / refs 规则问题，未在本轮一起改动。

## 是否成功解决
- 状态：成功
- 说明：核心功能已经实现并通过全量测试（35 个测试文件 / 230 个测试）及 Web 构建验证；`lint` 仍被仓库中与本任务无关的既有问题阻塞，已作为遗留项记录。

## 相关文件
- src/features/storage/core/storage-types.ts
- src/features/storage/core/sync-types.ts
- src/features/storage/core/content-hash.ts
- src/features/storage/core/mutation-queue.ts
- src/features/storage/core/conflict-manager.ts
- src/features/storage/core/sync-engine.ts
- src/features/storage/adapters/indexeddb/document-idb-adapter.ts
- src/features/storage/adapters/indexeddb/conversation-idb-adapter.ts
- src/features/storage/adapters/indexeddb/local-index-adapter.ts
- src/features/storage/adapters/indexeddb/sync-metadata-idb.ts
- src/features/storage/adapters/indexeddb/legacy-document-local-service.ts
- src/features/storage/adapters/indexeddb/legacy-ai-local-storage.ts
- src/features/storage/adapters/backup/backup-schema.ts
- src/features/storage/adapters/backup/backup-exporter.ts
- src/features/storage/adapters/backup/backup-importer.ts
- src/features/storage/adapters/sync-targets/filesystem-handle-store.ts
- src/features/storage/adapters/sync-targets/filesystem-sync-adapter.ts
- src/features/storage/services/document-repository.ts
- src/features/storage/services/conversation-repository.ts
- src/features/storage/services/workspace-storage-service.ts
- src/features/storage/services/workspace-storage-service.test.ts
- src/features/storage/ui/StorageSettingsPage.tsx
- src/features/storage/ui/StorageConflictDialog.tsx
- src/features/documents/document-service.ts
- src/features/ai/ai-storage.ts
- src/App.tsx
- src/pages/home/HomePage.tsx
- src/pages/editor/MapEditorPage.tsx
- src/test/setup.ts
- package.json
- package-lock.json

## 遗留问题/下一步
- `npm run lint` 仍失败，主要是 `AiSidebar`、`ResizableSplitter`、`TextImportDialog`、`MapEditorPage` 等既有文件的 hooks / refs 规则问题，不属于本轮存储改造新增回归。
- 当前文件夹同步依赖支持 File System Access API 的浏览器；后续如果要推进 P2，可在现有 `SyncTargetAdapter` 基础上接入云同步实现。
- 可继续补充更细粒度的同步冲突 E2E 用例，以及设置页的导入结果可视化细节。
