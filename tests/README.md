# Tests

- `domain/fund-provider.test.ts`：公开基金目录、净值、档案、经理和规模解析。
- `domain/research-comparison.test.ts`：共同区间、向后填充及五项指标。
- `domain/fund-research-migration.test.ts`：研究关系回填顺序与记账表清理。
- `integration/`：在后缀为 `_integration`、`_e2e` 或 `_test` 的 PostgreSQL 数据库运行。
- `e2e/`：基金搜索、研究库、详情、指数和对比页面流程。
