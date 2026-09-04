# APIFIX AI — Official CLI Reference

The APIFIX CLI provides command-line automation for continuous integration pipelines, local benchmarking, and SRE operations.

## Installation

```bash
# Global installation or direct invocation
node cli/bin/apifix.js --help
```

## Available Subcommands

### 1. Benchmark & Load Testing
```bash
apifix benchmark --concurrency 25 --duration 30s --json
apifix load-test --concurrency 50 --json
```

### 2. Capacity & Sizing
```bash
apifix capacity --rps 250 --repairs 50 --json
```

### 3. SLO & Error Budget
```bash
apifix slo --window 1h --json
```

### 4. Chaos Testing
```bash
apifix chaos --scenario simulate_db_latency --duration 10s --json
```

### 5. Deployment Preflight & Smoke Tests
```bash
apifix preflight --env production --json
apifix smoke --json
apifix rollback-status --json
```
