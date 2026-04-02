# 任务记录

## 任务名称
- BrainFlow 编辑器 UI 改造与手工拖拽定位

## 执行时间
- 开始时间：2026-04-02 11:19:26
- 结束时间：2026-04-02 11:54:12

## 仓库根目录
- `c:\Users\edwar\Desktop\BrainFlow`

## 任务目标
- 将当前编辑器改造成更接近 XMind / Notion 的简洁干净风格。
- 为脑图节点补上“自动布局 + 手工偏移”的拖拽模型，并把偏移持久化到本地文档。
- 保留现有本地优先存储、撤销重做、JSON/PNG 导出和文档列表工作流。

## 解决的问题
- 重做了首页文档工作台，去掉旧版偏工具页的厚重结构，改成更接近 Notion 的轻量列表页。
- 重做了编辑器壳层，移除了左侧说明栏，压缩为顶部工具条 + 主画布 + 右侧轻量 inspector。
- 为 `TopicNode` 增加 `layout.offsetX / offsetY`，布局函数会在自动排布基础上叠加手工偏移。
- 节点拖拽不再尝试改父子结构，改为只写入手工偏移；父节点拖拽时整棵子树会跟随预览与保存。
- inspector 增加“重置位置”操作，可将手工偏移归零。
- 修复了首次进入新文档时 `fitView` 时序不稳定的问题，避免节点被挤到画布左上角之外。
- 补充并通过了单元测试、组件测试、E2E 测试，新增了浏览器级拖拽偏移持久化验证。

## 问题原因
- 原编辑器视觉系统采用暖色三栏工具页，信息密度和装饰性都偏高，不符合用户希望的 XMind / Notion 编辑器气质。
- 原布局算法每次都以树结构重新计算节点坐标，没有为手工拖拽保留独立的偏移层。
- 原拖拽逻辑倾向于结构重排，而不是用户更直接需要的“手工挪动节点位置”。
- React Flow 初始化与 `fitView` 的时序没有和文档加载完全对齐，导致新文档首次打开时画布定位不稳定。

## 尝试的解决办法
1. 重构首页 `HomePage` 和编辑器 `MapEditorPage`，统一成中性浅色、低装饰、高留白的视觉系统。
2. 在文档模型中加入 `TopicLayout`，并在 `tree-operations`、`editor-store`、`layoutMindMap` 中接通偏移读写。
3. 重写节点拖拽逻辑：拖拽时按子树进行受控预览，拖拽结束后把偏移写回 Zustand + IndexedDB。
4. 重构节点和属性面板样式，去掉粗重描边、厚阴影和暖米色背景，改为轻边框白底节点和简洁 inspector。
5. 将文档服务的 `saveDocument` 统一负责刷新 `updatedAt`，顺带解决首页重命名时的 lint 纯函数约束。
6. 增加布局、树操作、store、属性面板和 E2E 测试，重点覆盖 offset 计算、撤销重做、拖拽后刷新保留、重置位置。
7. 用浏览器截图和脚本实际检查新首页与编辑器画面，修复首次进入编辑器时 `fitView` 未及时生效的问题。

## 是否成功解决
- 状态：成功
- 说明：界面已切换为更轻的 XMind / Notion 风格，节点支持手工拖拽偏移、刷新后保留，并支持在 inspector 中重置位置；完整构建和测试均通过。

## 相关文件
- `Work_Progress/2026-04-02/111926_ui-drag-refresh.md`
- `src/pages/home/HomePage.tsx`
- `src/pages/home/HomePage.module.css`
- `src/pages/editor/MapEditorPage.tsx`
- `src/pages/editor/MapEditorPage.module.css`
- `src/components/topic-node/TopicNode.tsx`
- `src/components/topic-node/TopicNode.module.css`
- `src/features/editor/components/PropertiesPanel.tsx`
- `src/features/editor/components/PropertiesPanel.module.css`
- `src/features/editor/layout.ts`
- `src/features/editor/editor-store.ts`
- `src/features/editor/tree-operations.ts`
- `src/features/documents/types.ts`
- `src/features/documents/document-factory.ts`
- `src/features/documents/document-service.ts`
- `src/features/editor/layout.test.ts`
- `src/features/editor/tree-operations.test.ts`
- `src/features/editor/editor-store.test.ts`
- `src/features/editor/components/PropertiesPanel.test.tsx`
- `src/test/e2e/brainflow.spec.ts`

## 遗留问题/下一步
- 如果要继续向 XMind 靠拢，下一步可以增加更丰富的主题样式、分支配色方案和更细的节点间距控制。
- 当前拖拽只负责手工偏移，不做结构重排；如果后续需要像 XMind 那样拖拽改父子关系，需要单独设计手势与目标提示。
- 目前首页与编辑器已经统一为简洁方向，但还没有设计系统级的多主题切换，后续可以继续抽离更稳定的 token 层。
