# 任务记录

## 任务名称
- 修复 `SelectionListenerInner` 触发的 Maximum update depth exceeded 循环更新

## 执行时间
- 开始时间：2026-04-07 20:27:58
- 结束时间：2026-04-07 20:32:32

## 仓库根目录
- C:\Users\edwar\Desktop\BrainFlow

## 任务目标
- 根据新的浏览器报错栈，定位 `SelectionListenerInner -> setSelection -> MapEditorPage` 的循环更新根因，并修复编辑页的选择同步逻辑。

## 解决的问题
- 修复了编辑页中 `SelectionListenerInner -> setSelection` 的循环更新链路。
- 将选区标准化为稳定顺序，避免 React Flow 反复上报“同一组选区但顺序不同”时触发无意义状态写回。
- 修正 `editor-store` 中关键 no-op 分支的 Zustand 返回值，避免 `return {}` 被误当作状态更新。

## 问题原因
- `MapEditorPage` 的选区比较按数组顺序判断；React Flow 上报的 `selectedNodes` 顺序可能与当前 store 中的顺序不同，即使选中的节点集合完全相同，也会被误判为新选区。
- `editor-store.ts` 中 `setSelection` 和部分提交 helper 在“无变化”时返回 `{}`。对 Zustand 来说，这不是 no-op，而是一次新的 partial state merge，会继续通知订阅者。
- 两者叠加后，`SelectionListenerInner` 被动 effect 会不断触发 `setSelection`，最终形成 `Maximum update depth exceeded`。

## 尝试的解决办法
1. 创建任务记录并对照新的报错栈定位代码行。
2. 检查 `MapEditorPage.tsx` 与 `editor-store.ts` 的选择同步逻辑。
3. 在 `MapEditorPage.tsx` 中加入按集合比较的选区相等判断，避免仅因顺序变化就调用 `setSelection`。
4. 在 `editor-store.ts` 中加入按文档顺序稳定化选区的逻辑，并把关键 no-op 分支从 `return {}` 改为 `return state`。
5. 在 `editor-store.test.ts` 中增加回归测试，验证“同一组选区不同顺序”不会通知订阅者。
6. 运行 `pnpm test -- --run src/features/editor/editor-store.test.ts src/pages/editor/MapEditorPage.test.tsx`。
7. 运行 `pnpm build:web`。

## 是否成功解决
- 状态：成功
- 说明：编辑器相关测试与前端构建均已通过，当前这条 `SelectionListenerInner` 循环更新链路已在代码层修复。

## 相关文件
- src/pages/editor/MapEditorPage.tsx
- src/features/editor/editor-store.ts
- src/features/editor/editor-store.test.ts
- src/pages/editor/MapEditorPage.test.tsx
- Work_Progress/2026-04-07/202758_selection-listener-maximum-update-depth.md

## 遗留问题/下一步
- 重点核对 React Flow 选区事件与 Zustand 选区写回是否存在双向循环。
- `/api/codex/status` 与 `/api/codex/settings` 的 `503` 仍是独立问题，需要启动本机 bridge 服务后再验证。
