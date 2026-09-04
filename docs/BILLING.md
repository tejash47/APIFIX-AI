# APIFIX AI — Billing & Subscription Management

APIFIX provides transparent, credit-metered subscription billing powered by Stripe.

## Subscription Tiers

1. **Free Tier**: 3 autonomous repairs / month, community support.
2. **Pro Tier ($49/mo)**: 50 autonomous repairs / month, GitHub PR automation, FinOps tracking.
3. **Team Tier ($199/mo)**: 250 autonomous repairs / month, multi-reviewer governance, SHA-256 audit ledger.
4. **Enterprise (Custom)**: Custom volume, SAML/SCIM SSO, dedicated worker cluster, 99.99% SLA.

## Lifecycle States

- `TRIAL`: Full access during trial evaluation window.
- `ACTIVE`: Normal operating subscription.
- `PAST_DUE`: In grace period after failed invoice attempt.
- `CANCELED`: Account downgraded to Free tier at period end.
- `INCOMPLETE`: Awaiting payment confirmation.
