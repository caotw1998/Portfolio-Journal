# Research data snapshots

开发数据库导出默认写入 `data/fund-research.snapshot.json`。快照只包含工作区归属、基金研究库、结构化基金资料、指数和通用审计记录，不包含交易、持仓金额或组合业绩。

数据库完整备份仍由 `script/postgres-backup.sh` 写入工作区外目录；不要把实际数据库备份提交到 Git。

人工取得的真实估值文件统一保存在 `data/private-imports/`。该目录同时被 Git 和 Docker 构建上下文忽略；生产导入时只允许通过一次性的只读挂载提供给导入脚本。
