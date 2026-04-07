# 任务记录

## 任务名称
- Markdown Import 第 1 步布局重构，修复标注混乱与显示不清

## 执行时间
- 开始时间：2026-04-06 09:33:18
- 结束时间：2026-04-06 09:36:07

## 仓库根目录
- C:\Users\edwar\Desktop\BrainFlow

## 任务目标
- 将 Markdown Import 第 1 步拆成独立的 Import source 与 Import progress 两张卡片，修复来源区与进度区混排、文件详情遮挡和层级不清的问题。

## 解决的问题
- 第 1 步页面已拆成独立的 `Import source` 与 `Import progress` 两张卡片，来源信息与导入进度不再混排。
- 文件详情从 absolute 浮层改为 source 卡片内部 inline 展开，避免遮挡进度区。
- 进度区新增 `Import progress` 标题和独立卡片边界，Pipeline badge、状态文案、进度条、Runner status、timeline 统一归入该卡片。
- 补充了组件测试，覆盖第 1 步双卡片展示、无进度时仅显示来源卡、文件详情 inline 展开不影响进度卡等场景。

## 问题原因
- 当前第 1 步把 source 区和进度区直接串联在同一视觉层次里，文件详情还是 absolute 浮层，导致展开和滚动时内容关系混乱。

## 尝试的解决办法
1. 检查 TextImportDialog 当前第 1 步的 DOM 结构与样式，确认 source 和 progress 仍未拆成独立卡片。
2. 将第 1 步重构为 source 卡 + progress 卡两段结构，并把进度内容包进独立 `Import progress` 卡片。
3. 将文件详情从浮层 `fileListPopup` 改成 source 卡内部的 `fileListInline` 展开。
4. 更新组件测试，验证标题分区、inline 展开和状态卡归属。
5. 执行 `pnpm vitest run src/features/import/components/TextImportDialog.test.tsx` 验证定向组件测试。
6. 执行 `pnpm exec tsc -p tsconfig.app.json --noEmit` 与 `pnpm build:web` 进行全量检查，确认失败来自仓库内既有 TS 问题，不是本次布局改动引入。

## 是否成功解决
- 状态：部分成功
- 说明：第 1 步布局问题已修复，相关组件测试通过；但仓库当前存在与本任务无关的全量 TypeScript 构建错误，导致 `pnpm build:web` 无法完全通过。

## 相关文件
- src/features/import/components/TextImportDialog.tsx
- src/features/import/components/TextImportDialog.module.css
- src/features/import/components/TextImportDialog.test.tsx

## 遗留问题/下一步
- 仓库内仍有既有 TypeScript 问题阻塞全量构建：
  - `src/features/import/text-import-job.ts`
  - `src/pages/editor/MapEditorPage.tsx`
  - `server/codex-bridge.ts`
