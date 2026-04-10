# 任务记录

## 任务名称
- 重设计导入弹窗，使其更简洁并贴合 `document-to-logic-map` skill 的连续流程

## 执行时间
- 开始时间：2026-04-09 21:35:39 +08:00
- 结束时间：2026-04-09 22:13:08 +08:00

## 仓库根目录
- `C:/Users/edwar/Desktop/BrainFlow`

## 任务目标
- 将导入弹窗从旧的三步式分页改为连续工作台布局。
- 收敛导入配置、Skill 状态和结果审阅的层级，使其符合 skill-backed import 的真实流程。
- 用 `Draft / Merge` 双标签取代分页切换，并把调试型信息折叠到细节区。

## 解决的问题
- 去掉了旧的 stepper 和 `Next / Back` 导航，改成顶部 phase rail + 三段式连续工作台。
- 将“Automatic import setup”和“Import progress”合并成单一 `Skill status` 区块。
- 将结果审阅改成 `Draft / Merge` 双标签，按“结构确认”与“待决合并项”拆分。
- 将 diagnostics、repair、pipeline 细节收敛到 `Details` 与 `Show import internals` 开关之后。
- 同步更新组件测试，覆盖新的结构、状态流和交互行为。

## 问题原因
- 旧界面把配置、运行状态和审阅并列铺开，导致首屏信息密度过高。
- 三步式分页要求用户先切页再看结果，与现在 skill 驱动的连续运行过程不一致。
- 调试信息和默认用户决策信息混在一起，弱化了真正重要的导入判断与合并决策。

## 尝试的解决办法
1. 重写 `TextImportDialog.tsx`，把页面结构收敛为 `Prepare`、`Skill status`、`Review` 三段，并新增 phase rail 与 `Draft / Merge` tabs。
2. 重做 `TextImportDialog.module.css` 的关键布局样式，新增 phase、prepare strip、warning note、details、review tabs 等样式类。
3. 重写 `TextImportDialog.test.tsx`，让测试从旧向导模型切换到新的连续工作台模型。
4. 运行定向组件测试、相关导入状态测试和 `tsc` 无输出检查，确认没有打断前端合约。

## 是否成功解决
- 状态：成功
- 说明：导入弹窗已经切换到新的连续工作台设计，组件测试与相关导入测试全部通过。

## 相关文件
- `src/features/import/components/TextImportDialog.tsx`
- `src/features/import/components/TextImportDialog.module.css`
- `src/features/import/components/TextImportDialog.test.tsx`
- `Work_Progress/2026-04-09/213539_import-dialog-redesign.md`

## 遗留问题/下一步
- 可以继续清理样式文件中未再使用的旧 stepper/footer 样式，进一步减小历史负担。
- 如果后续要增强产品感，可以再补一轮视觉微调，例如 phase rail 的动态状态、review 区的更强信息分层和移动端细节优化。
