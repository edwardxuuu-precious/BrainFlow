# 任务记录

## 任务名称
- 复刻 XMind 的 `标记 / 格式` 入口，并把画布名改成双击编辑

## 执行时间
- 开始时间：2026-04-04 19:28:38
- 结束时间：2026-04-04 20:06:30

## 仓库根目录
- `c:\Users\edwar\Desktop\BrainFlow`

## 任务目标
- 将编辑页画布标题改为默认文本显示，双击后进入编辑状态。
- 将右侧边栏从 `Inspector / AI` 重构为 `详情 / 标记 / 格式 / AI` 四种模式。
- 在顶部工具栏增加 XMind 风格的 `标记`、`格式` 按钮，并打开对应右侧边栏模式。
- 为节点增加 `贴纸` 元数据与展示能力。
- 为画布增加正式的主题预设与主题颜色编辑入口。

## 解决的问题
- 实现了画布标题双击编辑，支持 `Enter` 提交、`Escape` 取消、失焦提交。
- 新增四态右侧边栏，并保留原有详情能力与 AI 侧栏能力。
- 新增 `标记` 模式的 `标记 / 贴纸` 子标签，并支持多选批量切换。
- 新增 `格式` 模式的 `样式 / 画布` 子标签，并支持主题预设与画布颜色编辑。
- 为节点与层级侧栏增加贴纸徽章展示。
- 扩展文档元数据与主题更新链路，补齐 store、tree 操作、默认值归一化。
- 修复了旧测试与旧 fixture 未包含 `stickers` 字段导致的构建和测试失败。

## 问题原因
- 现有编辑页顶部标题一直使用常驻输入框，不符合目标交互。
- 现有右侧边栏职责过重，详情、标记、样式能力混在同一个面板里。
- 文档 schema 原本只有 markers，没有 stickers，缺少对应的默认值、渲染和批量操作。
- 主题系统原本只有单套默认值，没有正式的预设切换入口。
- 相关测试仍引用旧的可访问标签与旧 fixture，导致重构后回归失败。

## 尝试的解决办法
1. 扩展 `TopicMetadata` 与默认值归一化，新增 `TopicSticker`、`TOPIC_STICKERS`、`stickers` 字段，并补齐贴纸文案与 glyph 映射。
2. 扩展 `tree-operations` 与 `editor-store`，新增标记/贴纸批量切换、文档主题更新和预设应用动作。
3. 重写 `EditorSidebarTabs`，将右侧边栏模式升级为 `details / markers / format / ai`。
4. 将 `PropertiesPanel` 收口为详情面板，拆出新的 `MarkersPanel` 和 `FormatPanel`。
5. 在 `MapEditorPage` 中补齐顶栏 `标记 / 格式` 入口、标题双击编辑状态和右栏模式切换逻辑。
6. 在 `TopicNode` 与 `HierarchySidebar` 中加入贴纸展示，并为旧数据缺失 `stickers` 的情况增加兼容处理。
7. 回补并修正相关测试，运行定向测试、组件测试、数据层测试和完整构建。

## 是否成功解决
- 状态：成功
- 说明：目标功能已落地，相关测试和完整构建均已通过。

## 相关文件
- `src/pages/editor/MapEditorPage.tsx`
- `src/pages/editor/MapEditorPage.module.css`
- `src/features/documents/types.ts`
- `src/features/documents/theme.ts`
- `src/features/documents/topic-defaults.ts`
- `src/features/documents/topic-decorations.ts`
- `src/features/editor/tree-operations.ts`
- `src/features/editor/editor-store.ts`
- `src/features/editor/components/EditorSidebarTabs.tsx`
- `src/features/editor/components/EditorSidebarTabs.module.css`
- `src/features/editor/components/PropertiesPanel.tsx`
- `src/features/editor/components/MarkersPanel.tsx`
- `src/features/editor/components/FormatPanel.tsx`
- `src/features/editor/components/FormatPanel.module.css`
- `src/features/editor/components/HierarchySidebar.tsx`
- `src/components/topic-node/TopicNode.tsx`
- `src/components/topic-node/TopicNode.module.css`
- `src/features/editor/components/HierarchySidebar.module.css`
- `src/pages/editor/MapEditorPage.test.tsx`
- `src/features/editor/components/PropertiesPanel.test.tsx`
- `src/features/editor/components/HierarchySidebar.test.tsx`
- `src/components/topic-node/TopicNode.test.tsx`
- `src/features/documents/document-service.test.ts`
- `src/features/editor/editor-store.test.ts`

## 遗留问题/下一步
- 可以继续补一轮更细的交互打磨，例如贴纸面板的分组样式、格式面板的视觉层级和更多主题预设说明。
- 如果你希望进一步贴近 XMind，还可以继续补 `贴纸` 的搜索/分组、`格式` 的更多结构选项，以及顶部工具栏的更多入口。
