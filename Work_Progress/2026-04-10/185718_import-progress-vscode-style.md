# 任务记录

## 任务名称
- 智能导入增加 VSCode 风格过程信息

## 执行时间
- 开始时间：2026-04-10 18:57:18
- 结束时间：2026-04-10 19:32:30

## 仓库根目录
- C:\Users\edwar\Desktop\BrainFlow

## 任务目标
- 为智能导入补齐类似 VSCode Codex 面板的运行过程流。
- 在不暴露隐藏 CoT、命令明细、原始 JSON 事件的前提下，展示受控的步骤信息和等待原因。
- 保持现有顶部进度条、诊断区和导入结果行为不回退。

## 解决的问题
- 在共享协议中新增 `progress` 流事件和统一的 `TextImportProgressEntry` 结构。
- 在 `server/codex-bridge.ts` 中把状态更新、runner 观察事件、稳定 Codex 事件摘要整理为统一的过程条目，并支持 heartbeat 通过 `replaceKey` 原地刷新。
- 在 `/api/codex/import/preview` 的 NDJSON 输出中透传 `progress` 事件，并保证 `requestId` 同时出现在事件顶层和嵌套 `entry` 中。
- 在前端导入 client、job、store 中接通 `progress` 事件链路，新增 `progressEntries`，并限制最多保留最近 12 条。
- 在 `TextImportDialog` 中接入 VSCode 风格的过程信息折叠区，运行中默认展开，结束后可折叠查看。
- 补齐服务端、store、client、job、组件和页面测试，并通过类型检查。

## 问题原因
- 之前智能导入只把阶段状态和 heartbeat 文案暴露给前端，没有统一的“过程信息”数据结构。
- runner 的观察事件、Codex 结构化事件和业务阶段状态彼此割裂，前端只能显示顶部状态条，无法还原“正在做什么”和“为什么还在等”。
- 现有对话框样式里已经有 `codexFeed/timeline` 结构，但数据链路没有真正接上。

## 尝试的解决办法
1. 在 `shared/ai-contract.ts` 中新增 `TextImportProgressEntry`、进度 tone/source/attempt 类型，以及 `TextImportStreamEvent` 的 `progress` 分支。
2. 在 `server/codex-bridge.ts` 中新增进度工厂、等待刷新 `replaceKey`、观察事件摘要和稳定 Codex 事件摘要，并把 repair 流程作为独立 attempt 记录。
3. 在 `server/app.ts` 中透传 `progress` NDJSON 事件，并补 `requestId` 注入逻辑。
4. 在 `text-import-client.ts`、`text-import-job.ts`、`text-import-store.ts` 中串联 `progress` 事件，处理批量文件名、requestId 继承、状态转进度条目和去重合并。
5. 在 `TextImportDialog.tsx` 中启用过程时间线 UI，运行中默认展开，完成后保留折叠入口。
6. 更新 `server/app.test.ts`、`server/codex-bridge.test.ts`、`text-import-client.test.ts`、`text-import-job.test.ts`、`text-import-store.test.ts`、`TextImportDialog.test.tsx`、`MapEditorPage.test.tsx`。
7. 清理 `server/codex-bridge.ts` 中等待文案函数的旧死代码，保留单一路径的第一人称等待提示。
8. 执行验证命令：
   - `pnpm vitest run server/app.test.ts server/codex-bridge.test.ts src/features/import/text-import-client.test.ts src/features/import/text-import-job.test.ts src/features/import/text-import-store.test.ts src/features/import/components/TextImportDialog.test.tsx src/pages/editor/MapEditorPage.test.tsx`
   - `pnpm tsc --noEmit`

## 是否成功解决
- 状态：成功
- 说明：实现已落地，针对本次改动的测试和 TypeScript 类型检查均通过。

## 相关文件
- shared/ai-contract.ts
- server/app.ts
- server/app.test.ts
- server/codex-bridge.ts
- server/codex-bridge.test.ts
- src/features/import/text-import-client.ts
- src/features/import/text-import-client.test.ts
- src/features/import/text-import-job.ts
- src/features/import/text-import-job.test.ts
- src/features/import/text-import-store.ts
- src/features/import/text-import-store.test.ts
- src/features/import/components/TextImportDialog.tsx
- src/features/import/components/TextImportDialog.test.tsx
- src/pages/editor/MapEditorPage.tsx
- src/pages/editor/MapEditorPage.test.tsx

## 遗留问题/下一步
- 当前过程信息仍是受控摘要，不支持原始 JSON 查看，这与本次产品约束一致；若后续需要调试视图，应单独设计仅开发态可见的事件面板。
- `server/codex-bridge.ts` 中仍有部分旧中文文案和历史编码痕迹，后续如果继续整理该文件，建议顺手统一编码和文案风格。
