# 任务记录

## 任务名称
- 导入配置改成默认自动选择，手动覆写收进高级设置

## 执行时间
- 开始时间：2026-04-07 08:26:03
- 结束时间：2026-04-07 08:44:29

## 仓库根目录
- C:\Users\edwar\Desktop\BrainFlow

## 任务目标
- 将导入步骤 1 的 preset 和 archetype 卡片墙改为默认自动选择
- 保留手动覆写，但收进默认折叠的高级设置
- 统一导入规划层的数据流，并补齐自动选择与 UI 的回归测试

## 解决的问题
- 新增了共享的导入策略自动判定，并和 archetype 自动分类一起产出统一的 planning summary
- 将导入 store 的 `importPreset` 改成 `presetOverride`，并新增 `planningSummaries` 状态，保证请求构造和界面展示都来自同一套 resolver
- 重做了 `TextImportDialog` 步骤 1，去掉 preset/archetype 卡片墙，改为自动摘要区和默认折叠的高级设置
- 支持批量导入按文件保留自动判定摘要，文件详情展开后会显示每个文件的策略、archetype 和置信度
- 高级设置在尚未真正开始导入时只更新自动摘要；已有文件/预览时才触发 rerun
- 补齐并通过了 shared、store、Dialog、页面接线和导入核心的定向测试

## 问题原因
- 旧版步骤 1 同时暴露导入策略和 archetype 两组卡片墙，用户在导入前就要先做大量手动决策
- store 之前只保存显式 preset/archetype 选择，没有把“自动判定结果”作为一等状态，导致 UI 展示和实际请求之间没有统一的 planning 抽象
- 批量导入虽然最终结果里有 per-file classification，但步骤 1 没有提前把每个文件的自动选择展示出来

## 尝试的解决办法
1. 在 `shared/text-import-semantics.ts` 新增 `TextImportPreset` 自动评分、置信度判定、planning summary 和统一 resolver，并保留 archetype 自动分类为同一条规划链路
2. 修改 `src/features/import/text-import-store.ts`，用 `presetOverride + archetypeOverride + planningSummaries` 驱动 preview request 和 UI 状态，同时增加 preset rerun 能力
3. 修改 `src/features/import/components/TextImportDialog.tsx/.module.css`，用自动摘要卡片替代选项墙，并加入折叠的高级设置和每文件自动选择展示
4. 修改 `src/pages/editor/MapEditorPage.tsx`，让高级设置在“未开始导入”和“已有预览/文件”两种状态下分别走本地更新或 rerun
5. 更新 `shared/text-import-semantics.test.ts`、`src/features/import/text-import-store.test.ts`、`src/features/import/components/TextImportDialog.test.tsx`，并补跑页面和导入核心相关测试

## 是否成功解决
- 状态：成功
- 说明：步骤 1 已默认走自动选择路径，卡片墙已移除到主流程之外；手动覆写保留在高级设置里，自动规划和 preview request 已对齐，定向测试全部通过

## 相关文件
- shared/ai-contract.ts
- shared/text-import-semantics.ts
- shared/text-import-semantics.test.ts
- src/features/import/text-import-store.ts
- src/features/import/text-import-store.test.ts
- src/features/import/components/TextImportDialog.tsx
- src/features/import/components/TextImportDialog.module.css
- src/features/import/components/TextImportDialog.test.tsx
- src/pages/editor/MapEditorPage.tsx

## 遗留问题/下一步
- 本次没有改步骤 2/3 的结构和编辑能力，只调整了步骤 1 的选择方式
- 本次未跑全量测试和 e2e，后续如果继续收敛导入体验，可再补一轮更大范围回归
