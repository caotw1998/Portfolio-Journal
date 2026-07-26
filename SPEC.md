# 基金研究台产品规格

## 产品边界

一期服务于中国公募基金研究，不提供组合记账、交易录入、持仓金额、盈亏流水或投资建议。组合权重、定投、再平衡和交易成本回测属于后续阶段。

## 用户流程

1. 打开系统后直接进入 `/research`，按代码或名称搜索公开基金目录。
2. 加入基金时立即同步档案、净值、经理、持仓/配置和规模。
3. 在 `/funds/[fundId]` 查看结构化研究数据、来源链接和时效。
4. 在 `/benchmarks` 录入并同步指数。
5. 在 `/compare` 选择 1–5 只基金和 1 个指数进行共同区间对比。

## 数据口径

- 基金对比优先累计净值，缺失时回退单位净值并给出警告。
- 对比区间为全部序列的共同覆盖范围。
- 图表仅向后填充已有观测，不使用未来数据。
- 指标在原生观测点计算：区间收益、年化收益、最大回撤、252 日年化波动率、零无风险利率夏普。
- 净值缓存 6 小时，档案 24 小时，经理、持仓和规模 7 天。

## 数据模型

- `Fund` / `UserFund`
- `FundNavSnapshot`
- `FundManagerTenure`
- `FundPortfolioReport` / `FundHolding`
- `FundScaleSnapshot`
- `FundSourceSnapshot`
- `BenchmarkInstrument` / `BenchmarkPriceSnapshot`
- `User` / `Session` / `AuditLog`

核心字段使用规范化关系表；原始公开响应仅存于来源快照，用于追溯和重新解析。

## API

- `GET /api/funds/search?q=`
- `GET|POST /api/funds`
- `GET|DELETE /api/funds/[id]`
- `POST /api/funds/[id]/sync`
- `POST /api/funds/sync`
- `GET /api/research/compare?fundIds=&benchmarkId=&from=&to=`
- `/api/benchmarks` 及其同步、排序、比较子接口

系统按单工作区模式运行：页面与研究数据接口统一绑定到唯一的数据拥有者，并继续校验基金关注关系或指数所有权。若数据库中存在多个数据拥有者，系统会拒绝请求并提示先整理工作区归属，避免静默串用数据。

## 公开来源策略

东方财富为核心公开采集源；中证指数与交易所页面用于指数和场内基金校验。非核心增强源默认关闭，失败不得阻断净值、档案等核心数据。所有分区应显示抓取时间、过期状态、错误和公开来源链接。
