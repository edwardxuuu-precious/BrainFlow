# 任务记录

## 任务名称
- 本机 Codex CLI 桥接、多选框选上下文注入与全局 System Prompt 改造

## 执行时间
- 开始时间：2026-04-02 18:59:54
- 结束时间：2026-04-02 20:22:00

## 仓库根目录
- `c:\Users\edwar\Desktop\BrainFlow`

## 任务目标
- 移除运行时 mock provider，改为本机 Codex CLI bridge。
- 将 AI 验证改为基于本机 `codex login` 状态，不再走 Web OAuth。
- 支持画布左键框选、多选、追加框选，并让当前选区直接作为 AI 上下文。
- 将 system prompt 改为服务端全局只读配置，并在前端 AI 侧栏中展示摘要与版本。

## 解决的问题
- 已将服务端 AI 代理改造为本机 `codex exec` 调用链，新增 `/api/codex/status`、`/api/codex/revalidate`、`/api/codex/chat`，并将旧 `/api/ai/*` 接口改为废弃提示。
- 运行时已彻底移除 mock provider；Codex CLI 不可用、未登录、订阅/权限异常时，前端会禁用发送并提示用户尽快重新验证。
- AI 侧栏已改为读取当前选区上下文，不再维护 `attachedTopicIds`。
- 画布已支持左键框选、多选、`Shift/Ctrl/Cmd + 点击` 追加选择，以及 `Shift/Ctrl/Cmd + 框选` 追加选择。
- Inspector 已支持多选摘要态；多选时不显示单节点编辑表单，而是引导用户切到 AI 使用当前选区。
- system prompt 已迁移到 `server/prompts/brainflow-system.md`，并通过服务端摘要、版本哈希和全文只读展示给前端。
- 修复了编辑页在首屏加载与节点点击后的 React Flow 死循环问题，同时修复了首屏 `fitView` 过早触发导致节点不在视口内的问题。

## 问题原因
- 旧 AI 架构依赖前端直连风格的代理设计，并带有开发用 mock fallback，不符合“本机 Codex CLI + 禁止 fallback”的产品边界。
- 旧上下文注入模型依赖手工附加节点，无法满足框选、多选后立即提问的交互目标。
- 选择状态重构后，`ReactFlow onSelectionChange` 与外部 Zustand store 之间形成了重复同步，导致首屏和节点点击时出现最大更新深度错误。
- 首屏 `fitView` 在节点真正挂载到 React Flow 前执行，导致画布初始视口没有正确包含全部节点。

## 尝试的解决办法
1. 重写共享 AI 协议和前后端调用链，用本机 Codex CLI bridge 替代 OpenAI/Responses mock 方案。
2. 新增 `server/codex-runner.ts`、`server/codex-bridge.ts`、`server/system-prompt.ts` 和 `server/prompts/brainflow-system.md`，把 CLI 检测、登录验证、结构化输出和只读 prompt 配置全部收口到本机服务端。
3. 重写 `src/features/ai/*` 前端模块，改成基于 `/api/codex/*` 的状态检测、重验证、聊天流式消费和本地会话持久化。
4. 将编辑器 store 改为 `activeTopicId + selectedTopicIds` 模型，并让 AI 上下文直接由当前选区构建。
5. 重写 `MapEditorPage.tsx` 的选择与视口同步逻辑，加入追加框选合并、视口幂等保护和节点挂载后再 `fitView` 的初始化流程。
6. 新增/重写单元测试、服务端测试、TopicNode 组件测试和 Playwright E2E，用 `/api/codex/*` 路由拦截替代运行时 mock provider。
7. 更新 `.env.example`，移除 OpenAI key 示例，仅保留本地 bridge 端口和 system prompt 文件配置。

## 是否成功解决
- 状态：成功
- 说明：本机 Codex CLI bridge、多选框选上下文注入、只读 system prompt 和无 mock fallback 的整体方案已落地，前后端与测试链路全部通过验证。

## 相关文件
- `server/app.ts`
- `server/codex-runner.ts`
- `server/codex-bridge.ts`
- `server/system-prompt.ts`
- `server/prompts/brainflow-system.md`
- `shared/ai-contract.ts`
- `src/features/ai/ai-client.ts`
- `src/features/ai/ai-context.ts`
- `src/features/ai/ai-store.ts`
- `src/features/ai/ai-storage.ts`
- `src/features/ai/components/AiSidebar.tsx`
- `src/features/ai/components/AiContextTray.tsx`
- `src/features/editor/editor-store.ts`
- `src/features/editor/use-editor-shortcuts.ts`
- `src/features/editor/components/HierarchySidebar.tsx`
- `src/features/editor/components/PropertiesPanel.tsx`
- `src/pages/editor/MapEditorPage.tsx`
- `src/components/topic-node/TopicNode.tsx`
- `src/components/topic-node/TopicNode.test.tsx`
- `src/test/e2e/brainflow.spec.ts`
- `.env.example`

## 遗留问题/下一步
- 当前运行前提仍是用户本机已经安装并完成 `codex login --device-auth`；若后续需要“未安装时一键引导安装”，需再补安装检测与安装指引 UI。
- 当前 AI 仍只允许保守写入 `create_child`、`create_sibling`、`update_topic(title/note)`；如果后续要扩展删除、重排或布局类操作，需要重新设计审批与校验边界。
- 当前 system prompt 仍通过文件与重启 bridge 生效；如果后续要做多环境 prompt 切换，需要补充配置装载策略和版本展示规则。
