# 任务记录

## 任务名称
- 统一“云端/主库”同步链路并修复冲突提示误导

## 执行时间
- 开始时间：2026-04-12 14:12:09 +08:00
- 结束时间：2026-04-12 14:23:43 +08:00

## 仓库根目录
- `c:\Users\edwar\Desktop\BrainFlow`

## 任务目标
- 排查当前同步链路里“云端”到底指向哪里。
- 将用户可见的同步/冲突文案统一为本机 Postgres 主库。
- 修复由旧“云端”表述带来的冲突提示和状态展示误导。

## 解决的问题
- 确认当前产品里的“云端”并不是外部云数据库，而是通过同步 API 访问的权威记录；在当前部署里，这个权威记录就是本机 Postgres 主库。
- 将冲突弹窗、时间规则分析、保存状态指示器、设置页和首页工作区摘要中的用户可见文案统一改为“主库 / Postgres”语义。
- 修复首页工作区摘要初始化时先落到回退状态的问题，避免明明拿得到主库工作区信息却仍显示“未初始化工作区”。

## 问题原因
- 早期同步协议和本地缓存层使用了 `cloudRecord / use_cloud / cloudSync` 这套命名，但现在实际部署已切换为本机 Postgres 主库，用户可见文案没有同步更新。
- 冲突弹窗和状态提示继续展示“云端版本”，容易让人误以为系统还依赖外部云数据库。
- 首页工作区摘要首屏只走了本地回退状态，导致主库状态读取完成前容易展示错误占位信息。

## 尝试的解决办法
1. 梳理冲突分析、冲突弹窗、保存状态、设置页和首页工作区摘要中的“cloud”语义，区分内部协议字段与用户可见文案。
2. 将用户可见文案统一改为“主库 / Postgres 权威版本”，同时在共享协议上补充注释，说明 `use_cloud` 只是历史协议名，当前指向本机 Postgres 主库。
3. 重写首页工作区摘要初始化逻辑，首次加载直接刷新主库状态，再补跑与这条链路相关的 UI/同步回归测试。

## 是否成功解决
- 状态：成功
- 说明：用户界面不再把 Postgres 主库误称为“云端”，首页/设置页/冲突弹窗/保存提示都围绕主库语义展示，相关测试已通过。

## 相关文件
- `shared/sync-contract.ts`
- `src/components/SaveIndicator.tsx`
- `src/features/storage/sync/conflict-analysis.ts`
- `src/features/storage/ui/StorageConflictDialog.tsx`
- `src/features/storage/ui/StorageConflictDialog.test.tsx`
- `src/features/storage/ui/StorageConflictExperience.test.tsx`
- `src/features/storage/ui/StorageSettingsPage.tsx`
- `src/features/storage/ui/StorageSettingsPage.test.tsx`
- `src/pages/home/HomeWorkspaceSummary.tsx`
- `src/pages/home/HomePage.test.tsx`

## 遗留问题/下一步
- 内部协议字段名 `cloudRecord / use_cloud / cloudSync*` 仍保留以减少大范围重构风险；如果后续需要彻底重命名，可以单独做一轮协议层迁移。
