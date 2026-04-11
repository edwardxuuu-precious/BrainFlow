# 任务记录

## 任务名称
- 极简导入区改版（仅文件导入）

## 执行时间
- 开始时间：2026-04-11 08:08:49 +08:00
- 结束时间：2026-04-11 08:22:35 +08:00

## 仓库根目录
- c:\Users\edwar\Desktop\BrainFlow

## 任务目标
- 精简 TextImportDialog 顶部 Source 区，仅保留导入按钮与导入后文件名展示。
- 将 Import target、Document type、Show import internals 收纳到 More options 折叠区。
- 保持状态区与 Draft/Merge 主流程不变，并让运行日志默认折叠。

## 解决的问题
- 将 Source 区改为极简结构：Import files 主按钮 + 文件状态条（无文件/单文件/多文件）。
- 移除了文本粘贴入口显示路径（不再展示 Source name、TextArea、Generate draft）。
- 多文件时保留 View files 次级入口，单文件时仅显示文件名与字符数。
- 将导入目标与文档类型下沉至 More options 展开区域。
- 将活动日志默认改为折叠（需要手动展开）。
- 更新并通过相关单测：TextImportDialog.test.tsx 14/14。

## 问题原因
- 原 Source 区首屏承载了过多低频配置与说明信息，影响主路径（导入 -> 查看结果）效率。

## 尝试的解决办法
1. 重构 TextImportDialog.tsx 的输入区结构，删除文本导入显示分支并改为文件导入单路径。
2. 调整 TextImportDialog.module.css，新增紧凑布局（sourcePrimaryRow）并强化文件状态条表现。
3. 更新 TextImportDialog.test.tsx：新增/修改用例覆盖极简输入区、More options 折叠策略、日志默认折叠行为。
4. 执行验证：
   - 
pm run test -- TextImportDialog.test.tsx（通过）
   - 
pm run build:web（失败，失败项为仓库既有 server/codex-bridge.ts 未使用符号，与本次改动无关）

## 是否成功解决
- 状态：成功
- 说明：页面改造目标已完成，相关组件测试通过；全量构建失败为仓库现有未使用变量问题，非本任务引入。

## 相关文件
- c:\Users\edwar\Desktop\BrainFlow\src\features\import\components\TextImportDialog.tsx
- c:\Users\edwar\Desktop\BrainFlow\src\features\import\components\TextImportDialog.module.css
- c:\Users\edwar\Desktop\BrainFlow\src\features\import\components\TextImportDialog.test.tsx

## 遗留问题/下一步
- 如需通过全量 uild:web，需单独清理 server/codex-bridge.ts 的未使用类型与常量（本次未处理）。
