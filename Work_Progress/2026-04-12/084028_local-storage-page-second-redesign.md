# 任务记录

## 任务名称
- 本机存储与恢复页二次重设计

## 执行时间
- 开始时间：2026-04-12 08:40:28
- 结束时间：2026-04-12 08:52:44

## 仓库根目录
- `c:\Users\edwar\Desktop\BrainFlow`

## 任务目标
- 按既定方案重构“本机存储与恢复”页的信息架构与视觉层级。
- 将页面调整为“先看结论，再做操作，最后看管理与诊断”的单页流程。
- 同步更新样式与测试，验证关键交互不回退。

## 解决的问题
- 将“本机存储与恢复”页重构为按顺序展开的单页流程，首屏先给运行结论与三项主操作。
- 取消原先四张等权状态卡并排展示，改为纵向“核心状态”分区，分别显示当前状态、数据位置、缓存与同步、当前身份。
- 将工作区管理下沉到主流程之后，保留切换和删除动作，但弱化视觉优先级。
- 保持高级与诊断区默认折叠，并在有冲突、同步异常或 legacy 数据可迁移时通过折叠头部给出提醒。
- 将恢复结果收拢到主操作附近，默认只显示摘要，详细项放入折叠区。
- 更新页面测试，覆盖新的首屏层级，并回归冲突体验相关用例。

## 问题原因
- 旧页面把说明文本、状态信息、操作入口和管理区块放在同一视觉层级，导致扫描路径混乱。
- 多个状态卡并排展示但没有优先级，用户很难先看到“现在是否正常”和“下一步该做什么”。
- 恢复反馈和高级诊断散落在页面不同位置，操作后难以快速确认结果。

## 尝试的解决办法
1. 创建本轮任务记录并确认当前工作区状态。
2. 重写 `StorageSettingsPage.tsx`，按“总览、主操作、恢复结果、核心状态、工作区管理、高级与诊断”重排页面结构。
3. 重写 `StorageSettingsPage.module.css`，移除四列卡片布局，改为纵向 section stack 和更克制的运维面板样式。
4. 更新 `StorageSettingsPage.test.tsx`，让断言对新的首屏层级和默认折叠高级区负责。
5. 运行 `pnpm vitest run src/features/storage/ui/StorageSettingsPage.test.tsx src/features/storage/ui/StorageConflictExperience.test.tsx` 验证页面与冲突体验。

## 是否成功解决
- 状态：成功
- 说明：页面结构、文案密度和信息优先级已按方案重构完成，相关 Vitest 用例通过。

## 相关文件
- `c:\Users\edwar\Desktop\BrainFlow\src\features\storage\ui\StorageSettingsPage.tsx`
- `c:\Users\edwar\Desktop\BrainFlow\src\features\storage\ui\StorageSettingsPage.module.css`
- `c:\Users\edwar\Desktop\BrainFlow\src\features\storage\ui\StorageSettingsPage.test.tsx`
- `c:\Users\edwar\Desktop\BrainFlow\src\features\storage\ui\StorageConflictExperience.test.tsx`

## 遗留问题/下一步
- 如需进一步打磨视觉，可以在真实浏览器中再调整细节间距和弱状态色，但当前信息架构与交互已完成。
