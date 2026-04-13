# 任务记录

## 任务名称
- 实现 Postgres 主库化与多设备持久化

## 执行时间
- 开始时间：2026-04-11 20:46:42
- 结束时间：2026-04-11 21:10:09

## 仓库根目录
- `c:\Users\edwar\Desktop\BrainFlow`

## 任务目标
- 将 BrainFlow 从浏览器本地存储主导改为以 Postgres 为事实主库、浏览器为缓存层的同步架构。
- 增加单用户登录、session cookie 与 canonical origin 约束。
- 将旧 IndexedDB 文档库和 AI 会话库改为一次性迁移来源，不再长期双写。
- 保留离线缓存、冲突处理、备份导入导出能力。

## 解决的问题
- 已移除同步层缺省回退到内存仓库的行为，未配置 `BRAINFLOW_SYNC_DATABASE_URL` 时直接报错。
- 已接入单用户认证配置、密码哈希校验、签名 session cookie、`/api/auth/login`、`/api/auth/logout`、`/api/auth/session`。
- 已为前端增加登录门禁与 canonical origin 检查，未登录时阻止进入工作区。
- 已将文档仓库改为只写同步层缓存，不再继续向旧文档库长期双写。
- 已将旧文档库和旧 AI 会话库的读取收敛为一次性迁移，迁移完成后写入本地标记，后续不再重复扫旧库。
- 已为同步缓存补上认证会话快照读取，避免继续生成 `user_stub_default` 的本地记录。
- 已补充 Postgres-only 配置测试、外部登录测试和迁移相关测试调整。
- 已新增 `pg_dump` 备份脚本入口，用于对 Postgres 主库做逻辑备份。

## 问题原因
- 旧实现把文档正文、AI 会话、同步队列分别散落在多个浏览器私有存储中，服务端又允许退化到内存仓库，导致服务重启与多设备间都无法建立稳定持久化。
- 前端长期保留“旧本地库 + 新同步库”双写路径，导致数据主从关系不清晰，也不利于首迁后统一走服务端主库。
- 缺少正式认证身份时，客户端只能用 `stub` 用户占位，缓存和同步记录的语义不一致。

## 尝试的解决办法
1. 审查服务端同步配置、仓库实现、认证入口与前端文档/会话读写路径。
2. 将同步服务改成强制 Postgres 驱动，并移除内存仓库分支。
3. 新增认证配置解析、密码哈希工具、session cookie 读写与登录接口。
4. 在前端增加 `AuthGate`、认证 session 服务、401 失效广播与 canonical origin 提示。
5. 重构文档仓库为同步缓存单写路径，并把 legacy IndexedDB 收敛成一次性迁移来源。
6. 为测试增加同步缓存数据库重置、外部认证覆盖与 Postgres 配置校验。

## 是否成功解决
- 状态：部分成功
- 说明：核心方案已完成并通过类型检查与绝大多数单测；当前仅剩一个与本次改动无关的既有测试阻塞，即 `server/codex-bridge.test.ts` 依赖的 `docs/test_docs/GTM_main.document-to-logic-map.v2.json` fixture 在仓库中缺失。

## 相关文件
- `c:\Users\edwar\Desktop\BrainFlow\server\app.ts`
- `c:\Users\edwar\Desktop\BrainFlow\server\app.test.ts`
- `c:\Users\edwar\Desktop\BrainFlow\server\auth\config.ts`
- `c:\Users\edwar\Desktop\BrainFlow\server\auth\password.ts`
- `c:\Users\edwar\Desktop\BrainFlow\server\auth\session.ts`
- `c:\Users\edwar\Desktop\BrainFlow\server\sync-config.ts`
- `c:\Users\edwar\Desktop\BrainFlow\server\sync-config.test.ts`
- `c:\Users\edwar\Desktop\BrainFlow\src\features\auth\AuthGate.tsx`
- `c:\Users\edwar\Desktop\BrainFlow\src\features\auth\auth-session-cache.ts`
- `c:\Users\edwar\Desktop\BrainFlow\src\features\auth\auth-session-service.ts`
- `c:\Users\edwar\Desktop\BrainFlow\src\features\storage\services\document-repository.ts`
- `c:\Users\edwar\Desktop\BrainFlow\src\features\storage\sync\cloud-sync-orchestrator.ts`
- `c:\Users\edwar\Desktop\BrainFlow\src\features\storage\local\cloud-sync-idb.ts`
- `c:\Users\edwar\Desktop\BrainFlow\src\features\documents\document-service.test.ts`
- `c:\Users\edwar\Desktop\BrainFlow\scripts\backup-postgres.ts`

## 遗留问题/下一步
- 如需全量 `pnpm test` 彻底通过，需要补上 `docs/test_docs/GTM_main.document-to-logic-map.v2.json` fixture，或调整对应测试数据来源。
- 若要达到“定时备份”而非“手动备份”，下一步可将 `pnpm backup:postgres` 接入系统计划任务或容器 sidecar。
