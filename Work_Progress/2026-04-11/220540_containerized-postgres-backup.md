# 任务记录

## 任务名称
- 改造数据库备份为容器内 pg_dump

## 执行时间
- 开始时间：2026-04-11 22:05:40
- 结束时间：2026-04-11 22:11:45

## 仓库根目录
- c:\Users\edwar\Desktop\BrainFlow

## 任务目标
- 让数据库备份下载不依赖本机安装 pg_dump。
- 优先支持 Docker 容器内 pg_dump。
- 保持管理页状态展示与备份下载链路一致。

## 解决的问题
- 数据库备份不再依赖宿主机安装 `pg_dump`，缺失时会自动回退到 Docker 容器 `brainflow-postgres` 内执行 `pg_dump`。
- 本机状态接口现在能正确识别“本机 pg_dump 可用”或“Docker fallback 可用”，管理页会显示数据库备份可用。
- 真实环境下已成功通过脚本生成 `.dump` 备份，并通过 `POST /api/storage/backup/database` 下载到本机临时文件。

## 问题原因
- 原实现只检查并调用宿主机 `pg_dump`，Windows 本机未安装 PostgreSQL client 时，状态页始终显示数据库备份不可用。
- 备份执行路径和本地 Docker Postgres 部署是割裂的，虽然数据库在容器中运行，但备份逻辑没有复用容器里的 `pg_dump`。

## 尝试的解决办法
1. 重写 `server/postgres-backup.ts`，新增备份可用性检测与双路径执行逻辑：优先本机 `pg_dump`，失败后自动回退到 `docker exec <container> pg_dump`，并统一改为流式写入备份文件。
2. 更新 `server/storage-admin-service.ts`，让 `/api/storage/status` 使用新的备份可用性检测逻辑，而不是单独检查本机 `pg_dump`。
3. 为环境配置补充 `BRAINFLOW_POSTGRES_BACKUP_CONTAINER`，默认容器名为 `brainflow-postgres`，写入 `.env.local` 与 `.env.example`。
4. 新增 `server/postgres-backup.test.ts`，覆盖“本机 pg_dump 缺失时自动回退 Docker”与“通过 Docker fallback 写出备份文件”两条关键路径。
5. 执行 `npx tsc -p tsconfig.json --noEmit`、`npx vitest run server/postgres-backup.test.ts server/app.test.ts`，并实际运行 `node --import tsx .\\scripts\\backup-postgres.ts` 与 `POST /api/storage/backup/database` 做端到端验证。

## 是否成功解决
- 状态：成功
- 说明：容器内 `pg_dump` fallback 已落地，状态接口与下载接口均可用；已在本机生成并下载数据库备份文件。

## 相关文件
- c:\Users\edwar\Desktop\BrainFlow\server\postgres-backup.ts
- c:\Users\edwar\Desktop\BrainFlow\server\storage-admin-service.ts
- c:\Users\edwar\Desktop\BrainFlow\server\postgres-backup.test.ts
- c:\Users\edwar\Desktop\BrainFlow\.env.local
- c:\Users\edwar\Desktop\BrainFlow\.env.example
- c:\Users\edwar\Desktop\BrainFlow\Work_Progress\2026-04-11\220540_containerized-postgres-backup.md

## 遗留问题/下一步
- 当前状态接口返回的 `label` 在部分 PowerShell 输出里仍显示为乱码，但这是终端编码显示问题，不影响页面实际渲染与接口逻辑。
- 若后续要支持非本地 Docker 容器名或远程 Postgres 的更复杂拓扑，可继续把备份 runner 和恢复策略显式展示到前端管理页。
