# 任务记录

## 任务名称
- 排查 Kimi Code API Key 被提示无效或已过期

## 执行时间
- 开始时间：2026-04-13 00:31:12 +0800
- 结束时间：2026-04-13 08:25:40 +0800

## 仓库根目录
- C:/Users/edwar/Desktop/BrainFlow

## 任务背景
- 用户刚生成 Kimi Code API Key，但在 AI 配置页保存或校验时被提示“无效或已过期”，需要确认是平台 Key 问题还是项目实现问题。

## 任务目标
- 定位 Kimi Code 校验失败的真实原因，确认是否需要修复 provider 实现、错误映射或配置默认值。

## 已执行动作
1. [00:31:12] 创建本轮任务记录文件。
2. [08:16-08:20] 检查 `server/providers/kimi-provider.ts` 的 `Kimi Code` 校验逻辑，确认 401 被统一映射成“API Key 无效或已过期”，未展示 Moonshot 原始错误。
3. [08:20-08:22] 确认前端配置页仍推荐旧模型名 `kimi-code`；修正为 `kimi-k2.5`，并同步更新帮助文案。
4. [08:22-08:24] 为 `Kimi Code` Provider 增加模型列表校验：若配置模型不在 Moonshot 可用模型列表中，直接给出明确提示。
5. [08:24-08:25] 新增 `server/providers/kimi-provider.test.ts`，验证鉴权错误透传、旧模型拦截与默认模型更新。

## 结果
- `Kimi Code` 保存/校验阶段不再把所有 401 都笼统显示为“无效或已过期”，现在会尽量展示 Moonshot 返回的真实鉴权错误。
- `Kimi Code` 默认推荐模型已改为 `kimi-k2.5`；若手填了过时的 `kimi-code`，校验阶段会直接提示模型不可用。

## 状态
- 成功

## 相关文件
- server/providers/kimi-provider.ts
- server/providers/kimi-provider.test.ts
- src/pages/ai-settings/AiSettingsPage.tsx

## 验证
- `npm test -- server/providers/kimi-provider.test.ts src/features/ai/ai-client.test.ts src/features/ai/ai-store.test.ts server/app.test.ts` 通过，34/34 测试通过。

## 遗留问题/下一步
- 建议用户刷新页面后重新保存/验证一次 Kimi Code 配置；若仍失败，应根据新的具体报错继续定位账号、Key 来源或平台权限问题。
