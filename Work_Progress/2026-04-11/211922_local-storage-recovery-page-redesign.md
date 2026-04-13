# 任务记录

## 任务名称
- 本机存储与恢复页重设计

## 执行时间
- 开始时间：2026-04-11 21:19:22
- 结束时间：2026-04-11 21:41:30

## 仓库根目录
- `c:\Users\edwar\Desktop\BrainFlow`

## 任务目标
- 将当前 “Storage & Sync” 页改造成面向本机部署的“本机存储与恢复”运维页。
- 让页面围绕本机 Postgres 主库、浏览器 IndexedDB 缓存和 ZIP/数据库备份恢复重新组织信息架构。
- 增加本机健康状态接口与数据库备份下载接口，并让前端消费新的聚合状态模型。

## 解决的问题
- 新增共享存储运维 contract，拆分服务端原始状态与前端聚合状态。
- 新增 `GET /api/storage/status` 与 `POST /api/storage/backup/database`，支持本机状态检查与数据库备份下载。
- 将 `scripts/backup-postgres.ts` 背后的 `pg_dump` 逻辑抽成复用模块，HTTP 路由与 CLI 复用同一实现。
- `workspaceStorageService` 新增本机运维聚合能力，能汇总服务端状态、浏览器缓存状态、冲突计数与 legacy 迁移摘要。
- 重写存储设置页，将首屏改为本机主库视角，主操作改为 ZIP 导出、ZIP 恢复、数据库备份与刷新状态。
- 将冲突处理、旧本地库迁移、同步/运行诊断收进默认折叠的“高级与诊断”区。
- 让恢复结果面板改为按需显示，不再空白常驻。
- 补齐服务端路由测试与页面测试，验证下载头、鉴权、主 CTA 和恢复面板行为。

## 问题原因
- 原页面仍然沿用“云同步中心”的页面心智，文案、按钮和卡片结构与当前“本机 API + 本机 Postgres”部署方式不匹配。
- 现有前端状态模型只覆盖 `cloud-connected / local-only` 两档，不足以表达本机数据库、浏览器缓存、认证与备份能力。
- 数据库备份逻辑原本只在脚本里，无法直接为页面提供统一的下载能力与状态摘要。

## 尝试的解决办法
1. 审查现有存储页、同步状态模型、备份脚本和服务端路由结构，确定最小可落地的本机运维视图模型。
2. 新增 `shared/storage-admin-contract.ts`、`server/postgres-backup.ts`、`server/storage-admin-service.ts`，补齐状态接口与数据库备份下载链路。
3. 扩展 `workspaceStorageService` 聚合服务端状态、浏览器缓存状态和 legacy 摘要，并重写 `StorageSettingsPage.tsx` 与样式。
4. 为 `server/app.test.ts`、`StorageSettingsPage.test.tsx`、既有冲突页测试补齐新路由和新页面结构下的验证。
5. 运行 TypeScript 编译检查、定向 Vitest，以及一次全量 Vitest 验证确认回归面。

## 是否成功解决
- 状态：成功
- 说明：页面已切换为本机主库运维视角，状态接口与数据库备份下载已落地，相关测试通过。全量测试中仅剩既有的 `server/codex-bridge.test.ts` fixture 缺失问题，与本次改动无关。

## 相关文件
- `c:\Users\edwar\Desktop\BrainFlow\shared\storage-admin-contract.ts`
- `c:\Users\edwar\Desktop\BrainFlow\server\postgres-backup.ts`
- `c:\Users\edwar\Desktop\BrainFlow\server\storage-admin-service.ts`
- `c:\Users\edwar\Desktop\BrainFlow\server\app.ts`
- `c:\Users\edwar\Desktop\BrainFlow\server\app.test.ts`
- `c:\Users\edwar\Desktop\BrainFlow\scripts\backup-postgres.ts`
- `c:\Users\edwar\Desktop\BrainFlow\src\features\storage\cloud\storage-admin-api.ts`
- `c:\Users\edwar\Desktop\BrainFlow\src\features\storage\local\legacy-reader.ts`
- `c:\Users\edwar\Desktop\BrainFlow\src\features\storage\services\workspace-storage-service.ts`
- `c:\Users\edwar\Desktop\BrainFlow\src\features\storage\ui\StorageSettingsPage.tsx`
- `c:\Users\edwar\Desktop\BrainFlow\src\features\storage\ui\StorageSettingsPage.module.css`
- `c:\Users\edwar\Desktop\BrainFlow\src\features\storage\ui\StorageSettingsPage.test.tsx`
- `c:\Users\edwar\Desktop\BrainFlow\src\features\storage\ui\StorageConflictExperience.test.tsx`

## 遗留问题/下一步
- `server/codex-bridge.test.ts` 仍依赖缺失的 `docs/test_docs/GTM_main.document-to-logic-map.v2.json`，需要单独补回 fixture 或调整测试数据。
- 如果后续要支持定时数据库备份，需要在当前服务层基础上再增加计划任务与备份目录治理，不建议复用本次页面作为“未来上云”占位入口。
