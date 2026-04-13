# 任务记录

## 任务名称
- 排查并修复 `/api/sync/bootstrap` 500 错误

## 执行时间
- 开始时间：2026-04-12 12:04:49
- 结束时间：2026-04-12 12:11:17

## 仓库根目录
- `C:\Users\edwar\Desktop\BrainFlow`

## 任务目标
- 定位前端同步初始化请求 `/api/sync/bootstrap` 返回 500 的原因，并完成可验证的修复。

## 解决的问题
- 修复了本地缓存其实已经是已同步快照、但 `bootstrapCompletedAt` 丢失时仍强制调用 `/api/sync/bootstrap`，从而反复触发 500 的问题。
- 修复了本地缓存为空且服务端工作区不存在时，恢复逻辑可能反复保持“未 bootstrap”状态的问题，避免空工作区持续重复恢复。
- 新增回归测试，覆盖“已同步缓存丢失 bootstrap 标记时应先 pull 恢复，而不是重新 bootstrap”的场景。

## 问题原因
- 同步编排器此前只用 `bootstrapCompletedAt` 判断是否需要 bootstrap，没有区分“从未上云的本地种子缓存”和“已同步但状态记录丢失的云端快照缓存”。
- 对于已经带有服务端版本号的缓存记录，重新调用 bootstrap 会命中服务端“仅允许新建或空工作区 bootstrap”的保护逻辑，导致 `/api/sync/bootstrap` 返回错误。

## 尝试的解决办法
1. 创建任务记录并梳理报错链路。
2. 检查 `cloud-sync-orchestrator.ts`、`sync-service.ts`、`postgres-sync-repository.ts` 的 bootstrap / push / pull 恢复路径，确认 500 发生在客户端误判而非路由不可用。
3. 在同步编排器中新增缓存判定逻辑：若当前工作区缓存已有 `version > 0` 的记录，则优先走 `push/pull` 恢复，而不是直接 bootstrap。
4. 在 `pull` 返回 404 时补上“空缓存直接标记恢复完成，有缓存则再 bootstrap”的分支，避免空工作区重复进入恢复循环。
5. 为该回归点新增 Vitest 用例，并运行相关测试与 ESLint 校验。

## 是否成功解决
- 状态：成功
- 说明：启动同步不再把已同步缓存误判为未初始化缓存，`/api/sync/bootstrap` 的 500 循环已从客户端恢复逻辑上消除，相关定向测试与 lint 校验通过。

## 相关文件
- `Work_Progress/2026-04-12/000000_sync-bootstrap-500.md`
- `src/features/storage/sync/cloud-sync-orchestrator.ts`
- `src/features/storage/sync/cloud-sync-orchestrator.test.ts`

## 遗留问题/下一步
- 如仍需进一步收敛控制台噪音，可考虑后续把服务端“非空工作区 bootstrap”从通用 500 再细化为显式业务状态码，但当前主问题已由客户端恢复策略修复。
