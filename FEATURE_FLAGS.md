# APIFIX AI — Enterprise Feature Flags & Safe Rollout (Phase 22)

## Flag Architecture & Scoping

The feature flag engine supports hierarchical evaluation:

1. **Explicit Target Entity:** Direct inclusion by User ID, Workspace ID, or Organization ID.
2. **Organizational Scope:** Active for all workspaces within a specific enterprise tenant.
3. **Workspace Scope:** Active for a single designated workspace.
4. **Deterministic Percentage Rollout:** Calculated via $\text{SHA-256}(\text{flagName} + \text{entityId}) \pmod{100} < \text{percentage}$.

---

## API & CLI Usage

### Check / List Flags
```bash
apifix feature-flags list --json
```

### Mutate Flag (Admin / Owner Role Required)
```http
POST /api/v1/feature-flags
Content-Type: application/json
Authorization: Bearer <ADMIN_KEY>

{
  "name": "autonomous_repair_v22",
  "enabled": true,
  "scope": "GLOBAL",
  "rolloutPercentage": 100
}
```
