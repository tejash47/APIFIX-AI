# APIFIX AI — Enterprise Security & Compliance Architecture

Security is central to the APIFIX AI control plane.

## Security Controls

1. **Zero-Secret Storage**: Multi-pass regex scrubbing redacts private keys, tokens, and credentials before logging or prompt transmission.
2. **Row-Level Tenant Isolation**: All database queries and queue leases are strictly scoped to authenticated workspace IDs.
3. **AST Boundary Verification**: Patches modifying files outside the target workspace or importing unauthorized modules are rejected immediately.
4. **SSRF Protection**: Outbound webhook URLs and probing targets are validated against private IP ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.0/8`).
5. **HMAC-SHA256 Webhook Signatures**: All inbound and outbound webhook deliveries require cryptographic signature headers.
