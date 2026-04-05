# 任务记录

## 任务名称
- 将右侧栏改为顶部统一入口、侧栏单内容区

## 执行时间
- 开始时间：2026-04-04 20:10:00
- 结束时间：2026-04-04 20:36:40

## 仓库根目录
- `c:\Users\edwar\Desktop\BrainFlow`

## 任务目标
- 将 `详情 / 标记 / 格式 / AI` 统一放到顶部工具栏作为唯一入口。
- 移除右侧栏内部的页面级切换器，侧栏只显示当前模式内容。
- 保留 `标记 / 贴纸` 与 `样式 / 画布` 这类模式内子切换。

## 解决的问题
- 顶部工具栏现在统一提供 `详情 / 标记 / 格式 / AI` 四个入口，右侧栏不再显示页面级切换器。
- 点击当前激活模式按钮会直接收起右侧栏；再次通过顶部按钮或右侧 rail 打开时，会恢复上次模式。
- `标记 / 贴纸` 与 `样式 / 画布` 子切换仍保留在对应面板内部，没有被误删。
- 删除了已废弃的 `EditorSidebarTabs` 组件，并同步修正编辑页、属性面板和 e2e 断言。

## 问题原因
- 当前顶部与右侧栏同时承担模式切换，交互重复。
- 右侧栏内部 `tablist` 与顶部模式入口并存，不符合目标的 XMind 风格。
- 旧测试大量依赖 `role="tab"` 语义，重构后如果不一起调整会持续误报失败。

## 尝试的解决办法
1. 核对当前 `MapEditorPage`、右侧面板和模式切换状态流。
2. 移除右侧栏内部页面级 tab，把切换职责收口到顶部工具栏和 rail。
3. 为 `详情 / 标记 / 格式 / AI` 四个面板补上各自独立的标题说明和收起按钮，保留模式内子切换。
4. 删除未再使用的 `EditorSidebarTabs` 与对应样式文件。
5. 更新 `MapEditorPage.test.tsx`、`PropertiesPanel.test.tsx` 和 `brainflow.spec.ts`，把断言改成顶部按钮驱动。
6. 运行定向测试与完整构建，修正测试里对默认展开状态和未使用变量的旧假设。

## 是否成功解决
- 状态：成功
- 说明：顶部统一入口和右栏单内容区已经按计划生效，定向测试与完整构建均通过。

## 相关文件
- `src/pages/editor/MapEditorPage.tsx`
- `src/pages/editor/MapEditorPage.test.tsx`
- `src/features/editor/components/PropertiesPanel.tsx`
- `src/features/editor/components/PropertiesPanel.test.tsx`
- `src/features/editor/components/MarkersPanel.tsx`
- `src/features/editor/components/FormatPanel.tsx`
- `src/features/ai/components/AiSidebar.tsx`
- `src/features/ai/components/AiSidebar.module.css`
- `src/test/e2e/brainflow.spec.ts`
- `src/features/editor/components/EditorSidebarTabs.tsx`
- `src/features/editor/components/EditorSidebarTabs.module.css`

## 遗留问题/下一步
- 当前工作区还有大量本地未提交改动，若要提交本轮实现，需要先确认提交范围，避免把无关文件一并带入。
- 如果继续打磨，可以再统一四个顶部模式按钮和右侧栏标题的视觉语言，让它更接近 XMind。
