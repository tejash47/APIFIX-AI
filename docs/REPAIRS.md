# APIFIX AI — Autonomous Repair Lifecycle Guide

This document describes the internal state machine governing autonomous repair workflows.

## State Transitions

```
[INCIDENT_INGESTED]
        ↓
 [INVESTIGATING] (AI Multi-Provider Cascade)
        ↓
 [PATCH_GENERATED] (AST Syntax Validation)
        ↓
 [GOVERNANCE_CHECK] (Risk Scoring & Policies)
        ↓
 [AWAITING_APPROVAL] (Optional Human Gate)
        ↓
 [SANDBOX_PROBING] (Ephemeral Dynamic Port)
        ↓
    [VERIFIED] (Regression Tests Passed)
        ↓
    [DEPLOYED] (Canary / Pull Request Created)
```

## Failure Recovery & Rollback

If a patch fails AST syntax validation or fails sandbox regression probes, the run transitions to `VERIFICATION_FAILED` and the working directory is immediately reverted with zero modifications to original source files.
