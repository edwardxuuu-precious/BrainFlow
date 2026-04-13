# 任务记录

## 任务名称
- 改为按时间判定冲突并展示 diff 供用户确认

## 执行时间
- 开始时间：2026-04-12 13:48:30 +08:00
- 结束时间：2026-04-12 14:23:43 +08:00

## 仓库根目录
- `c:\Users\edwar\Desktop\BrainFlow`

## 任务目标
- 去掉当前文档冲突环节对 AI 判定的依赖。
- 改为按更新时间直接给出推荐版本。
- 在冲突弹窗中展示本地版与主库版 diff，供用户确认选择。

## 解决的问题
- 冲突分析链路不再依赖 AI 或外部 Codex 分析接口，直接按记录状态和更新时间生成推荐结论。
- 冲突弹窗新增结构化 diff 展示，用户可以在确认前直接对比本地与主库版本差异。
- 设置页和冲突体验相关测试已经更新，待处理冲突会在启动时自动生成时间规则建议。

## 问题原因
- 原实现把部分冲突分析交给 AI，导致分析来源、失败回退和用户预期之间存在偏差。
- 冲突弹窗虽然能展示推荐动作，但没有把足够直观的差异信息摆到用户面前，确认成本高。

## 尝试的解决办法
1. 梳理客户端与服务端的冲突分析链路。
2. 改为纯规则分析：按更新时间推荐最新版本。
3. 在冲突弹窗中补充可读 diff 展示，并更新测试。
4. 修复设置页和相关测试中的编码/文案问题，保证这条链路可以稳定回归。

## 是否成功解决
- 状态：成功
- 说明：冲突分析已改为纯时间规则，冲突弹窗已补充差异展示，相关测试全部通过。

## 相关文件
- `src/features/storage/sync/conflict-analysis.ts`
- `src/features/storage/sync/cloud-sync-orchestrator.ts`
- `src/features/storage/ui/StorageConflictDialog.tsx`
- `src/features/storage/ui/StorageConflictDialog.test.tsx`
- `src/features/storage/ui/StorageConflictExperience.test.tsx`
- `src/features/storage/ui/StorageSettingsPage.tsx`
- `src/features/storage/ui/StorageSettingsPage.test.tsx`

## 遗留问题/下一步
- 后续如果需要彻底删除遗留的 AI 冲突分析接口，可以再做一轮协议层清理。
