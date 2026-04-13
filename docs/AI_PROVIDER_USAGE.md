# AI Provider 使用指南

BrainFlow 现在支持多种 AI Provider：
- **Codex** (默认): OpenAI Codex CLI (本地运行)
- **DeepSeek**: DeepSeek API (云端)
- **Kimi**: Moonshot AI API (云端)

## 配置方法

### 1. 环境变量配置

编辑 `.env.local` 文件：

```bash
# 选择默认 Provider
codex|deepseek|kimi
BRAINFLOW_AI_PROVIDER=codex

# DeepSeek 配置 (可选)
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
DEEPSEEK_MODEL=deepseek-chat

# Kimi 配置 (可选)
KIMI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
KIMI_MODEL=moonshot-v1-32k
```

### 2. 前端切换 Provider

重启服务后，在 AI 侧边栏的设置中可以切换 Provider。

切换后会自动刷新页面以应用新的 Provider。

## 获取 API Key

### DeepSeek
1. 访问 https://platform.deepseek.com/
2. 注册/登录账号
3. 创建 API Key
4. 复制到 `DEEPSEEK_API_KEY`

### Kimi (Moonshot AI)
1. 访问 https://platform.moonshot.cn/
2. 注册/登录账号
3. 进入「API Key 管理」
4. 创建并复制 API Key

## 功能支持

所有 Provider 都支持以下功能：
- ✅ 普通对话问答
- ✅ 上下文注入（选择节点后提问）
- ✅ 系统提示词遵循
- ✅ 节点自动创建/更新
- ✅ 智能导入 Markdown
- ✅ 流式响应
- ✅ 结构化 JSON 输出

## 注意事项

1. **API Key 安全**: API Key 仅存储在服务端环境变量中，不会暴露给前端
2. **热切换**: 切换 Provider 后会自动刷新页面
3. **状态保持**: 对话历史存储在本地 IndexedDB，切换 Provider 后仍可访问
4. **模型差异**: 不同 Provider 的响应风格可能有差异，这是正常的

## 故障排除

### Provider 显示"需配置"
- 检查对应的环境变量是否设置
- 确认 API Key 是否有效
- 点击"测试"按钮验证连接

### 响应缓慢
- DeepSeek 和 Kimi 是云端服务，受网络影响
- Codex 是本地运行，需要确保电脑性能足够

### JSON 解析错误
- 部分模型可能返回非标准格式的 JSON
- 系统会自动尝试修复，如果仍失败请重试
