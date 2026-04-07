# 任务记录

## 任务名称
- 修复 BrainFlow 构建错误并整理云服务器上线方案

## 执行时间
- 开始时间：2026-04-07 19:31:00
- 结束时间：2026-04-07 19:45:00

## 仓库根目录
- C:\Users\edwar\Desktop\BrainFlow

## 任务目标
- 修复当前仓库的生产构建错误。
- 给出可上线版本及 3 人规模的云服务器部署方案。
- 解释 IndexedDB 与本地文件数据库的关系。

## 解决的问题
- 修复 `shared/text-import-semantics.ts` 中损坏的字符串与正则字面量，恢复 TypeScript 语法有效性。
- 修复 `server/codex-bridge.test.ts` 中损坏的测试字符串，恢复测试文件可编译状态。
- 修复 `shared/ai-metadata-patch.ts`、`shared/text-import-semantics.test.ts` 在 NodeNext 下缺少 `.js` 扩展名的问题。
- 同步修正 5 个与当前实现脱节的单元测试，保证现有 UI 与数据结构变更下测试仍然有效。
- 新增 `deploy/` 目录，补充云服务器部署说明、Nginx 配置、systemd 服务模板和环境变量模板。
- 完成构建与单元测试验证，当前 `pnpm build` 与 `pnpm test` 均通过。

## 问题原因
- 构建失败的直接原因是部分文本导入语义规划文件中的字符串和正则被编码损坏，导致未闭合字面量和模板字符串。
- 服务端编译失败的直接原因是新增 `shared` 文件未遵守 NodeNext 的显式 `.js` 相对导入规则。
- 单元测试失败主要是测试预期没有同步当前 UI 与数据结构变化，不属于新的构建阻塞。

## 尝试的解决办法
1. 建立任务记录。
2. 检查更深层 AGENTS 约束与当前报错文件。
3. 通过奇数引号/反引号与异常正则模式定位损坏字符串，进行最小化补丁修复。
4. 修复 NodeNext 导入扩展名与测试类型问题。
5. 运行 `pnpm build`，确认前端与服务端均可构建。
6. 运行 `pnpm test`，修正失配测试并确认 217 个单测全部通过。
7. 新增 `deploy/README.md`、`deploy/nginx.brainflow.conf`、`deploy/brainflow-api.service`、`deploy/brainflow.env.example`，整理 3 人规模云服务器部署方案。

## 是否成功解决
- 状态：成功
- 说明：已修复当前构建错误并补齐云端部署资产；构建与单元测试均通过，可进入服务器部署阶段。

## 相关文件
- shared/text-import-semantics.ts
- shared/ai-metadata-patch.ts
- shared/text-import-semantics.test.ts
- server/codex-bridge.test.ts
- src/pages/home/HomePage.test.tsx
- src/features/editor/components/HierarchySidebar.test.tsx
- src/pages/editor/MapEditorPage.test.tsx
- src/features/editor/tree-operations.test.ts
- deploy/README.md
- deploy/nginx.brainflow.conf
- deploy/brainflow-api.service
- deploy/brainflow.env.example

## 遗留问题/下一步
- 在云服务器上按 `deploy/README.md` 安装 Node.js、pnpm、Nginx 和 `codex` CLI。
- 以运行服务的同一 Linux 用户执行 `codex login --device-auth`。
- 部署完成后，验证 `http://127.0.0.1:8787/api/codex/status` 与站点域名下的 `/api/codex/status`。
- 当前未执行 E2E 测试；如上线前还需要更强验证，可再执行 `pnpm test:e2e`。
