# 任务记录

## 任务名称
- 清理现有同步冲突与 bug 生成的重复副本

## 执行时间
- 开始时间：2026-04-12 14:30:39 +08:00
- 结束时间：2026-04-12 14:54:27 +08:00

## 仓库根目录
- `c:\Users\edwar\Desktop\BrainFlow`

## 任务目标
- 排查为什么历史文档冲突仍然持续存在。
- 清理系统 bug 生成的链式 `_copy_` 副本与对应冲突。
- 补上自动修复逻辑，避免旧脏数据在刷新后继续复活。

## 解决的问题
- 修复了客户端启动阶段“旧冲突先展示、后台才重算”的问题，初始化现在会等待旧冲突分析回填完成。
- 修复了副本链清理策略，改为直接保留更新时间最新的一份文档，再清理同根 `_copy_` 链的其余副本与关联冲突。
- 补上了 Postgres 主库启动维护逻辑，会自动折叠 bug 生成的 `_copy_` 文档链、删除失效对话、并把残留冲突标记为已解决。
- 新增了一条可重复执行的主库清理脚本，并已实际对本地 `brainflow` Postgres 执行清理。
- 当前工作区 `workspace_local_n9jska2t` 的未解决文档冲突与对话冲突都已清零。

## 问题原因
- 之前只修了“新生成副本时不要串号”，但没有处理已经落进 Postgres 主库的历史 `_copy_` 链文档与残留 `sync_conflicts`。
- 客户端初始化时对旧的 `ready` 冲突分析采用后台回填，页面会先把历史 AI/云端文案和旧冲突直接展示出来，看起来像“修了但还是一直弹”。
- 副本链清理曾优先保留非 `_copy_` 的旧 id，而不是保留更新时间最新的一份，和实际“按时间判定最新版”的预期不一致。
- 主库里还存在引用已删除文档的孤儿对话与对话冲突，导致即使文档副本清了一部分，冲突弹窗仍可能继续出现。

## 尝试的解决办法
1. 检查当前主库里的 `sync_heads` 与 `sync_conflicts` 实际数据。
2. 修改 `CloudSyncOrchestrator.initialize()`，在进入正常同步前等待 `backfillConflictAnalyses()` 完成，确保旧冲突先被重算成最新的时间规则结论。
3. 清理冲突分析文案中的 AI 残留表述，统一成“系统按更新时间/记录状态给建议”。
4. 调整客户端副本链清理策略，改为按 `updatedAt` 选择保留项，并删除其余 bug 生成副本及相关对话/冲突。
5. 在 `PostgresSyncRepository.initialize()` 中加入主库维护：折叠 `_copy_` 文档链、删除引用失效文档的对话、把相关 `sync_conflicts` 标记为已解决。
6. 新增 `scripts/cleanup-sync-copy-conflicts.ts`，并执行 `npx tsx scripts/cleanup-sync-copy-conflicts.ts` 对当前 `brainflow` 主库做一次即时清理。
7. 回归执行服务端、同步层和冲突 UI 测试，确认修复后的链路通过。

## 是否成功解决
- 状态：成功
- 说明：代码修复已落地，当前主库未解决冲突已降为 0，重复 bug 副本已折叠为每组保留一份最新文档并恢复正常标题。

## 相关文件
- `src/features/storage/sync/cloud-sync-orchestrator.ts`
- `src/features/storage/sync/cloud-sync-orchestrator.test.ts`
- `server/repos/postgres-sync-repository.ts`
- `src/features/storage/sync/conflict-analysis.ts`
- `src/features/storage/ui/StorageConflictDialog.tsx`
- `scripts/cleanup-sync-copy-conflicts.ts`
- `package.json`

## 遗留问题/下一步
- 浏览器当前标签页如果已经缓存了旧的 IndexedDB 冲突记录，需要刷新页面一次，让新的启动清理逻辑接管并把本地旧缓存同步收口。
- 主库里保留下来的 2 份有效文档仍沿用历史 `_copy_` id，但标题已恢复为正常名称；这不影响界面使用，如需进一步把内部 id 也迁回原始 id，需要额外做一次受控迁移。
