# 任务记录

## 任务名称
- Markdown Import 弹窗改为三步顺序流

## 执行时间
- 开始时间：2026-04-06 09:07:36
- 结束时间：2026-04-06 09:18:32

## 仓库根目录
- C:\Users\edwar\Desktop\BrainFlow

## 任务目标
- 将 Markdown Import 弹窗从双栏并排结果页改为三步顺序流，第二步单独展示 Structured preview，第三步单独展示 Merge review。

## 解决的问题
- 将 Markdown Import 弹窗从同页双栏结果布局改为三步顺序流。
- 新增顶部步骤导航，支持 `Import source -> Structured preview -> Merge review` 顺序查看。
- 预览生成完成后自动从第 1 步跳到第 2 步。
- Apply 过程中固定停留在第 3 步，并显示独立的应用进度卡片。
- 补充了组件测试，覆盖自动跳步、分页导航、关闭重开重置和 apply 状态展示。

## 问题原因
- 当前弹窗把 Structured preview 与 Merge review 同时堆在一页，信息密度高且不符合顺序型审阅流程。
- 状态时间线和导入源信息与结果审阅内容混在一个视图中，导致流程感弱，也不符合用户期望的顺序型弹窗体验。

## 尝试的解决办法
1. 检查现有 TextImportDialog 组件、样式和测试，确认当前仍为双栏布局。
2. 在组件内部新增本地 step 状态、自动跳步逻辑和 footer 导航逻辑，避免修改 store 对外接口。
3. 将第 1 步限定为导入源与状态区，第 2 步只展示 Structured preview，第 3 步只展示 Merge review。
4. 新增 stepper 与单页滚动布局样式，移除旧的双栏内容区作为主展示方式。
5. 重写并补充组件测试，验证三步流行为。
6. 执行 `pnpm vitest run src/features/import/components/TextImportDialog.test.tsx`、`pnpm exec tsc -p tsconfig.app.json --noEmit`、`pnpm build:web` 进行验证。

## 是否成功解决
- 状态：成功
- 说明：三步顺序流、自动跳步、页间导航与 apply 进度展示已完成，相关测试和前端构建通过。

## 相关文件
- src/features/import/components/TextImportDialog.tsx
- src/features/import/components/TextImportDialog.module.css
- src/features/import/components/TextImportDialog.test.tsx
- Work_Progress/2026-04-06/090736_text_import_dialog_three_step_flow.md

## 遗留问题/下一步
- `MapEditorPage` 打包产物仍有既有的 chunk size warning，但本次改动未引入新的构建失败。
