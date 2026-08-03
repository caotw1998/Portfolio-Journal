# 基金研究台

面向中国公募基金的信息搜集与指数对比系统。当前一期支持场外基金、ETF、LOF 与 QDII 的远程搜索、按需加入、结构化资料同步、研究详情，以及最多 5 只基金与 1 个指数的共同区间对比。

## 核心能力

- 东方财富公开基金目录、F10、净值与档案数据采集。
- 基金净值、经理、季度持仓、资产配置、规模和来源快照。
- 缓存过期与部分失败提示，支持单只或全部手动刷新。
- 指数录入、全收益指数搜索、公开行情与官方估值同步、排序和横向比较。
- 累计净值优先的基金/指数归一化对比，以及区间收益、年化收益、最大回撤、波动率和夏普。
- 用户级研究库隔离；不保存组合金额、持仓数量、交易或收益流水。

## 本地开发

```bash
pnpm install
pnpm exec prisma generate
pnpm dev
```

数据库连接通过进程环境提供。不要把密码、数据库 URL 或真实数据库快照提交到仓库。

## 私人部署

推荐使用 Docker Compose 在自己的电脑、NAS、迷你主机或 VPS 运行，通过 Tailscale Serve 私网访问。应用默认只绑定宿主机 localhost，PostgreSQL 不映射宿主端口。

```bash
cp deploy.env.example .env.deploy
chmod 600 .env.deploy
tailscale serve --bg 3000
docker compose --env-file .env.deploy up -d --build
```

部署前必须替换 `.env.deploy` 中的所有示例值，并使用 `docker compose --env-file .env.deploy ...`。详细的首次安装、手机访问、现有数据迁移、备份、恢复和升级步骤见 [私人部署指南](docs/private-deployment.md)。不要做路由器端口转发，不要启用 Tailscale Funnel。

## 验证

```bash
npm test
npm run lint
npm run build
TEST_DATABASE_URL=postgresql://... npm run test:integration
E2E_DATABASE_URL=postgresql://... npm run test:e2e
pnpm audit --prod --audit-level high
pnpm release:check
```

集成与 E2E 数据库名称必须以 `_integration`、`_e2e` 或 `_test` 结尾。

## 公开源码与维护

公开仓库只保存程序、迁移、文档和合成测试数据，不保存任何用户研究数据或部署配置。功能开发从 `main` 建分支，经 CI、CodeQL 和代码审查后合并；Dependabot 每周检查 npm、Docker 与 GitHub Actions 更新。发布或部署升级前先做数据库备份，升级后执行 `pnpm deploy:verify`。

提交代码前请阅读 [贡献指南](CONTRIBUTING.md) 与 [安全策略](SECURITY.md)。

## 数据备份

- Docker 私人部署完整备份：`script/docker-postgres-backup.sh`，写入工作区外。
- 原生 PostgreSQL 环境完整备份：`script/postgres-backup.sh`。
- 研究数据导入导出：`npm run db:export:data` / `npm run db:import:data`。
- 默认研究快照路径：`data/fund-research.snapshot.json`，不建议提交真实数据。
