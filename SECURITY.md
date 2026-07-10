# Security policy

## Supported versions

Only the latest tagged release is supported with security updates.

| Version | Supported |
| --- | --- |
| 1.1.x | Yes |
| 1.0.x | No |

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability. Use
[GitHub private vulnerability reporting](https://github.com/mdanderson978/ascend-site-admin/security/advisories/new)
so the report and any proof of concept remain confidential while the issue is
investigated.

Include the affected version, reproduction steps, potential impact, and any
suggested remediation. You should receive an acknowledgement within seven
days.

The admin server is intentionally unauthenticated and localhost-only. Running
it on a public interface or exposing it through a network proxy is outside the
supported security model.
