# APIFIX AI — Production SRE Metrics & Prometheus Catalog (Phase 22)

## Standard Prometheus Metrics (`GET /metrics`)

| Metric Name | Type | Description |
| :--- | :--- | :--- |
| `apifix_http_requests_total` | Counter | Cumulative HTTP requests served |
| `apifix_http_errors_total` | Counter | Cumulative HTTP error responses ($\ge 400$) |
| `apifix_http_duration_seconds` | Gauge | Request duration quantiles (0.5, 0.95, 0.99) |
| `apifix_repair_mttr_seconds` | Gauge | Mean Time to Repair (MTTR) |
| `apifix_worker_queue_depth` | Gauge | Active background job queue depth |
| `apifix_worker_active_count` | Gauge | Number of actively processing worker leases |
| `apifix_db_query_latency_seconds` | Gauge | Database query p95 latency |
| `apifix_finops_monthly_spend_dollars` | Gauge | Current monthly platform spend in USD |
| `apifix_finops_cost_per_verified_repair_dollars` | Gauge | Operational unit cost per verified repair |

---

## Scraping with Prometheus

Add to your `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: 'apifix-backend'
    scrape_interval: 15s
    metrics_path: '/metrics'
    static_configs:
      - targets: ['apifix-backend:4000']
```
