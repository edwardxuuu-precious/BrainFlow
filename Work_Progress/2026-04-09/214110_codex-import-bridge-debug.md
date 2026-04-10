# 任务记录

## 任务名称
- 排查项目内 Codex 导入预览流中断问题

## 执行时间
- 开始时间：2026-04-09 21:41:10
- 结束时间：2026-04-09 22:04:31

## 仓库根目录
- C:\Users\edwar\Desktop\BrainFlow

## 任务目标
- 分析为什么本地 Codex CLI 状态正常、侧边栏也显示可用，但项目内智能导入/预览链路出现中断与 network error。

## 解决的问题
- 已复现并确认问题不是 Codex 状态检查失效，而是智能导入预览在 `waiting_codex_primary` 阶段长时间无新流事件，导致连接被中间层/客户端按空闲流中断。
- 已验证 `http://127.0.0.1:4173/api/codex/import/preview` 在约 180 秒后结束流，符合当前开发代理空闲超时量级。
- 已验证直连 `http://127.0.0.1:8787/api/codex/import/preview` 也会在约 306 秒后因长时间无新字节而被读取端终止，说明根因是导入流静默时间过长，不是单纯状态接口不可用。
- 已在导入桥接链路中透传 heartbeat 状态事件，避免导入预览长时间无输出。
- 已在导入客户端增加“流提前结束但没有 result/error 终止事件”的结构化报错，避免静默结束或模糊 network error。

## 问题原因
- AI 侧边栏“可用”依赖的是 `/api/codex/status` 和聊天链路，能证明本机 Codex CLI 已登录、bridge 在线，但不能证明智能导入 `/api/codex/import/preview` 这条长时流式请求稳定。
- 智能导入在进入 `waiting_codex_primary` 后，之前只把 runner heartbeat 写入后端日志，没有继续向前端流发送任何状态字节。
- 因为流长时间静默，开发代理或读取端会把连接当作空闲流中断，浏览器侧就表现为 `Stream read failed: network error` 或流提前结束。

## 尝试的解决办法
1. 创建任务记录并确认仓库根目录。
2. 检查 `src/features/import/text-import-client.ts`、`server/app.ts`、`server/codex-bridge.ts`、`server/codex-runner.ts`，确认 AI 聊天与智能导入是不同链路。
3. 通过真实接口复现：
4. 验证 `4173` 与 `8787` 端口监听和 `/api/codex/status` 均正常，排除“服务未启动”。
5. 用真实 `GTM_main.md` 请求导入预览，确认 `4173` 在约 180 秒、`8787` 读取在约 306 秒中断，且中断前最后阶段都是 `waiting_codex_primary`。
6. 修改 `server/codex-bridge.ts`，把 runner heartbeat 透传为导入状态事件，持续刷新 `waiting_codex_primary / waiting_codex_repair`。
7. 修改 `src/features/import/text-import-client.ts`，将“提前 EOF 且没有 terminal event”归一化为结构化导入错误。
8. 补充 `server/codex-bridge.test.ts` 与 `src/features/import/text-import-client.test.ts` 回归测试。
9. 运行 `pnpm vitest run server/codex-bridge.test.ts src/features/import/text-import-client.test.ts server/app.test.ts src/features/import/text-import-job.test.ts src/features/import/text-import-store.test.ts`，相关测试通过。
10. 额外运行包含 `src/features/import/components/TextImportDialog.test.tsx` 的测试集合时，命中仓库内已存在的 `TextImportDialog.tsx` 解析错误，和本次改动无直接关系。

## 是否成功解决
- 状态：成功
- 说明：已定位真实根因并完成代码修复；相关导入桥接与客户端定向测试通过。当前仓库另有 `TextImportDialog.tsx` 解析问题，属于独立已有问题。

## 相关文件
- C:\Users\edwar\Desktop\BrainFlow\Work_Progress\2026-04-09\214110_codex-import-bridge-debug.md
- C:\Users\edwar\Desktop\BrainFlow\server\codex-bridge.ts
- C:\Users\edwar\Desktop\BrainFlow\server\codex-bridge.test.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\text-import-client.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\text-import-client.test.ts

## 遗留问题/下一步
- 如果你当前浏览器连接的是已经启动很久的旧 dev 进程，需确认后端已加载最新修改；必要时重启 `pnpm dev` 或 `pnpm dev:server`。
- 仓库内 [TextImportDialog.tsx](C:\Users\edwar\Desktop\BrainFlow\src\features\import\components\TextImportDialog.tsx) 目前存在独立解析错误，后续应单独修复。
