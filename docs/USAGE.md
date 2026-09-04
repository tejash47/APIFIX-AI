# APIFIX AI — Usage Metering & Credit Consumption

APIFIX provides granular visibility into token consumption, AI provider costs, and repair execution fees.

## Credit Consumption Schedule

| Operation Type | Credits Consumed | FinOps Unit Cost (USD) |
| :--- | :--- | :--- |
| **API Health Check** | 0.001 CR | $0.0000001 |
| **Incident Ingestion & Classification** | 0.100 CR | $0.0002000 |
| **AI Root Cause Investigation** | 1.000 CR | $0.0025000 |
| **AST Patch Generation** | 1.000 CR | $0.0010000 |
| **Ephemeral Sandbox Verification** | 0.500 CR | $0.0005000 |

## Warning Thresholds

- **80% Consumed**: Informational warning badge displayed in UI header.
- **90% Consumed**: Yellow banner + email alert to workspace admin.
- **100% Consumed**: Autonomous execution paused; requires credit top-up or upgrade.
