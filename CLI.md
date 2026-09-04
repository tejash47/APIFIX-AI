# APIFIX AI — Official Enterprise CLI Tool

## 1. Overview & Installation

The Official APIFIX CLI (`apifix`) provides command-line automation for local developer workflows, verification gates, and CI/CD pipelines.

### Global Installation

```bash
npm install -g @apifix/cli
```

Or execute directly with `npx`:

```bash
npx @apifix/cli --help
```

---

## 2. Command Reference

### Authentication & Status

```bash
# Save API key and base URL to ~/.apifix/config.json
apifix login <api_key> --base-url "https://api.apifix.ai"

# Check platform status and subsystem health
apifix status --json
```

### Continuous Verification Quality Gate

```bash
# Execute verification gate for project
apifix verify proj_api_gateway --json

# In CI/CD pipelines, exit code 0 indicates clean pass, 1 indicates contract drift or test failure
apifix verify proj_api_gateway || exit $?
```

### Autonomous Investigation & Repair

```bash
# Analyze project failure and generate patch candidate
apifix repair analyze proj_api_gateway --json

# Apply validated patch to target repository
apifix repair apply proj_api_gateway patch_1725432000
```

### Runs & Webhooks

```bash
# Trigger autonomous run
apifix runs trigger proj_api_gateway

# Inspect in-flight run status
apifix runs status run_1725432000

# List registered webhook subscriptions
apifix webhooks list --json

# Replay dead-letter delivery
apifix webhooks replay whd_1725432000
```

### API Key Management

```bash
# List all workspace API keys
apifix api-keys list

# Create scoped API key
apifix api-keys create "CI Key" read:projects write:runs verify:all

# Revoke an API key
apifix api-keys revoke key_1725432000
```

---

## 3. Deterministic CLI Exit Codes

APIFIX CLI guarantees predictable exit codes for CI/CD scripting:

| Exit Code | Name | Description |
| :---: | :--- | :--- |
| **0** | `SUCCESS` | Quality gate passed; all contract tests succeeded. |
| **1** | `VERIFICATION_FAILURE` | Verification failed, API drift detected, or patch rejected. |
| **2** | `CONFIG_OR_AUTH_ERROR` | Missing or invalid API key, unauthenticated, or invalid CLI flag. |
| **3** | `RATE_LIMIT_EXCEEDED` | Request throttled by server rate limiter or quota exhausted. |
| **4** | `NETWORK_OR_TIMEOUT_ERROR` | Connectivity failure, connection refused, or HTTP timeout. |
| **5** | `INTERNAL_SERVER_ERROR` | Unhandled API exception or server failure (5xx). |
