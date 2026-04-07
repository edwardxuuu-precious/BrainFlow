# 任务记录

## 任务名称
- 修复 Markdown 智能导入预览失败与弹窗交互问题

## 执行时间
- 开始时间：22:26:55
- 结束时间：22:36:38

## 仓库根目录
- c:\Users\edwar\Desktop\BrainFlow

## 任务目标
- 修复智能导入预览中的 `document is not defined` 错误，并处理上传文件场景下预览弹窗中不合理的按钮/布局表现。

## 解决的问题
- 修复了本地 Markdown 导入在 Worker 中报 `document is not defined`、导致预览失败的问题。
- 修复了 `TextImportDialog` 的 Hook 调用顺序错误，消除了打开/关闭弹窗时的 React 控制台报错。
- 调整了文件导入场景的交互：上传文件后不再显示多余的 `Generate preview` 按钮，文件内容改为只读预览，避免和统计信息区挤在一起。

## 问题原因
- Vite 在浏览器环境下优先解析 `decode-named-character-reference` 的 DOM 版入口，`remark-parse` 在 Worker 中间接依赖它后会访问 `document`，从而直接报错。
- `TextImportDialog` 把 `useState/useEffect` 放在 `if (!open) return null` 之后，导致弹窗开关时 Hook 顺序不稳定。
- 文件导入本身已经自动触发预览，但弹窗仍保留手动生成按钮，视觉上和统计区紧挨在一起，交互也不清晰。

## 尝试的解决办法
1. 在 `vite.config.ts` 中为 `decode-named-character-reference` 添加别名，强制 `remark-parse` 解析链使用无 DOM 的 `index.js` 入口。
2. 调整 `TextImportDialog.tsx`，将 Hook 提前到条件返回之前，并新增文件导入场景判断。
3. 在文件导入场景下将来源名称和文本框切为只读预览，同时隐藏手动 `Generate preview` 操作。
4. 调整 `TextImportDialog.module.css`，让操作区右对齐，保持弹窗结构更稳定。
5. 运行单元测试，并用 Playwright 冷启动验证实际文件上传导入流程，确认当前会话控制台无新增错误。

## 是否成功解决
- 状态：成功
- 说明：本地 Markdown 预览能够正常生成，文件导入场景下按钮与错误提示问题均已修复。

## 相关文件
- c:\Users\edwar\Desktop\BrainFlow\vite.config.ts
- c:\Users\edwar\Desktop\BrainFlow\src\features\import\components\TextImportDialog.tsx
- c:\Users\edwar\Desktop\BrainFlow\src\features\import\components\TextImportDialog.module.css
- c:\Users\edwar\Desktop\BrainFlow\src\features\import\components\TextImportDialog.test.tsx
- c:\Users\edwar\Desktop\BrainFlow\Work_Progress\2026-04-05\222655_fix_text_import_preview_failures.md

## 遗留问题/下一步
- 当前冷启动验证已通过，后续如果继续扩展 Markdown Worker 依赖，需注意带浏览器导出条件的包不要再次把 DOM 版入口带入 Worker。
