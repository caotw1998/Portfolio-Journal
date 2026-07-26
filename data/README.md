# Research data snapshots

开发数据库导出默认写入 `data/fund-research.snapshot.json`。快照只包含工作区归属、基金研究库、结构化基金资料、指数和通用审计记录，不包含交易、持仓金额或组合业绩。

数据库完整备份仍由 `script/postgres-backup.sh` 写入工作区外目录；不要把实际数据库备份提交到 Git。
