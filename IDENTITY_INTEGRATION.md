# APIFIX AI — Enterprise Identity & Single Sign-On (SSO) Integration

## 1. Overview & Supported Identity Providers

APIFIX AI Enterprise supports single sign-on (SSO) with automated JIT (Just-In-Time) user provisioning, directory synchronization, and group-to-role translation.

Supported IDP Protocols & Providers:
- **OpenID Connect (OIDC)**: Okta, Auth0, Ping Identity, CyberArk.
- **SAML 2.0**: Enterprise Okta, PingFederate, JumpCloud, OneLogin.
- **Microsoft Entra ID (Azure AD)**: Multi-tenant and single-tenant OIDC/SAML.
- **Google Workspace**: SAML 2.0 and OAuth 2.0 domains.

---

## 2. Configuration & Role Mapping Engine

Administrators can configure SSO for their organization via the Public API or Admin Console:

```http
POST /api/v1/sso/configure
Authorization: Bearer apifix_live_...
Content-Type: application/json

{
  "providerType": "OIDC",
  "issuerUrl": "https://login.microsoftonline.com/tenant-id/v2.0",
  "clientId": "client_app_123",
  "clientSecret": "secret_456",
  "roleMappings": {
    "APIFIX-ADMINS": "ADMIN",
    "APIFIX-SRE-LEADS": "SRE_ADMIN",
    "APIFIX-SECOPS": "SECURITY_ADMIN",
    "APIFIX-ENGINEERS": "DEVELOPER",
    "APIFIX-VIEWERS": "VIEWER"
  },
  "defaultRole": "MEMBER"
}
```

---

## 3. Just-In-Time (JIT) Provisioning Workflow

```
[User Sign-in] ──► [IDP Auth Challenge] ──► [IDP Returns Claims/Assertion]
                                                        │
                                    ┌───────────────────┴───────────────────┐
                                    ▼                                       ▼
                            [OIDC JWT Claims]                       [SAML Response]
                                    │                                       │
                                    └───────────────────┬───────────────────┘
                                                        ▼
                                          [Validate Issuer & Signature]
                                                        │
                                          [Check Organization SSO Config]
                                                        │
                                          [Translate IDP Groups to Role]
                                                        │
                                       [Find or JIT Provision User Store]
                                                        │
                                        [Emit Phase 20 Audit Ledger Log]
                                                        │
                                           [Issue APIFIX JWT Session]
```

---

## 4. Audit & Immutability

All SSO configurations, callback executions, and role changes are recorded in the immutable SHA-256 chained audit ledger with actor context, timestamp, and client IP.
