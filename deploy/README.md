# BrainFlow 云端部署

## 推荐配置

- 3 人左右使用，推荐 `2 vCPU / 4 GB RAM / 40 GB SSD`
- 系统建议 `Ubuntu 22.04` 或 `Ubuntu 24.04`
- 如果 AI 导入和 AI 对话会频繁并发，建议升级到 `4 vCPU / 8 GB RAM`

## 架构说明

- 前端是 Vite 构建后的静态文件，部署目录是 `dist/`
- `/api/codex/*` 由 Node.js + Hono 提供
- Nginx 负责静态资源和 `/api` 反向代理
- 文档数据默认保存在用户浏览器的 `IndexedDB + localStorage`

## 上线前提

1. 安装 `Node.js 20+`
2. 安装 `pnpm 9+`
3. 安装 Nginx
4. 为运行服务的 Linux 用户安装并登录 `codex` CLI

建议使用单独用户：

```bash
sudo useradd -m -s /bin/bash brainflow
sudo mkdir -p /opt/brainflow /opt/brainflow/data
sudo chown -R brainflow:brainflow /opt/brainflow
```

## 部署步骤

### 1. 上传代码

将仓库放到：

```bash
/opt/brainflow
```

### 2. 安装依赖并构建

```bash
cd /opt/brainflow
pnpm install --frozen-lockfile
pnpm build
```

### 3. 配置环境变量

```bash
cp deploy/brainflow.env.example deploy/brainflow.env
mkdir -p /opt/brainflow/data
```

如果你不想把 AI 设置写到仓库目录外，也可以把 `BRAINFLOW_AI_SETTINGS_FILE` 留空。

### 4. 安装并登录 Codex CLI

必须以运行服务的同一个用户执行：

```bash
sudo -u brainflow -H bash
codex --version
codex login --device-auth
codex login status
exit
```

要求 `codex login status` 显示可用的 `ChatGPT` 登录态，否则 `/api/codex/*` 不会正常工作。

### 5. 安装 systemd 服务

```bash
sudo cp deploy/brainflow-api.service /etc/systemd/system/brainflow-api.service
sudo systemctl daemon-reload
sudo systemctl enable --now brainflow-api
sudo systemctl status brainflow-api
```

### 6. 配置 Nginx

```bash
sudo cp deploy/nginx.brainflow.conf /etc/nginx/sites-available/brainflow
sudo ln -sf /etc/nginx/sites-available/brainflow /etc/nginx/sites-enabled/brainflow
sudo nginx -t
sudo systemctl reload nginx
```

如果服务器上已经有其他站点，记得把 `server_name _;` 改成你的域名。

### 7. 可选：启用 HTTPS

域名解析完成后可用：

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.example
```

## 验证

### 本机服务

```bash
curl http://127.0.0.1:8787/api/codex/status
```

### 站点

```bash
curl -I http://your-domain.example/
curl http://your-domain.example/api/codex/status
```

## 常见问题

### 1. IndexedDB 是什么

- IndexedDB 是浏览器提供的本地数据库，不是服务器上的数据库
- 它是结构化对象存储，运行在用户自己的浏览器里
- 可以把它理解为“浏览器内置的本地持久化数据库”
- 它不是你云服务器上的 MySQL、PostgreSQL 或 SQLite

这意味着：

- 你把 BrainFlow 部署到云端后，网页文件在服务器上
- 但每个用户的脑图文档默认还是保存在各自浏览器本地
- 不同浏览器、不同设备之间不会自动同步

### 2. 为什么需要 VPS，而不是纯静态托管

因为当前应用保留了 AI 功能，前端会请求 `/api/codex/*`，而这些接口需要常驻的 Node.js 进程和 `codex` CLI。

### 3. 只想先上线不带 AI

可以只执行前端构建，把 `dist/` 部署到静态托管。

但这样：

- 文档依旧保存在浏览器本地
- AI 对话、AI 导入、Codex 相关功能不可用
