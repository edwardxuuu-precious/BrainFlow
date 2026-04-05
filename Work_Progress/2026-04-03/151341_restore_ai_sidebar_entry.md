# 任务记录

## 任务名称
- 恢复编辑页右侧 AI 侧栏入口

## 执行时间
- 开始时间：2026-04-03 15:13:41
- 结束时间：2026-04-03 15:33:40

## 仓库根目录
- c:\Users\edwar\Desktop\BrainFlow

## 任务目标
- 修复编辑页右侧面板中 `Inspector / AI` 切换入口缺失的问题，让用户可以从检查器重新切回 AI 侧栏。

## 解决的问题
- 恢复了编辑页右侧面板顶部的 `Inspector / AI` 切换入口。
- 修复后右侧默认仍停留在 `Inspector`，但用户可以重新切到 `AI` 侧栏。
- 补齐了右侧折叠按钮的 `aria-controls` 关联，避免测试与真实无障碍状态不一致。
- 新增编辑页级别回归测试，覆盖 `Inspector -> AI -> Inspector` 的真实切换流程。

## 问题原因
- `MapEditorPage` 仍然维护着 `rightPanelTab` 状态，也仍然会在 `ai` 时渲染 `AiSidebar`。
- 真正的回归点在于 `PropertiesPanel` 收到了 `tabs` 参数，却没有在头部渲染出来，导致右侧默认停在 `Inspector` 时，用户看不到切到 `AI` 的入口。
- `EditorSidebarTabs` 的折叠按钮也没有带上目标面板的 `aria-controls`，导致原有组件测试无法准确表达右侧面板 chrome。

## 尝试的解决办法
1. 检查右侧面板与 AI 侧栏挂载逻辑，确认入口缺失的根因。
2. 恢复 `PropertiesPanel` 头部共享 chrome，重新渲染 `Inspector / AI` tabs。
3. 为 `EditorSidebarTabs` 补充 `aria-controls`，让折叠按钮和右侧面板 id 正确关联。
4. 更新组件测试与编辑页回归测试，验证 `Inspector -> AI -> Inspector` 的切换行为。
5. 运行定向测试、`build:web`，并用 Playwright 手动检查桌面编辑页。

## 是否成功解决
- 状态：成功
- 说明：右侧面板顶部已重新出现 `Inspector / AI` tabs，点击后可正常切换到 `AI` 侧栏；定向测试、`pnpm build:web` 和浏览器手动检查均已通过。

## 相关文件
- c:\Users\edwar\Desktop\BrainFlow\src\features\editor\components\PropertiesPanel.tsx
- c:\Users\edwar\Desktop\BrainFlow\src\features\editor\components\PropertiesPanel.module.css
- c:\Users\edwar\Desktop\BrainFlow\src\features\editor\components\EditorSidebarTabs.tsx
- c:\Users\edwar\Desktop\BrainFlow\src\features\editor\components\PropertiesPanel.test.tsx
- c:\Users\edwar\Desktop\BrainFlow\src\pages\editor\MapEditorPage.tsx
- c:\Users\edwar\Desktop\BrainFlow\src\pages\editor\MapEditorPage.test.tsx

## 遗留问题/下一步
- 当前仍保持“默认打开 Inspector”的行为，没有新增“记住上次 tab”或“默认打开 AI”的持久化逻辑。
- 工作区里存在大量其他未提交改动，本次没有回退或覆盖这些无关变更。
