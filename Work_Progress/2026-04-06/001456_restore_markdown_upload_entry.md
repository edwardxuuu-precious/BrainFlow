# 任务记录

## 任务名称
- 恢复 Smart Import 的 Markdown 上传入口

## 执行时间
- 开始时间：2026-04-06 00:14:56
- 结束时间：2026-04-06 00:15:39

## 仓库根目录
- C:\Users\edwar\Desktop\BrainFlow

## 任务目标
- 修复 Smart Import 弹窗初始空态看不到上传文档入口的问题，同时保留粘贴文本导入能力。

## 解决的问题
- 已恢复 Smart Import 弹窗在空态与文件态下都可见的 `Choose Files` 上传入口。
- 已保留当前文件态的紧凑摘要与展开文件列表，不回退到旧版布局。
- 已保持粘贴文本输入与上传文件入口共存，空态可同时使用两种导入方式。
- 已补充空态与文件态的上传入口可见性测试，并通过定向测试与前端构建验证。

## 问题原因
- 最近整理导入弹窗布局时，把 `Choose Files` 移进了 `isFileImportSource === true` 的分支，空态无法触发文件选择。

## 尝试的解决办法
1. 核对 `TextImportDialog` 当前分支逻辑与 `MapEditorPage` 的文件输入触发方式，确认上传按钮被放进 `isFileImportSource === true` 分支。
2. 在 `TextImportDialog.tsx` 中新增共享的 `inputHeader`，把 `Choose Files` 提升为输入面板公共入口。
3. 保持文件态 `sourceFileBar` 仅负责展示已选文件摘要与展开列表，不再承担上传入口职责。
4. 更新 `TextImportDialog.test.tsx`，新增空态与文件态下上传按钮可见性的断言。
5. 运行 `pnpm vitest run src/features/import/components/TextImportDialog.test.tsx src/features/import/text-import-store.test.ts` 与 `pnpm build:web` 验证。

## 是否成功解决
- 状态：成功
- 说明：上传入口回归已修复，空态重新可见 `Choose Files`，文件态仍保留现有摘要布局，定向测试与前端构建均通过。

## 相关文件
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\components\TextImportDialog.tsx
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\components\TextImportDialog.test.tsx
- C:\Users\edwar\Desktop\BrainFlow\src\features\import\components\TextImportDialog.module.css

## 遗留问题/下一步
- 当前 `MapEditorPage` 产物仍有 Vite 500k chunk 警告，但与本次上传入口回归修复无关，未在本次处理。
