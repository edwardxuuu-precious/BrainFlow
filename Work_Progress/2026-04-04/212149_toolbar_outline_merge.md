# 任务记录

## 任务名称
- 编辑器工具栏合并目录模式

## 执行时间
- 开始时间：2026-04-04 21:21:49
- 结束时间：2026-04-04 21:31:36

## 仓库根目录
- `c:\Users\edwar\Desktop\BrainFlow`

## 任务目标
- 将左侧目录栏移除，把目录树并入顶部工具栏，作为右侧统一侧栏中的一个新模式。

## 解决的问题
- 将左侧独立目录侧栏从编辑器布局中移除，目录树改为顶部工具栏中的一个新模式按钮，并统一在右侧侧栏容器中显示。
- 右侧侧栏现在支持 `目录 / 详情 / 标记 / 格式 / AI` 五种模式，重复点击当前模式按钮会收起右侧侧栏。
- 目录组件的收起文案与说明文案改为右侧面板语义，并同步调整了相关单测和 e2e 测试。
- 修复了相关 e2e 测试里依赖旧按钮名称和旧目录新增入口的历史问题，使验证路径与当前 UI 一致。

## 问题原因
- 顶部工具栏和左右侧栏职责重复，目录树仍停留在左侧独立布局，不符合统一侧栏模式。

## 尝试的解决办法
1. 调整编辑器页面的模式状态和布局结构。
2. 将目录树接入右侧侧栏模式并更新相关测试。
3. 重写相关 e2e 断言，使目录操作先通过顶部 `目录` 按钮打开后再验证右侧树结构。
4. 运行定向 vitest、生产构建和定向 Playwright 用例确认无回归。

## 是否成功解决
- 状态：成功
- 说明：编辑器已完成顶部工具栏合并目录模式，相关单测、构建与定向 e2e 校验均已通过。

## 相关文件
- `src/pages/editor/MapEditorPage.tsx`
- `src/pages/editor/MapEditorPage.module.css`
- `src/features/editor/components/HierarchySidebar.tsx`
- `src/pages/editor/MapEditorPage.test.tsx`
- `src/features/editor/components/HierarchySidebar.test.tsx`
- `src/test/e2e/brainflow.spec.ts`

## 遗留问题/下一步
- 如需进一步收敛历史状态字段，可在后续单独清理 `leftSidebarOpen` 的持久化读写，但本次未做数据迁移。
