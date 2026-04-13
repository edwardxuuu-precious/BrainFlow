# BrainFlow AI Provider 配置指南

BrainFlow 现在支持多个 AI Provider：
- **Codex** (默认): OpenAI Codex CLI (本地运行)
- **DeepSeek**: DeepSeek API
- **Kimi**: Moonshot AI (月之暗面) API

## 快速配置

编辑 `.env.local` 文件：

### 使用 Codex (默认)
```bash
BRAINFLOW_AI_PROVIDER=codex
# 确保已安装并登录 Codex CLI
# codex login --device-auth
```

### 使用 DeepSeek
```bash
BRAINFLOW_AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
DEEPSEEK_MODEL=deepseek-chat  # 或 deepseek-reasoner
```

### 使用 Kimi (Moonshot AI)
```bash
BRAINFLOW_AI_PROVIDER=kimi
KIMI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
KIMI_MODEL=moonshot-v1-32k  # 可选: moonshot-v1-8k, moonshot-v1-128k
```

## 获取 API Key

### DeepSeek
1. 访问 https://platform.deepseek.com/
2. 注册/登录账号
3. 创建 API Key
4. 复制 Key 到 `DEEPSEEK_API_KEY`

### Kimi (Moonshot AI)
1. 访问 https://platform.moonshot.cn/
2. 注册/登录账号
3. 进入「API Key 管理」
4. 创建 API Key
5. 复制 Key 到 `KIMI_API_KEY`

## 切换 Provider

1. 修改 `.env.local` 中的 `BRAINFLOW_AI_PROVIDER`
2. 重启服务器

```bash
# 如果使用 npm/pnpm
pnpm dev:server

# 或完整重启
pnpm dev
```

## Provider 对比

| 特性 | Codex | DeepSeek | Kimi |
|------|-------|----------|------|
| 运行方式 | 本地 CLI | 云端 API | 云端 API |
| 需要联网 | 否 | 是 | 是 |
| 流式响应 | 支持 | 支持 | 支持 |
| 结构化输出 | 优秀 | 良好 | 良好 |
| 中文理解 | 良好 | 优秀 | 优秀 |
| 成本 | OpenAI 订阅 | 按量计费 | 按量计费 |

## 故障排除

### DeepSeek 连接失败
```
AI Provider 状态检查失败：无法连接到 DeepSeek API
```
- 检查 `DEEPSEEK_API_KEY` 是否正确
- 检查网络连接
- 查看 DeepSeek 平台状态: https://status.deepseek.com/

### Kimi 认证失败
```
Kimi API Key 无效或已过期
```
- 确认 API Key 未过期
- 检查 Key 是否有足够额度
- 在 Moonshot 控制台重新生成 Key

### 模型返回格式错误
如果看到 JSON 解析错误，可能是因为：
- 模型不支持结构化输出
- Prompt 过于复杂
- 尝试简化请求或更换模型

## 高级配置

### 自定义 Base URL
```bash
# 用于代理或私有化部署
DEEPSEEK_BASE_URL=https://your-proxy.com/v1
KIMI_BASE_URL=https://your-proxy.com/v1
```

### 超时设置
```bash
# 默认 180 秒
DEEPSEEK_TIMEOUT_MS=300000
KIMI_TIMEOUT_MS=300000
```

## 开发说明

Provider 架构：
```
Frontend → REST API → CodexBridge (业务逻辑) → AiProvider → 具体实现
                                                    ↓
                                            ┌───────┼───────┐
                                            ↓       ↓       ↓
                                        Codex  DeepSeek  Kimi
```

添加新 Provider：
1. 实现 `AiProvider` 接口
2. 在 factory.ts 中注册
3. 更新配置文档
