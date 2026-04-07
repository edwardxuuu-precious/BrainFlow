# 任务记录

## 任务名称
- 精简 Markdown 智能导入预览弹窗布局

## 执行时间
- 开始时间：22:39:41
- 结束时间：22:49:20

## 仓库根目录
- c:\Users\edwar\Desktop\BrainFlow

## 任务目标
- 重新整理智能导入预览弹窗的信息层级，减少重复信息、状态块堆叠和视觉拥挤感。

## 解决的问题
- 将文件上传后的来源信息改为紧凑的只读摘要，不再显示可编辑输入框。
- 把模式提示、进度、语义阶段和导入结果合并进统一状态面板，避免多条横幅堆叠。
- 压缩统计区，只保留与当前导入最相关的概览指标。
- 去掉单文件上传时顶部重复出现两次文件名的问题。
- 更新了对应测试断言，保证新的布局输出持续可验证。

## 问题原因
- 原弹窗把来源信息、统计信息、状态提示和结果摘要拆成多个相邻区块，导致第一屏出现重复内容和视觉噪音。
- 文件导入场景沿用了文本粘贴场景的一部分布局思路，造成上传文件后仍有不必要的展示和操作位。
- 组件测试仍依赖旧的统计文案格式，布局收敛后需要同步更新。

## 尝试的解决办法
1. 重构 `TextImportDialog` 的概览数据生成逻辑，改为统一的 `overviewStats` 映射输出。
2. 将文件导入来源区改造成 `sourceSnapshot`，仅展示上传文件摘要和字符数。
3. 合并 `modeHint`、进度条、语义阶段和 summary 为单个 `statusPanel`。
4. 调整样式网格与卡片结构，减少分散的小块信息。
5. 更新 `TextImportDialog.test.tsx`，使测试断言匹配新的统计展示方式。
6. 启动本地前端并通过 Playwright 实际上传 Markdown 文件验证界面效果与控制台状态。

## 是否成功解决
- 状态：成功
- 说明：界面层级已经明显简化，真实上传预览流程可正常完成，控制台没有新增错误。

## 相关文件
- c:\Users\edwar\Desktop\BrainFlow\src\features\import\components\TextImportDialog.tsx
- c:\Users\edwar\Desktop\BrainFlow\src\features\import\components\TextImportDialog.module.css
- c:\Users\edwar\Desktop\BrainFlow\src\features\import\components\TextImportDialog.test.tsx
- c:\Users\edwar\Desktop\BrainFlow\Work_Progress\2026-04-05\223941_simplify_text_import_dialog_layout.md

## 遗留问题/下一步
- 如果后续还觉得信息密度偏高，可以继续压缩 `Structured preview` 节点卡片的内边距与默认展开深度。
