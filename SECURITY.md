# Security Policy

## Supported versions

Only the latest published release is supported with security fixes. Older versions will not receive backports.

| Version | Supported |
|---|---|
| Latest release (`0.1.x`) | ✅ |
| Earlier versions | ❌ |

## Reporting a vulnerability

Please **do not** file security issues as public GitHub or Codeberg issues.

Instead, report privately by email to **v6t2b9@googlemail.com** with:

1. A description of the issue and its potential impact.
2. Steps to reproduce, including a minimal example if possible.
3. The plugin version and Obsidian version where you observed the issue.
4. Any suggested mitigation, if you have one.

I aim to acknowledge reports within **7 days** and to ship a fix or coordinated disclosure within **30 days** for confirmed issues. If you do not get a reply within 7 days, please open a non-sensitive Codeberg issue saying you sent a security email (without disclosing the details) so I can chase it.

## Threat model

This plugin runs entirely inside Obsidian, with no network access, no telemetry, no remote resources, and no privileged file-system access beyond what Obsidian itself grants. The realistic threat surface is:

- **Malicious JSON content** crashing or hanging the plugin (parser DoS, prototype-pollution-style payloads).
- **DOM injection** through a misrendered value (the tree renderer uses `setText`/`textContent`, never `innerHTML` with untrusted strings).
- **Path-disclosure** through error messages.

Issues outside this surface (e.g. supply-chain attacks on upstream `@codemirror/*` packages) should be reported to the upstream maintainers; I will pull in fixes as they land.
