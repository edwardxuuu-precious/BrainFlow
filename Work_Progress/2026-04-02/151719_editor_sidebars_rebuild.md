# 任务记录

## 任务名称
- 编辑器双侧栏整块化与可隐藏改造

## 执行时间
- 开始时间：2026-04-02 15:17:19
- 结束时间：2026-04-02 15:44:32

## 仓库根目录
- c:\Users\edwar\Desktop\BrainFlow

## 任务目标
- 将编辑器左侧区域改造成与参考图一致的整块式层级侧栏，不再使用卡片堆叠结构。
- 将左右两侧都改造成可隐藏的侧边栏，隐藏后保留窄轨道。
- 直接接入已持久化的 `workspace.chrome.leftSidebarOpen/rightSidebarOpen`，不再新增文档结构。

## 解决的问题
- 左侧 `Hierarchy` 已改成单一整块式侧栏，结构分为顶部信息、中部层级树、底部快捷键与主操作区。
- 右侧 `Inspector` 已统一成整块式侧栏，顶部新增收起按钮，内部用分隔线而不是卡片感区块组织内容。
- 桌面端支持左右侧栏收起为轨道并恢复，平板端支持左右轨道 + 覆盖式抽屉，且同一时间只允许一侧打开。
- 新增侧栏轨道组件，并将侧栏开关状态与文档 `workspace.chrome` 持久化联动。
- 已补齐组件单测与 E2E，验证桌面刷新恢复折叠状态、平板轨道互斥抽屉、以及原有编辑流程不回归。

## 问题原因
- 现有左侧栏仍然由多个独立面板叠加组成，视觉与结构都偏离参考图中的一体化工作台导航栏。
- 左右侧栏虽然已经有持久化字段，但 UI 没有真正接入，导致无法折叠、恢复和刷新保持。
- 平板宽度下缺少“轨道 + 抽屉”模式，画布面积与侧栏信息在中等视口之间没有合理平衡。

## 尝试的解决办法
1. 重写 `HierarchySidebar` 与 `PropertiesPanel`，移除卡片堆叠式布局，改成整块式侧栏。
2. 新增 `SidebarRail` 组件，并在 `MapEditorPage` 中按桌面 / 平板 / 窄屏三种模式接入轨道、收起列与抽屉。
3. 直接消费 `document.workspace.chrome`，通过 `setSidebarOpen` 驱动展开、收起与刷新持久化。
4. 补充 `HierarchySidebar`、`PropertiesPanel`、`SidebarRail` 组件测试，并新增桌面与平板两组 E2E 场景。
5. 运行 `pnpm lint`、`pnpm test -- --run`、`pnpm build`、`pnpm test:e2e` 做完整回归验证。

## 是否成功解决
- 状态：成功
- 说明：左右侧栏整块化、可隐藏、桌面轨道、平板抽屉和持久化恢复均已完成，所有既定验证通过。

## 相关文件
- c:\Users\edwar\Desktop\BrainFlow\src\pages\editor\MapEditorPage.tsx
- c:\Users\edwar\Desktop\BrainFlow\src\pages\editor\MapEditorPage.module.css
- c:\Users\edwar\Desktop\BrainFlow\src\features\editor\components\HierarchySidebar.tsx
- c:\Users\edwar\Desktop\BrainFlow\src\features\editor\components\HierarchySidebar.module.css
- c:\Users\edwar\Desktop\BrainFlow\src\features\editor\components\PropertiesPanel.tsx
- c:\Users\edwar\Desktop\BrainFlow\src\features\editor\components\PropertiesPanel.module.css
- c:\Users\edwar\Desktop\BrainFlow\src\features\editor\components\SidebarRail.tsx
- c:\Users\edwar\Desktop\BrainFlow\src\features\editor\components\SidebarRail.module.css
- c:\Users\edwar\Desktop\BrainFlow\src\features\editor\components\HierarchySidebar.test.tsx
- c:\Users\edwar\Desktop\BrainFlow\src\features\editor\components\PropertiesPanel.test.tsx
- c:\Users\edwar\Desktop\BrainFlow\src\features\editor\components\SidebarRail.test.tsx
- c:\Users\edwar\Desktop\BrainFlow\src\test\e2e\brainflow.spec.ts

## 遗留问题/下一步
- 窄屏 `<780px` 仍保持当前简化布局，未扩展成完整移动端侧栏抽屉系统。
- 如果后续需要更贴近参考图，还可以继续补侧栏进入/退出动效和更细的树节点视觉层级。
