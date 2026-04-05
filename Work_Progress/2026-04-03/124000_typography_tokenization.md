# 任务记录

## 任务名称
- 8px 基准网格排版系统与全站字号 Token 化

## 执行时间
- 开始时间：2026-04-03 12:40:00
- 结束时间：2026-04-03 13:10:34

## 仓库根目录
- C:\Users\edwar\Desktop\BrainFlow

## 任务目标
- 新增全局 typography CSS 变量文件，统一 Display 与 Body 字号层级。
- 将首页、编辑页、共享 UI 组件、画布节点与 AI 面板中的硬编码字号替换为统一 token。

## 解决的问题
- 新增 `src/styles/typography.css`，集中定义 Display / Body / Label 的全局字体变量与字号 token。
- 在 `src/styles/global.css` 中接入 typography 变量，移除重复的字体家族定义。
- 将首页、编辑页、共享 UI 组件、层级侧栏、属性面板、画布节点、AI 面板与 AI 设置弹窗中的硬编码字号替换为统一 token。
- 为编辑页文档标题输入框同步调整高度与顶部栏内边距，避免接入 `display-sm` 后出现裁切。
- 完成定向测试、`build:web` 构建和多断点浏览器核验，确认主要标题、按钮、列表、输入框和 AI 面板无明显字号回归。

## 问题原因
- 项目此前只有字体家族变量，没有统一的字号 token，导致多个页面和组件直接写死 `font-size`。
- 首页、编辑页、画布节点和 AI 面板分别使用不同字号尺度，缺少统一的 8px 基准网格语义映射。
- 编辑页标题和部分 AI 面板控件依赖局部尺寸微调，直接替换字体层级后容易出现输入框高度、按钮尺寸和行高不协调。

## 尝试的解决办法
1. 新增 typography 变量文件并接入全局样式入口。
2. 将主要页面与组件样式中的字号映射到统一 token。
3. 运行测试与构建验证样式改造未破坏现有行为。
4. 使用 Playwright 在首页和编辑页分别检查 1440 / 1024 / 768 / 390 四档宽度下的实际渲染。
5. 额外检查 AI 侧栏在桌面宽度下的 token 应用效果。

## 是否成功解决
- 状态：成功
- 说明：排版 token 化已完成，目标样式已接入首页、编辑页、共享组件、画布节点和 AI 面板。`pnpm test -- src/pages/home/HomePage.test.tsx src/features/editor/components/HierarchySidebar.test.tsx src/features/editor/components/PropertiesPanel.test.tsx src/components/topic-node/TopicNode.test.tsx src/features/ai/components/AiSidebar.test.tsx` 与 `pnpm build:web` 均通过。Playwright 手动核验显示标题、输入框、按钮、标签、表头和 AI 面板在目标断点下未出现明显裁切或错位。

## 相关文件
- src/styles/typography.css
- src/styles/global.css
- src/pages/home/HomePage.module.css
- src/pages/editor/MapEditorPage.module.css
- src/components/ui/Button.module.css
- src/components/ui/Field.module.css
- src/components/ui/StatusPill.module.css
- src/components/ui/SegmentedControl.module.css
- src/features/editor/components/HierarchySidebar.module.css
- src/features/editor/components/PropertiesPanel.module.css
- src/components/topic-node/TopicNode.module.css
- src/features/ai/components/AiComposer.module.css
- src/features/ai/components/AiContextTray.module.css
- src/features/ai/components/AiMessageList.module.css
- src/features/ai/components/AiSidebar.module.css
- src/features/ai/components/AiSettingsDialog.module.css

## 遗留问题/下一步
- 使用 `vite preview` 进行 AI 面板核验时，因本地 Codex bridge 未运行，`/api/codex/status` 与 `/api/codex/settings` 返回 502；这影响的是 AI 联调环境，不是排版 token 化本身。
- 如果后续需要继续强化设计系统，可在组件层补充语义化的 `line-height` / `letter-spacing` token，减少样式模块内的局部数值散落。
