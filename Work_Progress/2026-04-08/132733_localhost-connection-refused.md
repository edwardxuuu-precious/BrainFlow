# 任务记录

## 任务名称
- BrainFlow 本地 `127.0.0.1` 连接被拒绝排查

## 执行时间
- 开始时间：2026-04-08 13:27:33
- 结束时间：2026-04-08 13:30:07

## 仓库根目录
- C:\Users\Administrator\Desktop\BrainFlow

## 任务目标
- 排查浏览器访问 `127.0.0.1` 时出现 `ERR_CONNECTION_REFUSED` 的原因
- 恢复 BrainFlow 本地可访问状态

## 解决的问题
- 确认 `127.0.0.1` 访问失败不是页面崩溃，而是 BrainFlow 开发服务没有成功监听目标端口
- 复现发现 `corepack pnpm dev` 虽然能启动 `dev-supervisor`，但 `dev-supervisor` 内部又硬编码调用了全局 `pnpm`
- 当前机器没有全局 `pnpm`，导致 `dev:web-only` 和 `dev:server` 两个子进程都立即退出，浏览器因此看到 `ERR_CONNECTION_REFUSED`
- 已将 `dev-supervisor` 改为通过 `npm run ...` 启动子进程，消除对全局 `pnpm` 的依赖
- 已更新 `server/dev-supervisor.test.ts` 对应断言
- 已实际启动本地开发环境并确认前端 `4173`、后端 `8787` 均在监听

## 问题原因
- 开发监督器 `server/dev-supervisor.ts` 在 Windows 和非 Windows 路径里都默认使用 `pnpm` 作为子命令
- 当前环境只有 `corepack pnpm` 可用，没有全局 `pnpm` 可执行文件，因此 supervisor 能起，但真正的 web/api 子进程起不来

## 尝试的解决办法
1. 检查本地监听端口、Node 进程和 `package.json` / `server/dev-supervisor.ts`
2. 用 `corepack pnpm dev` 真实复现，确认报错为 `'pnpm' is not recognized`
3. 修改 `server/dev-supervisor.ts`，把子进程启动命令从 `pnpm <script>` 改为 `npm run <script>`
4. 修改 `server/dev-supervisor.test.ts`，同步更新命令断言
5. 运行 `corepack pnpm test -- server/dev-supervisor.test.ts`
6. 运行 `corepack pnpm build:server`
7. 使用 `npm run dev` 后台真实启动，并验证 `127.0.0.1:4173` 与 `127.0.0.1:8787` 监听成功

## 是否成功解决
- 状态：成功
- 说明：本地连接被拒绝的问题已修复，当前开发环境已经成功启动并可访问

## 相关文件
- server/dev-supervisor.ts
- server/dev-supervisor.test.ts
- package.json

## 遗留问题/下一步
- 如需停止当前已启动的本地服务，可结束本次 `npm run dev` 启动的相关 Node 进程
- AI 侧部分提示文案仍写着 `pnpm dev`，后续可视情况统一改成更通用的 `npm run dev` / `corepack pnpm dev`
