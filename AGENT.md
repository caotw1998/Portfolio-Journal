# Portfolio Journal Agent Guide

## 1. 当前项目状态

- 当前分支：`fix/codex-ingest-asset-lookup`
- 当前阶段：`Phase 5 已完成 + 数据录入与测试安全性增强`
- 当前工作区：交接时不假设干净，接手前必须先看 `git status --short`

当前已经落地：

- Next.js App Router 工程骨架
- Prisma 数据模型与数据库访问层
- 认证与会话：注册 / 登录 / 登出 / cookie session
- 核心 API：`portfolios / transactions / holdings / performance / audit`
- 重算链路：dirty queue + recalc worker + 手动全量重算
- Web 页面：
  - `/login`
  - `/dashboard`
  - `/transactions`
  - `/portfolio`
  - `/performance`
  - `/journal`
  - `/audit`
  - `/settings`
- 审计增强：筛选 / diff / rollback
- Codex 文本录入
- Codex CLI ingest 修复
- 交易自动同步系统持仓快照
- 高级统计
- ECharts 图表
- CSV 导入导出
- PostgreSQL 每日备份脚本
- 项目级数据库快照导入导出

当前真实边界：

- Codex 图片解析仍是 501 占位
- `recalc worker` 仍是雏形，不是生产级调度器
- 页面刷新联动仍是 `router.refresh + 手动 sync`
- CSV 导入目前支持交易和持仓，不支持 Excel 原生格式
- E2E 依赖本地 PostgreSQL 实例，需要预先创建测试库
- 系统自动持仓当前只维护最新快照，不生成完整历史仓位时间线
- git 跟踪的是项目快照文件，不是 PostgreSQL 原始数据目录

## 2. 项目定位

这是一个“双入口单数据库”系统：

- 入口 1：Codex，用于对话式录入和修正数据
- 入口 2：Web App，用于查看、校验、编辑和分析
- 中枢：后端 API + PostgreSQL，负责校验、写库、重算和审计

## 3. 核心约束

- 数据库是唯一事实源（SSOT）
- 所有写操作必须经过受控 API，不允许裸写数据库
- 所有关键写操作必须记录 `AuditLog`
- `DailyPerformance` 是派生数据，只能通过重算生成
- 页面展示以数据库最新结果为准，不以前端本地状态作为最终结果
- 认证已经接入，不允许继续依赖 demo user
- CSV 导入当前固定规则：
  - 不允许部分成功
  - 重复数据直接报错
  - 导出默认按当前筛选条件输出

## 4. 重要目录

```text
Portfolio Journal/
├── app/          # 页面与 Route Handlers
├── components/   # 页面与业务组件
├── lib/
│   ├── auth/     # password / session
│   ├── db/       # Prisma client
│   ├── api/      # API 公共辅助
│   └── domain/   # 领域逻辑
├── prisma/       # schema
├── data/         # 可提交的数据库快照
├── tests/        # unit / integration / e2e
├── plan/         # 计划与交接文档
├── script/       # 测试与启动脚本
├── SPEC.md
└── AGENT.md
```

## 5. 关键文件

优先阅读这些文件：

- `SPEC.md`
- `plan/phase5-plan.md`
- `plan/advanced-metrics-spec.md`
- `plan/ai-handoff.md`
- `prisma/schema.prisma`
- `lib/domain/system-holdings.ts`
- `lib/domain/performance.ts`
- `lib/domain/csv-transfer.ts`
- `data/README.md`
- `data/portfolio-journal.snapshot.json`
- `script/export-dev-database.js`
- `script/import-dev-database.js`
- `components/performance-panels.tsx`
- `components/dashboard-sections.tsx`
- `components/csv-import-panel.tsx`

## 6. 当前技术基线

- 前端：Next.js + TypeScript + Tailwind
- 后端：Next.js Route Handlers
- 数据库：PostgreSQL
- ORM：Prisma
- 认证：自建 password hash + session cookie
- 图表：`echarts` + `echarts-for-react`
- 测试：Vitest + Playwright

## 7. 本地常用命令

开发：

```bash
pnpm dev
```

Prisma：

```bash
pnpm db:generate
pnpm db:studio
pnpm db:export:data
pnpm db:import:data
```

测试：

```bash
pnpm test
pnpm test:integration
pnpm test:e2e
```

构建：

```bash
pnpm build
```

## 8. 当前测试现状

当前本轮验证已通过：

- `pnpm test`
- `pnpm test:integration`

测试基线：

- 单测：8 文件，33 测试
- 集成测试：6 文件，21 测试

本轮未重跑：

- `pnpm test:e2e`
- `pnpm build`

E2E 与集成测试已切换为本地 PostgreSQL 测试库：

- `portfolio_journal_e2e`
- `portfolio_journal_integration`

如果要调整 E2E 或集成测试，先查：

- `script/run-e2e-web.sh`
- `script/run-integration-tests.sh`
- Playwright WebServer 依赖的数据库连接方式
- 本地 PostgreSQL 测试库是否存在
- integration 测试现在禁止连接非测试库，且不再通过 `force-reset` 或全表 `deleteMany()` 清空数据库

## 9. 协作规则

- 需求不明确时先澄清
- 修改超过 3 个文件时先拆成小任务
- 修 bug 先补能复现的测试再修
- 改代码前先确认现有测试基线
- 保持现有风格，不重构未涉及代码
- 不为假想需求预留扩展点
- 不读取或输出 `.env` 内容
- 计划文档写进 `plan/`
- 脚本写进 `script/`
- 非经明确要求，不自动提交或推送

## 10. 前端规则

- 优先按 App Router 组织页面
- 页面先保证数据链路正确，再做复杂视觉
- 编辑动作以数据库写回成功为准
- Dashboard / Portfolio / Transactions / Performance / Audit / Settings 保持 `loading / empty / error` 思路
- 图表统一走 ECharts 封装层，不要把 option 生成散落在页面逻辑里
- CSV preview 当前已是表格视图，继续优化时优先做可读性，不要过度复杂化

## 11. 后端规则

- Codex 与 Web App 最终应共用同一套写入校验逻辑
- 交易、持仓、价格等主数据变更后必须进入 dirty queue
- 重算默认从受影响日期向后增量执行
- 所有历史修正必须可追踪来源：`codex / web / system / import`
- CSV 导入必须坚持“全有或全无”，不要偷偷退化成部分成功
- `buy/sell` 交易现在会自动同步 `source=system` 的持仓快照
- 数据库快照入 git 走 `data/portfolio-journal.snapshot.json`，不要提交 PostgreSQL 原始数据目录

## 12. 当前边界

- `recalc worker` 仍是雏形，不是生产级任务系统
- 页面刷新联动目前还是 `router.refresh + 手动 sync`
- Codex 图片解析未实现
- CSV preview 已有表格视图，但还不是最终精修版
- E2E 依赖本地 PostgreSQL 实例，不要假设测试库已经创建
- 备份脚本已存在，但恢复流程仍需继续演练和固化

## 13. 下一步建议

Phase 5 已完成收尾，当前最合理的下一步是先决定方向：

1. 继续做 Codex 图片解析
2. 不扩功能，进入稳定、发布或部署
3. 优化现有功能，例如 CSV preview、生产级 recalc worker、图表交互、恢复演练流程

如果是新的 AI 或新的对话接手，先读：

1. `SPEC.md`
2. `AGENT.md`
3. `plan/phase5-plan.md`
4. `plan/advanced-metrics-spec.md`
5. `plan/ai-handoff.md`

然后先跑：

```bash
git branch --show-current
git status --short
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm build
```
