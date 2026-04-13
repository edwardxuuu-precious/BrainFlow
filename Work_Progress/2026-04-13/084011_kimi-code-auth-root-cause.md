# 任务记录

## 任务名称
- 排查 Kimi Code 鉴权失败根因

## 执行时间
- 开始时间：2026-04-13 08:40:11
- 结束时间：2026-04-13 08:45:12

## 仓库根目录
- C:/Users/edwar/Desktop/BrainFlow

## 任务背景
- 用户已填写刚生成的 Kimi Code API Key，但 AI 设置页仍显示 Kimi Code 鉴权失败，测试连接按钮不可用。

## 任务目标
- 定位 Kimi Code 配置保存、读取与测试连接鉴权链路中的实际失败原因，并给出根因。

## 已执行动作
1. 创建 `Work_Progress/2026-04-13` 任务记录目录。
2. 检查全局模板与 `task_log.py`，确认日志脚本可用但在当前 Windows 路径下创建任务时报 `re.error: bad escape \\U`。
3. 手工创建本任务记录文件，继续代码排查。
4. 检查 `server/providers/kimi-provider.ts`、`src/pages/ai-settings/AiSettingsPage.tsx`、`src/features/ai/components/ProviderCard.tsx`，确认当前 `Kimi Code` 默认实际走 `https://api.moonshot.cn` + `kimi-k2.5`，而测试按钮被 `provider.ready` 直接禁用。
5. 核对官方文档，确认 Moonshot/Kimi 开放平台 Key 对应 `https://api.moonshot.cn`，而 Kimi Code 会员 Key 对应 `https://api.kimi.com/coding` + `kimi-for-coding`。
6. 增加 `Kimi Code` key 来源不匹配提示，修正测试按钮可点击条件，并补充相关测试用例。

## 结果
- 已确认真实根因是配置目标与 Key 来源不匹配：页面名为 `Kimi Code`，但默认接入的是 Moonshot/Kimi 开放平台接口；若填入刚生成的 Kimi Code 会员 Key，会被 Moonshot 接口返回 `Invalid Authentication`。
- 已确认“不能测试连接”是前端按钮条件问题：按钮原先要求 `provider.ready` 为真才可点击，导致一旦保存校验失败就无法再次点测；现已改为“已保存配置即可测试”。

## 状态
- 成功

## 相关文件
- Work_Progress/2026-04-13/084011_kimi-code-auth-root-cause.md
- server/providers/kimi-provider.ts
- src/features/ai/components/ProviderCard.tsx
- src/pages/ai-settings/AiSettingsPage.tsx

## 验证
- `python "%USERPROFILE%/.codex/bin/task_log.py" start ...` 触发 `re.error: bad escape \\U`
- `npm test -- server/providers/kimi-provider.test.ts src/features/ai/components/ProviderCard.test.tsx src/features/ai/ai-store.test.ts` 通过，15/15 测试通过。

## 遗留问题/下一步
- 若继续沿用开放平台默认配置，请改用 Kimi 开放平台 Key；若继续使用 Kimi Code 会员 Key，请把 Base URL 改为 `https://api.kimi.com/coding`、模型改为 `kimi-for-coding` 后再测。
