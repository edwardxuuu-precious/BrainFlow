# 任务记录

## 任务名称
- 排查 AI 侧栏状态检查失败中的 spawn EINVAL

## 执行时间
- 开始时间：2026-04-04 20:52:00
- 结束时间：2026-04-04 21:05:40

## 仓库根目录
- `c:\Users\edwar\Desktop\BrainFlow`

## 任务目标
- 确认 `spawn EINVAL` 的真实来源、触发条件和修复方向。

## 解决的问题
- 确认 `spawn EINVAL` 根因来自 Windows fallback 显式执行 `codex.cmd`。
- 修复了 `codex-runner` 的 Windows 命令解析顺序与不可执行候选判定。
- 验证本地 runner 和当前 `8787` 状态接口都已恢复为 `ready: true`。

## 问题原因
- 当前机器 `where codex` 会先命中 npm shim。
- 当 bridge 进程未能直接通过 `spawn('codex', ...)` 解析 CLI 时，会退回显式执行 `AppData\\Roaming\\npm\\codex.cmd`。
- 在当前 Windows + Node 24 环境下，显式 `spawn(...codex.cmd)` 会抛 `EINVAL`，而旧逻辑把它当成内部异常直接冒泡，导致状态检查失败。

## 尝试的解决办法
1. 检查 bridge 状态链路与 Codex CLI 启动逻辑。
2. 复现或定位 `spawn EINVAL` 的具体命令和参数。
3. 调整 Windows fallback 候选顺序，优先尝试 VS Code bundled `codex.exe`，只把 `codex.cmd` 保留为次选。
4. 将 `EINVAL / EFTYPE` 视为“候选不可直接执行”，继续尝试下一个候选，而不是直接抛错。
5. 补充 `codex-runner` 单测，并运行定向测试、完整构建和本地 `/api/codex/status` 验证。

## 是否成功解决
- 状态：成功
- 说明：`server/codex-runner.ts` 已修复，定向测试与构建通过，当前状态接口返回 `ready: true`。

## 相关文件
- `server/codex-runner.ts`
- `server/codex-runner.test.ts`

## 遗留问题/下一步
- 如果本地已经长时间运行旧的 `pnpm dev` 进程，重启后可以确保 bridge 用上最新逻辑。
