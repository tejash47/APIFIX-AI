# APIFIX AI — Enterprise Governance & Compliance

APIFIX includes enterprise governance controls to manage autonomous actions across production systems.

## Policy Engine Structure

Every governance policy consists of:
- **Condition**: Environment, Risk Score, File Scope, or Affected Endpoint.
- **Action**: `REQUIRE_APPROVAL`, `BLOCK_REPAIR`, `ALLOW_AUTO_DEPLOY`.
- **Reason**: Auditable justification string recorded in the Merkle audit ledger.

## Example Policy Definition

```json
{
  "policyId": "pol_require_admin_on_auth",
  "name": "Require Admin Approval for Authentication Changes",
  "conditions": {
    "files": ["src/controllers/auth.js", "src/middleware/jwt.js"],
    "minRiskScore": 50
  },
  "action": "REQUIRE_APPROVAL",
  "requiredRoles": ["ADMIN", "OWNER"]
}
```
