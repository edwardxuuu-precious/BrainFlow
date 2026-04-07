# 任务记录

## 任务名称
- 修复前端 `StoreUpdater` 导致的 Maximum update depth exceeded 报错

## 执行时间
- 开始时间：2026-04-07 20:11:17
- 结束时间：2026-04-07 20:23:11

## 仓库根目录
- C:\Users\edwar\Desktop\BrainFlow

## 任务目标
- 定位并修复前端页面中与 `@xyflow/react`、`StoreUpdater` 或 `/api/codex/*` 请求相关的循环更新问题，恢复页面正常渲染。

## 解决的问题
- 稳定了编辑页传给 `ReactFlow` 的关键回调与配置引用，降低 `StoreUpdater` / `SelectionListener` 在页面重复渲染时反复回写内部 store 的风险。
- 为编辑页补充一条回归测试，校验无关 UI 重渲染不会让 `onSelectionChange`、拖拽回调、`panOnDrag`、`multiSelectionKeyCode`、`proOptions` 等关键 props 反复换引用。
- 确认当前 `/api/codex/status` 与 `/api/codex/settings` 仍返回 `503`，原因是本机 bridge 服务未启动，不属于这次前端无限更新修复本身。

## 问题原因
- `MapEditorPage` 每次普通 UI 状态变化都会重新创建多组传给 `@xyflow/react` 的回调与数组/对象 props。
- `@xyflow/react` 内部的 `StoreUpdater` 和 `SelectionListener` 会按引用变化同步这些 props；当外层组件频繁重渲染时，这类新引用会持续触发内部 store 更新，容易放大成 `Maximum update depth exceeded`。
- `503` 部分是开发环境问题：`127.0.0.1:4173` 代理到 `127.0.0.1:8787` 的 bridge 当前不可达。

## 尝试的解决办法
1. 创建任务记录并收集报错上下文。
2. 检查 `MapEditorPage.tsx` 中与 `ReactFlow`、`StoreUpdater`、`SelectionListener`、`/api/codex/*` 相关的代码路径。
3. 对照 `@xyflow/react` 分发代码，确认 `StoreUpdater` 采用引用比较同步 props，`SelectionListener` 也依赖稳定的 `onSelectionChange` 引用。
4. 将 `MapEditorPage` 里传给 `ReactFlow` 的关键回调提取为稳定的 `useCallback`，并把静态数组/对象 props 提升为模块级常量。
5. 在 `MapEditorPage.test.tsx` 的 React Flow mock 中增加引用变更计数，新增回归测试覆盖“无关 UI 重渲染不应改变关键 canvas props”。
6. 运行 `pnpm test -- --run src/pages/editor/MapEditorPage.test.tsx`。
7. 运行 `pnpm build:web`。
8. 实测 `http://127.0.0.1:4173/api/codex/status` 与 `http://127.0.0.1:4173/api/codex/settings`，确认当前仍为 `503`。

## 是否成功解决
- 状态：部分成功
- 说明：前端针对 `ReactFlow` 循环更新风险的代码修复已完成，定向测试与前端构建通过；但本机 bridge 仍未启动，所以 `codex` 状态与设置接口继续返回 `503`。

## 相关文件
- src/pages/editor/MapEditorPage.tsx
- src/pages/editor/MapEditorPage.test.tsx
- Work_Progress/2026-04-07/201117_react-flow-maximum-update-depth.md

## 遗留问题/下一步
- 如需消除控制台里的 `503`，需要启动本机 bridge 服务并让 `127.0.0.1:8787` 恢复可达。
- 如用户仍能在真实浏览器里稳定复现 `Maximum update depth exceeded`，下一步应结合真实页面操作路径和浏览器控制台时间线继续缩小到具体交互场景。
