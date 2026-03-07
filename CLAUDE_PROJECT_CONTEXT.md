# FruitPAK — Project Context & Session Notes

Last updated: March 2026

## What is FruitPAK?

A multi-tenant fruit packhouse management and export platform built for enterprises managing grower intake, packing, storage, palletizing, containerizing, and export — with full financial reconciliation. Proprietary to Luna Development Corp.

## Architecture

| Layer | Tech | Path |
|-------|------|------|
| Backend | Python 3.12, FastAPI, SQLAlchemy 2.0 (async), Alembic | `backend/` |
| Web | React 19, TypeScript (strict), TailwindCSS v4, Zustand | `web/` |
| Mobile | React Native (Expo) — early MVP, deprioritised | `mobile/` |
| Database | PostgreSQL 16 (hosted on AWS) | via Docker |
| Cache | Redis 7 | via Docker |
| Auth | JWT (HS256) + bcrypt + Twilio SMS OTP | `backend/app/auth/` |

### Multi-Tenancy

Schema-per-tenant PostgreSQL isolation. Each enterprise gets `tenant_<id>` schema. Shared tables (users, enterprises) in `public` schema. Tenant isolation has been verified as properly layered with defence in depth (ContextVar, session finally blocks, middleware cleanup, search_path set before every query).

## Current State (as of March 2026)

### Backend

- 100+ API endpoints across 24 routers
- 38 tenant-scoped tables + 2 public tables
- Granular RBAC with role defaults, custom roles, and per-user permission overrides
- Comprehensive middleware stack: RequestId tracing, security headers, HTTPS redirect, secure cookies, rate limiting (Redis + in-memory fallback), CORS, tenant context
- Structured JSON logging in production with request ID correlation
- Slow query detection (>1s) with health_log integration
- Redis caching with tenant-scoped keys, cache warming on startup, hit/miss metrics
- Daily reconciliation scheduler with Redis distributed locking
- /metrics endpoint exposing DB pool stats, Redis health, cache metrics
- Admin /system-health dashboard aggregating all operational warnings
- Sentry integration ready (opt-in via SENTRY_DSN env var)
- Production config validation (SECRET_KEY must be changed, debug defaults to False)
- API docs (/docs, /redoc) disabled when debug=False

### Web Frontend

- 36+ page components, 21 API modules, 16 shared components
- Sophisticated API client with GET deduplication, token refresh queue, error handling
- Full i18n (EN, ES, FR, PT) with 14 namespaces
- 3 Zustand stores (auth, packhouse, toast)
- Error boundary, global toast, role-based routing
- 8-step onboarding wizard with prerequisites
- Responsive layout with mobile hamburger menu

### Recent Additions (March 2026)

- Reports: production, grower summary, packout, performance, packing list (with PDF generation)
- Class 2 and returned-to-grower monitoring in production & grower summary reports
- Shipment document PDF generation (shipping & traceability packing lists)
- Shipping schedule integration (sailing schedule dropdowns in container workflow)
- Packing list search by ref number, customer, container number, shipping line, vessel name
- Multi-currency financial support
- Client management and pack specs pages

### Mobile App

Deprioritised — web on tablets via Scalefusion kiosk mode. Code remains in `mobile/` for potential future use.

### Infrastructure

- Docker Compose with Nginx load balancer (least_conn)
- DB/Redis ports bound to localhost only (not exposed externally)
- Backend uses expose (not ports) — internal only
- CI/CD pipeline: tests, lint, type check, Trivy security scan, build check
- Deployment steps are still stubs (echo commands with TODO comments)
- HTTPS/TLS config exists but is commented out in nginx.conf

## Completed Optimisation Steps

1. Pagination (cursor-based for batches, offset for others)
2. Database indexes (7 strategic composite indexes)
3. Docker scaling (3 backend replicas, Nginx load balancing)
4. Caching (Redis decorator-based, tenant-scoped, graceful degradation)
5. Security (headers, rate limiting, CORS, RBAC, OTP)
6. Migration safety (per-tenant versioning, backup, verification)
7. CI/CD (GitHub Actions pipeline)
8. Frontend error handling (error boundary, error types, retry logic)

## Outstanding Items

See **Project Context Review** section below for the full prioritised list with status tracking and client questions.

## External Integrations

### FruitQMS (Active)

QMS integrates via standard FruitPAK API endpoints using a dedicated JWT user account:
- Pulls batch/GRN data for intake inspections (`GET /api/batches/`)
- Syncs grower and packhouse records (`GET /api/growers/`, `GET /api/packhouses/`)
- Writes quality assessment results back (`PATCH /api/batches/{id}`)
- No webhooks — QMS polls with cursor pagination
- No API versioning yet (risk if endpoints change)
- Integration spec documented in FruitQMS repo: `FRUITPAK_INTEGRATION_QUESTIONS.md`

## Deployment Architecture (planned)

### Phase 1: AWS Only (current target — in progress)

- **Compute**: ECS (client setting up now)
- **Database**: PostgreSQL on RDS (already running)
- **Cache**: Redis — ElastiCache recommended (replaces Docker Redis)
- **Load balancer**: ALB with ACM TLS certificate (free, auto-renewing)
- **Domain**: Moving to Route 53 — all infrastructure consolidated under AWS
- **Container registry**: ECR for Docker images pushed from CI/CD
- **CI/CD flow**: GitHub Actions → build image → push to ECR → update ECS service
- All tenants and enterprises operate from AWS
- Works well for packhouses with reliable internet

**Domain Migration to Route 53 — Steps:**
1. Create hosted zone in Route 53 for the domain
2. Note the 4 NS records Route 53 assigns
3. At current registrar: update nameservers to the Route 53 NS records
4. Wait for DNS propagation (usually 24-48h, can be faster)
5. Request TLS certificate in ACM (must be in same region as ALB, or us-east-1 for CloudFront)
6. ACM validates via DNS — add the CNAME record it provides (one click if domain already in Route 53)
7. Attach ACM cert to the ALB HTTPS listener
8. Recommended DNS records: `fruitpak.com` → ALB (A alias), `api.fruitpak.com` → ALB (A alias), wildcard cert covers future subdomains (staging, docs, etc.)

### Phase 2: Single-Tenant Edge Deployment

For packhouses with unreliable internet, extract a **specific tenant** (not the whole app) to a local Mac Mini.

- **Architecture**: Per-tenant extraction using PostgreSQL logical replication
  - AWS publishes the tenant's schema tables
  - Edge Mac Mini subscribes and maintains a local replica
  - Edge writes go back to AWS via replication or API sync
  - Star topology: AWS is the hub, edge nodes are spokes
- **What runs on the Mac Mini**: Full Docker stack (backend, frontend, Nginx, PostgreSQL, Redis) but only for that tenant's data
- **Auth**: Local JWT auth with independent token issuance; user table replicated from AWS
- **Offline resilience**: Mac Mini operates independently; queues changes for sync when connectivity returns
- **Sync direction**: Bidirectional — edge authoritative for its local operational data, AWS authoritative for shared/config data

### Phase 3: Multi-Packhouse Edge (per-packhouse Mac Minis within one tenant)

When one tenant has multiple packhouses, each packhouse can have its own Mac Mini.

- **Architecture**: Each Mac Mini gets only its packhouse's data (filtered by `packhouse_id`)
  - Publication filter: `WHERE packhouse_id = '<this_packhouse_id>'` on packhouse-scoped tables
  - Shared/tenant-wide data (NULL packhouse_id) replicates to all edge nodes
  - Cross-packhouse operations (e.g. containers spanning packhouses) handled at AWS level
- **Sync topology**: Star — each edge node syncs with AWS, never directly with other edge nodes
- **Conflict resolution**: Last-write-wins with edge priority for its own packhouse data; AWS priority for shared data
- **Numbering coordination**: Packhouse-prefixed batch codes (e.g. `PH01-GRN-00001`) to prevent ID collisions across edge nodes

## Per-Packhouse Data Scoping

Within a single tenant, data is scoped to packhouses via nullable `packhouse_id` columns. The rule: `NULL` means tenant-wide (shared across all packhouses), a set value means packhouse-specific.

### Already Packhouse-Scoped (have packhouse_id FK)

- `batches` — fruit intake is always at a specific packhouse
- `pallets` — built at a specific packhouse
- `lots` — produced at a specific packhouse
- `batch_history` — inherits from batch

### Need packhouse_id Added (nullable FK)

| Table | Rationale |
|-------|-----------|
| `growers` | A grower may deliver to one packhouse or many; NULL = delivers to any |
| `harvest_teams` | Teams typically work at one packhouse; NULL = floats between sites |
| `suppliers` | Packaging suppliers may serve one or all packhouses |
| `packaging_stock` | Physical stock is always at a location |
| `product_configs` | Pack specs may vary by packhouse or be tenant-wide |
| `box_sizes` | May differ by packhouse or be standardised |
| `pallet_types` | Usually standardised (NULL) but can vary |
| `grade_rules` | Can be packhouse-specific or tenant-wide |

### Remain Tenant-Wide (no packhouse_id needed)

- `clients` / `shipping_lines` / `shipping_agents` / `transporters` — commercial relationships are enterprise-level
- `containers` — cross-cutting; may contain pallets from multiple packhouses
- `exports` — enterprise-level commercial activity
- `transport_configs` — shared logistics setup
- `users` — scoped via `assigned_packhouses` JSON field already
- `fruit_types` / `varieties` — reference data, tenant-wide
- `custom_roles` / `permissions` — RBAC is tenant-wide

### Edge Sync Rules

- Edge node is authoritative for rows where `packhouse_id = <its_packhouse_id>`
- AWS is authoritative for rows where `packhouse_id IS NULL` (shared data)
- Cross-packhouse queries (reports, dashboards) only available at AWS level
- `get_packhouse_scope` dependency already enforces filtering in API layer

## Tablet Deployment

### Hardware

- **Cleyver XTREM Tablet 8 Max** (SKU: ODXTREMTABMAX)
- 8" 1280x800 display, 1300 nits, glove-operable
- IP68/IP69K, MIL-STD-810G
- Android 12, Octa-Core MTK-G95 2.05GHz, 256GB storage
- 12,000mAh battery, 48MP rear / 20MP front camera
- USB-C, Bluetooth, Wi-Fi, NFC, GPS, dual SIM
- No built-in hardware barcode scanner

### MDM Strategy

- **Scalefusion** recommended for device management
- Kiosk mode locking tablets to FruitPAK web app in browser
- Camera permissions auto-granted via MDM policy for barcode scanning
- Wi-Fi pre-configured, auto-restart on crash, password-protected exit
- $2-4/device/month, 14-day free trial available
- Alternative considered: Hexnode ($1-5.80/device/month)

### Barcode Scanning

- Camera-based scanning using browser MediaDevices API (html5-qrcode or zxing-js)
- No extra hardware needed — 48MP camera is sufficient
- MDM auto-grants camera permission so operators never see permission dialogs
- Bluetooth barcode scanner can be added later for high-volume packing lines
- NFC tags are a future option for cold-chain pallet tracking

### Screen Size Assessment

- 8" is fine for floor operations (GRN intake, scanning, pallet/batch status)
- Finance, admin, and onboarding wizard stay on desktop
- Plan: test web app in Chrome/kiosk browser on tablet before building any tablet-specific UI

## Analysis Report Corrections

The following items from the original analysis report (FruitPAK_Analysis_Report.docx) were incorrect or overstated:

1. **Numbering SQL injection (originally CRITICAL)** — Not a real risk. The f-string interpolation in numbering.py uses values from a hardcoded constant dict (ENTITY_TABLE_MAP), not user input. The search parameter is properly parameterised.
2. **Tenant isolation concern (section 1.2)** — Retracted. Isolation is defence-in-depth: session finally blocks reset search_path, middleware clears ContextVar, both session factories set search_path before any query, pool_pre_ping catches dead connections, scheduler manages its own context.
3. **Unsafe __import__() (originally CRITICAL)** — Not present in current code. Standard imports throughout.

## Key Decisions Made

- Deprioritise mobile app; use web app on tablets via kiosk mode instead
- Use Scalefusion MDM for tablet fleet management
- Camera-based barcode scanning via browser API (no hardware scanner needed)
- Three-phase deployment: AWS only → single-tenant edge → multi-packhouse edge
- Edge deployment extracts a specific tenant to a Mac Mini, not the whole app
- PostgreSQL logical replication for edge sync (star topology, AWS as hub)
- Per-packhouse data scoping via nullable `packhouse_id` (NULL = tenant-wide, set = packhouse-specific)
- Packhouse-prefixed numbering (e.g. `PH01-GRN-00001`) to prevent cross-edge collisions
- Edge authoritative for its packhouse data; AWS authoritative for shared/config data
- Cross-packhouse operations (containers, exports, reports) remain AWS-only
- HttpOnly cookie migration deferred until local testing is complete
- PostgreSQL confirmed on RDS (already running)
- ECS chosen for compute (client setting up)
- Domain moving to AWS Route 53 — all infrastructure under one roof
- TLS via ALB + ACM (free, auto-renewing certificates)
- AWS account managed by Luna Development

## Project Context Review — Developer Feedback (March 2026)

The developer workflow reviewed CLAUDE_PROJECT_CONTEXT.md and produced `PROJECT_CONTEXT_REVIEW.md` with 10 discussion points. Below is the agreed priority order and key questions that need answering before work begins.

### Pre-Production Blockers (must complete before any tenant goes live)

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1 | JWT → HttpOnly cookies | Pending (deferred until local testing complete) | Biggest remaining security risk. Mechanical migration — auth layer is well-structured. Must happen before real user data flows. |
| 2 | HTTPS/TLS | **Unblocked** — domain moving to Route 53, ALB + ACM confirmed | Terminate at ALB with ACM cert. Domain migration steps documented in Phase 1 section. |
| 3 | CI/CD deployment stubs | **Unblocked** — ECS confirmed | Replace stub echo commands with: build → push to ECR → update ECS service. |
| 4 | Backup & disaster recovery | **Unblocked** — RDS confirmed | RDS automated backups available. Need to define RPO, RTO, retention period, and test a restore. |

### At Launch

| # | Item | Status | Notes |
|---|------|--------|-------|
| 5 | Monitoring & alerting | Pending | Foundation exists (/metrics, Sentry ready, /system-health). Needs external monitoring (CloudWatch natural fit), alerting channels, and Sentry DSN. |

### Soon After Launch

| # | Item | Status | Notes |
|---|------|--------|-------|
| 6 | External integration strategy | Pending | QMS already integrating via standard API. Need API versioning (/api/v1/) and integration auth strategy (API keys vs JWT). Recommended: add versioning now before breaking changes force it. |
| 7 | Packhouse scoping migration | Pending — blocks Phase 2/3 edge deployment | Add nullable `packhouse_id` to growers, harvest_teams, suppliers, packaging_stock, product_configs, box_sizes, pallet_types, grade_rules. Design agreed (see Per-Packhouse Data Scoping section). |
| 8 | Data retention policy | Pending | No retention defined. Seasonal data will grow. May need archival strategy and compliance review (POPI Act if SA, GDPR if EU markets). |

### Lower Priority

| # | Item | Status | Notes |
|---|------|--------|-------|
| 9 | Mobile app decision | Low | Code still in repo. Recommend archiving to avoid confusion. Web-on-tablet via kiosk mode is the chosen path. |
| 10 | Financial module validation | Low | Multi-currency implemented. Needs real-world tenant testing and clarity on accounting/ERP integration plans. |

### Key Questions Needing Client Answers (Unblocks Development)

These questions need answering to unblock the pre-production work. Update the **Answer** column as responses come in.

**Infrastructure (unblocks items 2, 3, 4):**

| Question | Answer |
|----------|--------|
| Target AWS infrastructure: ECS Fargate (recommended) or EC2 with Docker Compose? | **ECS** — client setting up now |
| Is PostgreSQL on RDS (managed, recommended) or self-hosted on EC2? | **RDS** — already provisioned and running |
| TLS termination: at AWS ALB (recommended) or at Nginx layer? | **ALB + ACM** — natural fit with ECS + Route 53 (free certs, auto-renewing) |
| Domain name for API? (e.g. api.fruitpak.com) | **Domain moving to AWS Route 53** — all infra consolidated under one roof |
| Who manages the AWS account — Luna Development, client, or third party? | **Luna Development** |
| Staging environment: already provisioned, or needs setup? | Pending |

**Monitoring (unblocks item 5):**

| Question | Answer |
|----------|--------|
| Existing monitoring stack? (CloudWatch, Datadog, Grafana Cloud) | Pending |
| Who receives alerts? (Dev team, ops, client IT) | Pending |
| Alerting channels? (Email, Slack, SMS, PagerDuty) | Pending |
| Is a Sentry project/DSN available, or needs creating? | Pending |

**Integration (unblocks item 6):**

| Question | Answer |
|----------|--------|
| Beyond QMS, other external systems planned? (Accounting, logistics, cold chain, PPECB/compliance) | Pending |
| Should integration users use API keys or continue with JWT-with-dedicated-user? | Pending |

**Operational (unblocks items 7, 8):**

| Question | Answer |
|----------|--------|
| For multi-packhouse tenants today, should growers/suppliers/stock be scoped per packhouse now, or is tenant-wide visibility acceptable until edge deployment? | Pending |
| Is edge deployment (Phase 2) near-term or 6+ month horizon? | Pending |
| Target date for first tenant onboarding? | Pending |
| Any third-party scripts or analytics planned for the web app? (Affects XSS attack surface) | Pending |
| Regulatory data retention requirements for markets being served? | Pending |
| Has the Cleyver tablet been physically tested with the web app yet? | Pending |
