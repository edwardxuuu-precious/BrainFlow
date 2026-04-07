# 任务记录

## 任务名称
- 修复画布页导出二级菜单不可见

## 执行时间
- 开始时间：2026-04-06 22:03:51
- 结束时间：2026-04-06 22:20:24

## 仓库根目录
- C:\Users\edwar\Desktop\BrainFlow

## 任务目标
- 修复画布页汉堡菜单中“导出”二级菜单无法正常显示的问题。
- 调整交互为桌面端悬停右侧展开、触屏端点击展开。
- 补充单元测试与 E2E 回归测试，避免再次回归。

## 解决的问题
- 修复了 portal 菜单内容未被纳入“外部点击关闭”判断范围，导致导出子菜单刚展开就被误关闭的问题。
- 修复了导出子菜单定位在下方且存在 hover 丢失风险的问题，改为桌面端右侧飞出显示。
- 增加了粗指针设备回退交互，确保触屏环境下点击“导出”也能展开 JSON 和 PNG 子菜单。
- 补充了菜单交互相关的单测与真实浏览器回归用例。

## 问题原因
- 一级菜单通过 portal 渲染到 `document.body` 后，外部点击逻辑仍只检查触发器容器，未把 portal 下拉层视为菜单内部。
- 鼠标从“导出”移动到子菜单时，原有定位和交互边界容易触发关闭，导致二级菜单看起来像“没有显示”。

## 尝试的解决办法
1. 在 `MapEditorPage.tsx` 中新增主菜单触发器和 portal 下拉层双 ref，并使用 `event.composedPath()` 与 `contains()` 共同判断点击是否发生在菜单内部。
2. 抽出主菜单关闭与导出子菜单开关逻辑，保证主菜单关闭时同步收起子菜单。
3. 按设备能力区分交互：桌面端细指针设备使用 `pointerenter`、`pointerleave`、`focus`、`blur` 控制子菜单；触屏端使用点击切换。
4. 在 `MapEditorPage.module.css` 中调整子菜单为右侧飞出布局，并消除鼠标移动到子菜单时的交互断层。
5. 在 `MapEditorPage.test.tsx` 中补充 portal 菜单不被误关、外部点击关闭、触屏点击展开等回归测试。
6. 在 `brainflow.spec.ts` 中补充真实浏览器用例，验证悬停显示 JSON/PNG 且导出后菜单关闭。

## 是否成功解决
- 状态：成功
- 说明：画布页“导出”二级菜单已可正常显示并完成 JSON、PNG 选项操作；单元测试与 E2E 回归测试均已通过。

## 相关文件
- src/pages/editor/MapEditorPage.tsx
- src/pages/editor/MapEditorPage.module.css
- src/pages/editor/MapEditorPage.test.tsx
- src/test/e2e/brainflow.spec.ts
- Work_Progress/2026-04-06/220351_canvas-export-menu.md

## 遗留问题/下一步
- 暂无本任务遗留问题。
- 如后续继续调整主菜单结构，需同步覆盖 portal 菜单的外部点击判断与触屏交互回归测试。
