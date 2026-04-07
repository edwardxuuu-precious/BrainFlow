# 任务记录

## 任务名称
- Markdown 导入诊断加固实现

## 执行时间
- 开始时间：2026-04-05 23:55:15
- 结束时间：2026-04-06 00:11:33

## 仓库根目录
- C:\Users\edwar\Desktop\BrainFlow

## 任务目标
- 按既定方案实现 Markdown 导入诊断加固，避免 `.md` 导入失败时只显示模糊的 `network error`。

## 解决的问题
- 已为 Markdown 导入补齐结构化 transport error 映射，不再把 `.md` 导入失败直接退化成原始 `network error`。
- 已为 `/api/codex/import/preview` 的所有流式事件补充 `requestId`，并贯穿到 import client、job、store 与导入弹窗。
- 已将导入弹窗错误展示改为英文主文案 + 诊断明细，支持展示 `requestId`、阶段、当前文件、HTTP 状态与原始后端错误。
- 已修正导入弹窗的 pipeline badge，不再把 Codex 导入错误地显示成 `Local pipeline`。
- 已补齐 transport / requestId / store / dialog 相关测试，并通过定向测试与前端构建验证。

## 问题原因
- 当前 Markdown 导入走 Codex 预览接口，但前端导入链路对 transport error 的映射不完整，浏览器原始错误会直接显示在弹窗内。
- 导入链路虽然已有 `code`、`rawMessage` 与服务端日志，但中间层没有稳定保留 `requestId`、`kind`、`status`、`stage` 等字段，导致 UI 只能显示扁平字符串。
- 导入弹窗的 pipeline badge 写死为 `Local pipeline`，会进一步误导用户对实际执行路径的判断。

## 尝试的解决办法
1. 扩展 `shared/ai-contract.ts`，为 `CodexApiError` 和 `TextImportStreamEvent` 增加可选 `requestId`。
2. 扩展 `src/features/ai/ai-client.ts` 的 `CodexRequestError`，补齐 `rawMessage` 与 `requestId` 字段，供导入链路复用。
3. 重写 `src/features/import/text-import-client.ts` 的 transport error 映射：
   - 502/503/504 映射为 bridge unavailable
   - 超时映射为 import timeout
   - 非 JSON 500 映射为固定内部错误
   - 结构化错误保留 `code/rawMessage/requestId`
4. 修改 `server/app.ts`，让 `/api/codex/import/preview` 的 status/result/error NDJSON 事件统一携带 `requestId`。
5. 修改 `src/features/import/text-import-job.ts`，保留并透传 `requestId`、`kind`、`status`、`stage`、`currentFileName`。
6. 修改 `src/features/import/text-import-store.ts`，将 `error` 从字符串升级为结构化对象，并在失败时保留完整诊断信息。
7. 修改 `src/features/import/components/TextImportDialog.tsx` 与 `.module.css`，改为动态 pipeline badge，并新增英文主错误 + 诊断明细展示。
8. 修改 `src/pages/editor/MapEditorPage.tsx`，向弹窗传递当前 job mode。
9. 新增/更新测试：
   - `src/features/import/text-import-client.test.ts`
   - `src/features/import/text-import-job.test.ts`
   - `src/features/import/text-import-store.test.ts`
   - `src/features/import/components/TextImportDialog.test.tsx`
   - `server/app.test.ts`
10. 运行 `pnpm vitest run src/features/import/text-import-client.test.ts src/features/import/text-import-job.test.ts src/features/import/text-import-store.test.ts src/features/import/components/TextImportDialog.test.tsx server/app.test.ts` 与 `pnpm build:web` 验证。

## 是否成功解决
- 状态：成功
- 说明：Markdown 导入诊断加固已实现，结构化错误、requestId 透传、英文主错误展示、动态 pipeline badge 和相关测试均已落地，并通过定向测试与前端构建验证。

## 相关文件
- C:\Users\edwar\Desktop\BrainFlow\shared\ai-contract.ts
- C:\Users\edwar\Desktop\BrainFlow\server\app.ts
- C:\Users\edwar\Desktop\BrainFlow\server\app.test.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\ai\ai-client.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\text-import-client.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\text-import-client.test.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\text-import-job.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\text-import-job.test.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\text-import-store.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\text-import-store.test.ts
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\components\TextImportDialog.tsx
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\components\TextImportDialog.module.css
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\components\TextImportDialog.test.tsx
- C:\Users\edwar\Desktop\BrainFlow\src\pages\editor\MapEditorPage.tsx

## 遗留问题/下一步
- 真实 `.md` 文件若再次触发失败，可直接根据弹窗中的 `requestId` 与阶段信息在服务端日志中精确定位。
- 当前 `MapEditorPage` 产物体积仍有 Vite 500k chunk 警告，但与本次导入诊断修复无直接关系，未在本次任务中处理。
