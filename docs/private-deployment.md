# 私人部署指南

本项目的默认生产模式是：代码可公开 clone，每个人在自己的设备上运行一套应用和 PostgreSQL，仅通过 Tailscale 私网访问。

## 1. 准备设备

建议使用能够持续开机的 Linux 主机、NAS、迷你主机或私人 VPS。也可以先在自己的 Windows/macOS 电脑上试用；电脑关机、休眠或 Docker 停止后，手机将无法访问。

安装：

- Git
- Docker Engine + Docker Compose v2，或 Docker Desktop
- Tailscale（宿主机和需要访问的手机/电脑均安装）

不要在路由器做端口转发，不要启用 Tailscale Funnel。

## 2. 首次安装

```bash
git clone https://github.com/caotw1998/Portfolio-Journal.git
cd Portfolio-Journal
cp deploy.env.example .env.deploy
chmod 600 .env.deploy
openssl rand -hex 32
```

将最后一条命令的输出填入 `.env.deploy` 的 `POSTGRES_PASSWORD`，然后设置：

- `WORKSPACE_EMAIL`：新数据库的工作区标识。
- `SYNC_WORKER_TOKEN`：用 `openssl rand -hex 32` 生成的独立随机令牌，供内部同步 worker 使用，不得复用数据库密码。
- `TAILSCALE_ALLOWED_LOGIN`：您登录 Tailscale 的精确邮箱。
- `BACKUP_ROOT`：仓库外的绝对目录。

在宿主机登录 Tailscale，预先建立私网 HTTPS 代理：

```bash
tailscale serve --bg 3000
tailscale serve status
```

如果 Tailscale 安装在 Windows，而项目运行于 WSL，请在 Windows PowerShell 中执行：

```powershell
& "$env:ProgramFiles\Tailscale\tailscale.exe" serve --bg 3000
& "$env:ProgramFiles\Tailscale\tailscale.exe" serve status
```

部署验证脚本会自动识别 WSL 中的 Linux CLI 或 Windows `tailscale.exe`。

把输出的 `https://<device>.<tailnet>.ts.net` 填入 `.env.deploy` 的 `APP_ORIGIN`，不要增加路径、查询参数或结尾斜杠。

启动：

```bash
export COMPOSE_ENV_FILES=.env.deploy
docker compose config --quiet
docker compose up -d --build
docker compose ps
docker compose logs migrate
curl --fail http://127.0.0.1:3000/api/health
```

`migrate` 服务会先检查配置，然后执行 Prisma 生产迁移。空数据库会创建唯一工作区用户；已有一个用户时不会覆盖。如检测到多个用户，应用会拒绝启动。

安装 Tailscale 的手机可直接在浏览器打开 `APP_ORIGIN`。未加入 Tailnet 的设备无法访问。

## 3. 迁移现有数据

完整迁移必须使用 PostgreSQL custom-format dump。当前 `data/fund-research.snapshot.json` 只是研究数据子集，不能代替整库备份。

先在原环境生成 `.dump`，再在新主机仅启动数据库：

```bash
COMPOSE_ENV_FILES=.env.deploy docker compose up -d db
```

恢复命令会先对目标库创建强制安全备份，然后覆盖目标库并执行未应用的迁移：

```bash
docker compose stop app
COMPOSE_ENV_FILES=.env.deploy \
BACKUP_ROOT=/srv/portfolio-journal-backups \
RESTORE_CONFIRM=portfolio_journal \
./script/docker-postgres-restore.sh /absolute/path/portfolio_journal.dump

docker compose up -d app
```

恢复是破坏性操作；`RESTORE_CONFIRM` 必须与容器内数据库名完全一致。如 dump 旁边存在 `.sha256`，脚本会先验证校验和。

## 4. 备份与恢复

手工备份：

```bash
COMPOSE_ENV_FILES=.env.deploy ./script/docker-postgres-backup.sh /srv/portfolio-journal-backups
```

脚本使用临时文件和原子重命名，生成 custom-format dump 及 SHA-256 校验和，文件权限为 600。默认保留 14 天，可用 `RETENTION_DAYS` 调整。

备份包含私人研究数据；如复制到云盘或移动磁盘，应使用加密存储。至少每月在隔离环境执行一次恢复演练。

## 5. 安全检查

自动验收应用、端口、容器权限、身份校验、安全响应头和 Tailscale HTTPS：

```bash
COMPOSE_ENV_FILES=.env.deploy npm run deploy:verify
```

如果还要重启数据库与应用，并验证工作区数据保留，只在可接受短暂停机时执行：

```bash
COMPOSE_ENV_FILES=.env.deploy VERIFY_RESTART=1 npm run deploy:verify
```

也可手工检查：

```bash
docker compose ps
tailscale serve status
ss -ltn
```

应满足：

- 应用只出现在 `127.0.0.1:3000`，不出现 `0.0.0.0:3000`。
- 宿主机没有 5432 监听端口。
- Tailscale 状态只显示 Serve，不显示 Funnel。
- 使用其他 Tailscale 账号访问时返回 403。
- `.env.deploy` 权限为 600，且 `git status` 不显示 `.env.deploy`、dump 或 snapshot。

建议在 Tailnet ACL 中只允许自己的账号访问运行本服务的设备。

## 6. 升级与回滚

升级前必须备份：

```bash
COMPOSE_ENV_FILES=.env.deploy ./script/docker-postgres-backup.sh /srv/portfolio-journal-backups
git fetch --tags
git checkout <release-tag>
docker compose up -d --build
docker compose ps
```

不要直接跟踪未标记的开发分支。如新版本包含数据库迁移，仅切回旧镜像不一定安全；回滚应恢复升级前 dump。

## 7. 常见错误

- `401 Tailscale identity is required`：正在绕过 Tailscale Serve 直接访问端口，或 Serve 未正常注入身份头。
- `403 This Tailscale identity is not allowed`：`TAILSCALE_ALLOWED_LOGIN` 与当前 Tailscale 登录邮箱不一致。
- `403 Request origin is not allowed`：`APP_ORIGIN` 与浏览器地址不一致。
- `503 Private access configuration is incomplete`：生产安全变量缺失。
- `migrate` 退出：执行 `docker compose logs migrate`，修正配置后重新执行 `docker compose up -d --build`。
