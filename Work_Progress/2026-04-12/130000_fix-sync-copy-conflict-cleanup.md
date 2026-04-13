# 任务记录

## 任务名称
- 修复冲突副本串号并全量清理异常脑图副本

## 执行时间
- 开始时间：2026-04-12 13:00:00 +08:00
- 结束时间：2026-04-12 13:36:22 +08:00

## 仓库根目录
- `c:\Users\edwar\Desktop\BrainFlow`

## 任务目标
- 修复 `save_local_copy` 在冲突处理中生成错误副本身份的问题，保证副本 envelope 与 payload 内部身份一致。
- 增加客户端对历史坏副本的归一化、启动清理与纠正性同步回写，避免重复弹冲突和重复生成脑图副本。
- 重写重复标题修复逻辑，按全局唯一规则重新分配标题，避免继续制造重复的 `(2)`、`(3)`。

## 解决的问题
- 服务端 `save_local_copy` 生成的副本现在会同时修正 envelope `id`、payload `id/sessionId`、`updatedAt`、`syncStatus`，并基于修正后的 payload 重算 hash。
- 客户端在落地 authoritative record 和启动扫描缓存时，会识别并修复历史坏副本，并清理同实体的异常 `conflict`/pending 状态后补发标准 `upsert`。
- 启动后的重复标题修复改为全局遍历分配唯一标题，不再只在局部分组里修复，避免保留两个相同的 `(2)` 标题。
- 增加了服务端仓库测试、同步编排测试、启动清理测试和重复标题连锁回归测试。

## 问题原因
- 服务端原先在 `save_local_copy` 分支只修改了副本记录外层 `id`，没有同步修改 payload 内部 `id/sessionId`，还把副本状态保留成了 `conflict`。
- 客户端此前不会在 authoritative record 落地前归一化这些历史坏副本，也不会在启动时清理坏副本缓存，因此坏副本会反复被当成原文档或冲突文档继续参与同步。
- 重复标题修复逻辑按同名分组局部处理，遇到已经存在的编号标题时，无法全局避让，导致继续制造新的重名副本标题。

## 尝试的解决办法
1. 新增共享副本构造工具 `server/repos/sync-copy-record.ts`，让内存仓库和 Postgres 仓库统一走同一份 `save_local_copy` 记录构造逻辑。
2. 修改 `server/repos/in-memory-sync-repository.ts` 与 `server/repos/postgres-sync-repository.ts`，统一使用共享 helper 生成副本记录。
3. 修改 `src/features/storage/sync/cloud-sync-orchestrator.ts`，在 authoritative record 落地和启动阶段统一归一化坏副本，保存修正记录，删除同实体残留 conflict/pending 状态，并补发标准 `upsert`。
4. 修改 `src/features/storage/services/document-repository.ts`，把重复标题修复重写为按 `updatedAt` 排序的全局唯一标题分配。
5. 补充并通过定向测试：
   - `npx vitest run server/repos/in-memory-sync-repository.test.ts src/features/storage/sync/cloud-sync-orchestrator.test.ts src/features/documents/document-service.test.ts`
   - `npx vitest run src/features/storage/services/workspace-storage-service.test.ts`

## 是否成功解决
- 状态：成功
- 说明：核心逻辑、客户端清理链路和标题修复逻辑均已实现，相关定向测试全部通过。

## 相关文件
- `server/repos/sync-copy-record.ts`
- `server/repos/in-memory-sync-repository.ts`
- `server/repos/postgres-sync-repository.ts`
- `server/repos/in-memory-sync-repository.test.ts`
- `src/features/storage/sync/cloud-sync-orchestrator.ts`
- `src/features/storage/sync/cloud-sync-orchestrator.test.ts`
- `src/features/storage/services/document-repository.ts`
- `src/features/documents/document-service.test.ts`

## 遗留问题/下一步
- 当前只验证了与本次修复直接相关的定向测试，若后续继续调整同步状态机，可再补跑更大范围的存储与冲突相关测试集。
- 历史坏副本会在用户当前 workspace 启动时被逐步修正并通过正常同步回写云端；如线上已有大量异常数据，可考虑追加一次诊断脚本或后台巡检。
