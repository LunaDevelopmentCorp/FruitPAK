# FruitPAK Project Context — Review & Discussion Points

**Reviewed:** March 2026
**Purpose:** Points raised from reviewing CLAUDE_PROJECT_CONTEXT.md that need client clarity or decisions before moving forward.

---

## 1. JWT in localStorage (Security)

**Current state:** Tokens stored in browser localStorage. Listed as the #1 pre-production security risk in the context doc.

**The issue:** Any JavaScript running on the page (including third-party scripts, browser extensions, or an XSS vulnerability) can read the token and impersonate the user. This is the single most exploitable vulnerability in the current system.

**The fix:** Migrate to HttpOnly cookies. The backend sets the token as a cookie that JavaScript cannot read. Requires changes to the auth endpoints, the frontend API client, and CORS config. Estimated scope: moderate — the auth layer is well-structured, so the migration is mechanical rather than architectural.

**Question for client:**
- Is there a target date for first tenant onboarding? This fix must happen before any real user data flows through the system.
- Are there any third-party scripts or analytics tools planned for the web app? (These increase the XSS attack surface.)

---

## 2. CI/CD Deployment (Still Stubs)

**Current state:** The GitHub Actions pipeline runs tests, lint, type checks, and security scans — but the actual deployment steps are placeholder `echo` commands with TODO comments.

**The issue:** There is no automated path from "code merged" to "running in production." Every deployment would need to be done manually, which introduces human error and slows down release cadence.

**Question for client:**
- What is the target AWS infrastructure? ECS (Fargate or EC2), plain EC2 with Docker Compose, or something else?
- Who manages the AWS account — Luna Development, the client, or a third party?
- Is there a preference for blue/green deployments, rolling updates, or simple restart-based deployments?
- Is there a staging environment already provisioned, or does that need to be set up as part of this work?

---

## 3. Packhouse Scoping Migration (Blocking Edge Deployment)

**Current state:** Core operational tables (batches, pallets, lots) already have `packhouse_id`. But several important tables do not yet: growers, harvest_teams, suppliers, packaging_stock, product_configs, box_sizes, pallet_types, grade_rules.

**The issue:** Without `packhouse_id` on these tables:
- Multi-packhouse tenants on AWS see all data across all packhouses (growers, stock, etc.), which may not be desired
- Phase 2/3 edge deployment cannot filter replication by packhouse
- The `get_packhouse_scope` dependency in the API layer has nothing to filter on for these tables

**Question for client:**
- For tenants with multiple packhouses TODAY, should growers/suppliers/stock already be scoped per packhouse, or is tenant-wide visibility acceptable for now?
- Which tables are highest priority? Packaging stock and growers seem most operationally important — do you agree?
- Is edge deployment (Phase 2) on the near-term roadmap, or is this a 6+ month horizon item? This affects how urgently we need the migration.

---

## 4. External Integration Surface (QMS and Beyond)

**Current state:** The FruitQMS integration is now actively being built against FruitPAK's standard API endpoints. There is no dedicated integration API layer — QMS uses the same endpoints as the web frontend with a dedicated user account.

**The issue:** The project context document doesn't mention the integration surface at all. As more external systems connect (QMS, accounting software, logistics platforms), we need clarity on:
- API versioning strategy (currently no versioning — breaking changes would affect all consumers)
- Rate limit allocation for integration users vs human users
- Audit trail for external system writes (currently logged the same as human user actions)

**Question for client:**
- Besides QMS, are there other external systems planned to integrate with FruitPAK? (Accounting, logistics, cold chain monitoring, PPECB/compliance reporting?)
- Should we implement API versioning now (e.g. `/api/v1/batches/`) or wait until a breaking change forces it?
- Do integration users need a separate authentication mechanism (API keys) or is the current JWT-with-dedicated-user approach acceptable?

---

## 5. Backup & Disaster Recovery

**Current state:** The context document covers replication for edge sync but does not mention backup strategy, point-in-time recovery, or disaster recovery for the AWS database.

**The issue:** FruitPAK manages operational data that drives packhouse production daily. If the database is lost or corrupted, the business stops. AWS RDS provides automated backups, but the retention period, recovery objectives, and procedures need to be defined.

**Question for client:**
- Is the PostgreSQL database on RDS (managed) or self-hosted on EC2?
- If RDS: what backup retention is configured? (Default is 7 days — is that sufficient?)
- What is the acceptable Recovery Point Objective (RPO)? i.e., how much data loss is tolerable? (minutes? hours? a full day?)
- What is the acceptable Recovery Time Objective (RTO)? i.e., how long can the system be down before it's a serious problem?
- Is there a requirement for cross-region backup or replication for disaster recovery?

---

## 6. HTTPS/TLS in Production

**Current state:** TLS config exists in nginx.conf but is commented out. The system currently runs HTTP only.

**The issue:** Without TLS, all traffic (including JWT tokens, passwords, and production data) is transmitted in plaintext. This is a hard requirement for production.

**Question for client:**
- Will TLS be terminated at the AWS Application Load Balancer (recommended) or at the Nginx layer?
- Do you have SSL certificates provisioned, or should we use AWS Certificate Manager (free, auto-renewing)?
- Is there a domain name allocated for the API? (e.g., api.fruitpak.com)

---

## 7. Monitoring & Alerting

**Current state:** The backend exposes `/metrics` (JSON format), has Sentry integration ready (opt-in), and has a /system-health admin dashboard. But there is no external monitoring, no alerting, and metrics are not in Prometheus format.

**The issue:** In production, nobody will be watching the /system-health dashboard 24/7. The system needs to alert when things go wrong — database connection pool exhaustion, high error rates, disk filling up, cache failures.

**Question for client:**
- Is there an existing monitoring stack (Datadog, CloudWatch, Grafana Cloud) that FruitPAK should integrate with?
- Who receives alerts? (Dev team, ops team, client IT?)
- What alerting channels? (Email, Slack, SMS, PagerDuty?)
- Is the Sentry DSN available, or does a Sentry project need to be created?

---

## 8. Mobile App Decision

**Current state:** The mobile app (React Native/Expo) is deprioritised. Only 4 screens implemented, missing critical infrastructure (token refresh, i18n, error handling). Decision made to use web app on tablets via kiosk mode instead.

**The issue:** The mobile app code is still in the repo. It's not harmful, but it creates confusion about what's active and what's abandoned. More importantly, the tablet/kiosk strategy needs validation.

**Question for client:**
- Has the Cleyver XTREM tablet been physically tested with the web app? (Screen size, touch targets, camera barcode scanning?)
- Should the mobile app directory be archived/removed from the active repo to avoid confusion?
- Is there any scenario where a native mobile app would be reconsidered? (e.g., offline scanning in orchards with no Wi-Fi)

---

## 9. Multi-Currency & Financial Module

**Current state:** Multi-currency support has been implemented. Financial config exists (Step 8 of wizard, optional).

**Question for client:**
- How is the financial module being used in practice? Is it actively used by any test tenant?
- Are there accounting/ERP integrations planned that would need to pull financial data from FruitPAK?
- Does the financial module need to handle VAT/tax calculations, or is that handled externally?

---

## 10. Data Retention & Compliance

**Current state:** No data retention policy is defined. All data is kept indefinitely.

**The issue:** Over seasons, the database will grow significantly. Fruit packhouse operations are seasonal — last season's batch-level data may not need to be instantly queryable. Additionally, depending on the jurisdictions FruitPAK operates in, there may be regulatory requirements around data retention (POPI Act in South Africa, GDPR if EU markets are involved).

**Question for client:**
- Are there regulatory data retention requirements for the markets being served?
- After a season closes, should historical data be archived to cheaper storage, or kept live for reporting?
- Is there a data deletion requirement (right to erasure) for any user-facing data?

---

## Summary — Priority Order (Recommended)

| # | Item | Urgency | Blocks |
|---|------|---------|--------|
| 1 | JWT to HttpOnly cookies | Before production | Security |
| 2 | HTTPS/TLS | Before production | Security |
| 3 | CI/CD deployment | Before production | Release process |
| 4 | Backup & DR strategy | Before production | Data safety |
| 5 | Monitoring & alerting | At launch | Operational visibility |
| 6 | External integration strategy | Soon | QMS + future integrations |
| 7 | Packhouse scoping migration | Before edge deployment | Phase 2/3 |
| 8 | Data retention policy | Within first season | Compliance + performance |
| 9 | Mobile app decision | Low | Repo hygiene |
| 10 | Financial module validation | Low | Depends on client usage |

---

**Next step:** Get client responses to the questions above, then we prioritise and schedule the work accordingly.
