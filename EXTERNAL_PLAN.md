# DevClip External & Hosted Roadmap

> **This document tracks features that require external infrastructure, hosted services, or community-maintained distribution channels.**
> These items cannot be implemented directly in the open-source repository and require separate infrastructure, partnerships, or community contribution.

---

## Hosted Services (DevClip Cloud)

These features require a hosted backend infrastructure operated by DevClip or self-hosted Enterprise customers with full cloud resources.

### 1. DevClip-Managed Multi-Tenant Sync Cloud
**Status:** Partial — `DevClip-Cloud` repo bootstrapped with sync MVP scaffolding (REST sync contract + real-time WS + admin/API stubs)

- [x] Multi-tenant sync cloud foundation (new `DevClip-Cloud` repo) with fleet provisioning scaffolding endpoints
- [x] Tenant-authenticated WebSocket realtime notifications (`/v1/realtime` upgrade Authorization)
- [x] S3-compatible encrypted bundle persistence adapter wired into sync endpoints (when S3 env vars are configured)
- [x] Global CDN foundation for encrypted sync bundles (presigned PUT/GET URLs endpoint)
- [x] Regional data residency scaffolding (deterministic tenant-to-region routing via `S3_REGIONS_JSON`)
- [x] Automatic scaling foundations (repo-scoped `/v1/metrics` + deployment templates)
- [x] Serverless sync endpoints foundations (contract adapter scaffold for HTTP sync contract)

**Why External:** Requires 24/7 infrastructure, DDoS protection, global CDN, database operations, and billing integration. Not suitable for a desktop-only open-source repo.

---

### 2. In-Dashboard Analytics & Usage
**Status:** Partial — `DevClip-Cloud` provides analytics summary + Enterprise panel fetches and renders usage/seats (via `syncRemoteUrl`).

- [x] Real-time seat utilization dashboard (repo-scoped metrics + Enterprise panel UI)
- [x] Usage analytics scaffolding (audit_events_7d + bundles_uploaded_7d)
- [ ] Billing management UI
- [ ] Invoice and payment history
- [ ] Team member activity timeline

**Why External:** Requires secure aggregation of customer data, billing system integration, and a web-based admin interface separate from the desktop app.

---

### 3. Centralized Audit Aggregation
**Status:** Partial — `DevClip-Cloud` provides audit ingestion endpoints plus admin export scaffolding (`POST /api/v1/audit/ingest`, `GET /api/v1/audit/summary`, `GET /api/v1/admin/audit/export`) and SIEM streaming scaffold (`POST /api/v1/admin/audit/stream`).

- [x] Organization-wide audit log aggregation *(repo-scoped export/summary scaffolding; full UI and retention still hosted)*
- [ ] Compliance dashboards (SOC 2, GDPR)
- [ ] Anomaly detection on audit patterns
- [ ] Long-term audit archival (7-year retention)
- [x] Audit log streaming to SIEM (Splunk, Datadog) *(webhook publish scaffold via `SIEM_WEBHOOK_URL`)*

**Why External:** Requires high-volume log ingestion, compliance certifications, and long-term storage infrastructure.

---

### 4. Version History for Shared Snippets
**Status:** Partial — implemented MVP version storage + word-diff metadata + version list/get/restore scaffolding in `DevClip-Cloud`

- [x] Automatic versioning when snippets are modified *(scaffolded; needs snippet update hook integration)*
- [x] Diff metadata between versions (word-level diff metadata persisted)
- [x] Restore previous version *(endpoint scaffolded)*
- [x] Version author and timestamp tracking
- [ ] Comment/annotation on versions *(future)*

**Why External:** Requires server-side storage of version history and conflict resolution logic for concurrent edits.

---

### 5. Approval Workflow for Snippet Changes
**Status:** Partial — version records include `approval_state`; approval submit/approve/reject endpoint scaffolded in `DevClip-Cloud`

- [x] Submit snippet changes for approval *(approval endpoint scaffolding)*
- [ ] Designated approvers (admins/owners) *(future enforcement)*
- [ ] Approval notifications via email/WebSocket
- [x] Reject with comments *(approval endpoint scaffolding)*
- [ ] Audit trail of approvals *(future integration)*

**Why External:** Requires workflow engine and notification infrastructure.

---

### 6. Dedicated Slack/Teams Channel Support
**Status:** Not implemented — vendor commercial offering

- [ ] Private Slack Connect channel per Enterprise customer
- [ ] Teams integration for support tickets
- [ ] Priority response guarantees
- [ ] Escalation procedures

**Why External:** Requires vendor organization, staffing, and commercial support agreements.

---

## Distribution & Publishing

These require accounts or approval from third-party organizations.

### 7. WinGet Package Publishing
**Status:** Not implemented — requires Microsoft Partner Center account

- [ ] Submit to Windows Package Manager (winget-pkgs repo)
- [ ] Automated version updates via CI
- [ ] Signature validation in WinGet

**Why External:** Requires Microsoft Partner Center account and approval process.

---

### 8. Homebrew Cask Publishing
**Status:** Not implemented — requires Homebrew tap maintainer

- [ ] Official Homebrew tap (homebrew-cask)
- [ ] Automatic version bump PRs
- [ ] Bottle builds for Apple Silicon

**Why External:** Requires acceptance by Homebrew maintainers and community maintenance.

---

### 9. Linux AUR (Arch User Repository)
**Status:** Template created — requires community maintainer

- [ ] PKGBUILD maintained in AUR
- [ ] Community votes for inclusion in official repos
- [ ] Binary package in chaotic-aur

**Why External:** AUR is community-maintained. Template provided in `dist/aur/` but requires community member to maintain.

---

## Mobile & Browser Ecosystem

These are separate products requiring different technology stacks.

### 10. Mobile Companion App
**Status:** Not implemented — separate product

- [ ] iOS app (Swift/SwiftUI)
- [ ] Android app (Kotlin/Jetpack Compose)
- [ ] Read-only sync viewer
- [ ] Mobile-optimized clip viewing
- [ ] Push notifications for sync events

**Why External:** Requires separate mobile codebase, app store developer accounts, and mobile-specific UI/UX design.

---

### 11. Browser Extension
**Status:** Not implemented — separate product

- [ ] Chrome extension (Manifest V3)
- [ ] Firefox addon
- [ ] Safari extension
- [ ] Capture clipboard without switching apps
- [ ] Quick snippet insertion in web apps

**Why External:** Requires browser-specific APIs, extension stores, and separate codebase.

---

## Plugin Ecosystem

### 12. Plugin/Extension API
**Status:** Not implemented — requires architecture definition

- [ ] Stable plugin API contract
- [ ] Sandboxed plugin execution
- [ ] Plugin marketplace/registry
- [ ] Community plugin submissions
- [ ] Documentation and SDK

**Why External:** Requires long-term API stability commitment, security sandboxing, and community building.

---

## JIT Provisioning Features

### 13. SAML JIT User Provisioning & Deprovision
**Status:** Partial — desktop SAML implemented, JIT requires backend

- [ ] Auto-create user account on first SAML login
- [ ] Deactivate account when removed from IdP
- [ ] Sync group memberships from IdP
- [ ] Attribute mapping configuration

**Why External:** Requires SCIM (System for Cross-domain Identity Management) endpoint and real-time IdP integration.

---

## Summary

| Category | Count | Notes |
|----------|-------|-------|
| Hosted Services | 6 | Require cloud infrastructure |
| Distribution | 3 | Require 3rd-party accounts |
| Mobile/Browser | 2 | Separate products |
| Ecosystem | 2 | Community/API projects |

**Total External Items:** 13

---

## For Contributors

If you're interested in working on any of these external items:

1. **Hosted Services:** Consider the self-hosted server (`/server`) as a starting point
2. **Distribution:** The templates in `dist/` (winget, homebrew, aur) are ready for submission
3. **Mobile/Browser:** These would be new repositories under the devclip org
4. **Plugins:** Help define the plugin API by opening an RFC issue

---

*Last updated: April 12, 2026 (DevClip-Cloud sync MVP scaffolding added)*
