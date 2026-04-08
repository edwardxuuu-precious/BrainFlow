# 任务记录

## 任务名称
- 修复智能导入默认锚点与 projection note 非幂等问题

## 执行时间
- 开始时间：2026-04-08 18:14:34
- 结束时间：2026-04-08 21:08:16

## 仓库根目录
- C:\Users\Administrator\Desktop\BrainFlow

## 任务目标
- 实现智能导入修复方案，解决连续导入默认嵌套和 thinking view note 重复膨胀问题，并补齐回归测试。

## 解决的问题
- 将智能导入默认锚点改为文档根节点，避免连续两次单文件导入默认挂到上一次导入分支下面。
- 为导入弹窗补充显式锚点模式切换，保留“当前选中节点”作为手动嵌套导入选项，并增加说明文案。
- 为 knowledge projection 增加 note 规范化与反规范化逻辑，去掉重复标题、重复摘要和重复 task block，保证多次同步后 note 文本保持稳定。
- 补充对话框、store 与 semantic projection 的回归测试，并跑通导入应用层相关测试。

## 问题原因
- 导入请求构造时默认直接使用 `selection.activeTopicId` 作为锚点，导致连续单文件导入会沿用当前选中分支而不是文档根节点。
- projection 同步会把已经渲染进 note 的标题、summary 和 task 字段再次反序列化回 semantic graph，下一次重建视图时重复拼接，最终造成 note 越同步越长。

## 尝试的解决办法
1. 在 `text-import-store` 中新增 `anchorMode` 状态和锚点解析函数，把默认锚点统一改为 `document.rootTopicId`，仅在显式选择 `current_selection` 时使用当前选中节点。
2. 在 `TextImportDialog` 和 `MapEditorPage` 中补齐锚点模式 UI、当前根节点/选中节点文案以及嵌套提示说明。
3. 在 `shared/text-import-layering.ts` 中新增 note 解析与重建工具，渲染时去重标题、summary、detail 和 task block，反序列化时只保留纯语义 detail 与 task 字段。
4. 补充 `TextImportDialog.test.tsx`、`text-import-store.test.ts` 和 `shared/text-import-layering.test.ts`，并运行相关 `vitest` 定向测试验证回归行为。

## 是否成功解决
- 状态：成功
- 说明：代码修改和定向测试均已完成，默认导入锚点与 projection note 幂等问题已落地修复。

## 相关文件
- C:\Users\Administrator\Desktop\BrainFlow\src\features\import\text-import-store.ts
- C:\Users\Administrator\Desktop\BrainFlow\src\features\import\components\TextImportDialog.tsx
- C:\Users\Administrator\Desktop\BrainFlow\src\features\import\components\TextImportDialog.module.css
- C:\Users\Administrator\Desktop\BrainFlow\src\pages\editor\MapEditorPage.tsx
- C:\Users\Administrator\Desktop\BrainFlow\shared\text-import-layering.ts
- C:\Users\Administrator\Desktop\BrainFlow\src\features\import\components\TextImportDialog.test.tsx
- C:\Users\Administrator\Desktop\BrainFlow\src\features\import\text-import-store.test.ts
- C:\Users\Administrator\Desktop\BrainFlow\shared\text-import-layering.test.ts

## 遗留问题/下一步
- 建议在真实编辑器里按 `GTM_main.md -> GTM_step1.md` 顺序手动验证一次默认导入和“当前选中节点”导入两种路径，确认交互体验与预期一致。
