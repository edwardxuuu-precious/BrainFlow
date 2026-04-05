# 任务记录

## 任务名称
- 排查 `pnpm dev` 启动后 AI 仍显示未连接服务

## 执行时间
- 开始时间：2026-04-04 11:33:41
- 结束时间：2026-04-04 11:37:17

## 仓库根目录
- `c:\Users\edwar\Desktop\BrainFlow`

## 任务目标
- 确认当前 `pnpm dev` 启动后为什么前端仍提示“未连接服务”。
- 定位是 `dev-supervisor`、bridge 进程、8787 端口还是 bridge 启动后的运行时错误。

## 解决的问题
- 已确认当前 `pnpm dev` 下 AI 不工作的直接原因不是前端没启动，也不是本机 `codex` 未登录，而是当时监听 `8787` 的 bridge 进程返回了 `500 Internal Server Error`。
- 已确认 `4173` 和 `8787` 当时都在监听，但 `/api/codex/status` 返回 `500`，前端因此把状态统一显示成“未连接服务”。
- 已验证同一份仓库代码在新进程里直接执行 `createCodexBridge().getStatus()` 能返回 `ready: true`，说明磁盘上的代码和本机 Codex 登录状态本身没有问题。
- 已重启 bridge，并确认当前 `http://127.0.0.1:8787/api/codex/status` 返回 `200` 且 `ready: true`。

## 问题原因
- 当时跑着的 bridge 进程本身处于坏状态，虽然端口已监听，但状态接口内部报错，导致前端请求失败。
- 前端对 `/api/codex/status` 的请求只要失败，就会回退显示“未连接服务 / Prompt 未加载 / Codex 请求失败”这组兜底文案，所以表面上看像是 `pnpm dev` 没起成功，实际上是 bridge 进程坏了。
- 这次排查中，旧 bridge 进程启动时间早于最新修复代码；重启后新的 bridge 进程恢复正常，说明问题落在“正在运行的那个 bridge 实例”，不是当前代码仓库内容本身。

## 尝试的解决办法
1. 检查 `4173`、`8787` 端口和本地 Node 进程，确认前端与 bridge 是否都已启动。
2. 直接访问 `http://127.0.0.1:8787/api/codex/status`，确认 bridge 返回的是 `500` 而不是 `503`。
3. 在同仓库新进程里直接执行 `createCodexBridge().getStatus()`，确认当前代码与本机 Codex 登录状态正常。
4. 停掉旧的 bridge 进程与 `tsx watch server/index.ts` 进程。
5. 重新启动 `pnpm dev:server`，并再次检查 `8787` 状态接口。
6. 验证新的 bridge 进程返回 `200` 和 `ready: true`。

## 是否成功解决
- 状态：成功
- 说明：bridge 已重启并恢复正常，状态接口当前可用。前端只需要刷新页面或点击“重新检查服务”即可恢复 AI 可用状态。

## 相关文件
- `package.json`
- `server/dev-supervisor.ts`
- `server/index.ts`
- `server/dev-proxy.ts`

## 遗留问题/下一步
- 如果页面仍显示旧错误，需要刷新页面或点击“重新检查服务”以获取新的 `status` 结果。
- 为避免前端和 bridge 落入半更新状态，下一步建议在改完 bridge 相关代码后，直接做一次干净重启：停止旧的开发进程后重新运行 `pnpm dev`。
