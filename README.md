# FruitPAK

**The Fruit Inventory Packhouse Management & Export System**

A scalable, mobile-first packhouse and export platform for fruit enterprises. Built for enterprises managing grower intake, packing, storage, palletizing, containerizing, and export — with full financial reconciliation.

## Architecture

| Layer | Tech | Path |
|-------|------|------|
| **Backend** | Python 3.12, FastAPI, SQLAlchemy 2.0, Alembic | `backend/` |
| **Web** | React 19, TypeScript, TailwindCSS, Zustand | `web/` |
| **Mobile** | React Native (Expo), TypeScript | `mobile/` |
| **Database** | PostgreSQL 16 + TimescaleDB | via Docker |
| **Cache** | Redis 7 | via Docker |
| **Auth** | JWT + bcrypt + Twilio SMS OTP | `backend/app/auth/` |

### Multi-Tenancy

Each enterprise gets an isolated PostgreSQL schema (`tenant_<id>`). Shared tables (users, enterprises) live in the `public` schema. Tenant-scoped data (packhouses, growers, lots, pallets, exports, financials) resides within the tenant schema.

## Project Structure

```
FruitPAK/
├── backend/                  # FastAPI backend
│   ├── app/
│   │   ├── auth/             # JWT, password hashing, OTP, RBAC deps
│   │   ├── models/           # SQLAlchemy ORM models
│   │   ├── routers/          # API route handlers
│   │   ├── schemas/          # Pydantic request/response schemas
│   │   ├── services/         # Business logic layer
│   │   ├── middleware/        # Custom middleware
│   │   ├── config.py         # Settings via pydantic-settings
│   │   ├── database.py       # Async engine & session
│   │   ├── tenancy.py        # Schema-per-tenant logic
│   │   └── main.py           # FastAPI app entrypoint
│   ├── alembic/              # Database migrations
│   ├── tests/                # pytest test suite
│   └── requirements.txt
├── web/                      # React web app
│   └── src/
│       ├── api/              # Axios client & API hooks
│       ├── components/       # Shared UI components
│       ├── pages/            # Route-level page components
│       ├── hooks/            # Custom React hooks
│       ├── store/            # Zustand state stores
│       └── utils/            # Helpers & constants
├── mobile/                   # React Native (Expo) app
│   └── src/
│       ├── api/              # Axios client
│       ├── components/       # Shared components
│       ├── screens/          # Screen-level components
│       ├── navigation/       # React Navigation config
│       ├── hooks/            # Custom hooks
│       ├── store/            # Zustand state stores
│       └── utils/            # Helpers
├── docs/                     # Documentation
├── docker-compose.yml        # Local dev stack
├── .env.example              # Environment template
└── .gitignore
```

## Quick Start

### Prerequisites

- Python 3.12+
- Node.js 22+
- Docker & Docker Compose

### 1. Clone & configure

```bash
git clone git@github.com:LunaDevelopmentCorp/FruitPAK.git
cd FruitPAK
cp .env.example .env        # edit as needed
```

### 2. Start infrastructure (Postgres + Redis)

```bash
docker compose up -d db redis
```

### 3. Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate     # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Run migrations
alembic upgrade head

# Start dev server
uvicorn app.main:app --reload
```

API docs available at **http://localhost:8000/docs** (Swagger UI).

### 4. Web frontend

```bash
cd web
npm install
npm start
```

Opens at **http://localhost:3000**.

### 5. Mobile

```bash
cd mobile
npm install
npx expo start
```

Scan the QR code with Expo Go on your device.

### Full stack via Docker

```bash
docker compose up --build
```

## Core Modules (Planned)

| Module | Description |
|--------|-------------|
| **Grower/Supplier** | Grower registration, contracts, traceability |
| **Harvest/GRN** | Goods Received Notes, harvest team tracking |
| **Packing** | Lot creation, grading, labeling |
| **Storage** | Cold room management, stock tracking |
| **Palletizing** | Pallet building, containerizing |
| **Export** | Shipping docs, phyto certificates, PPECB |
| **Financials** | Grower payments, labour costs, client invoices, reconciliation |

## User Roles

- **Administrator** — Full access including financials and user management
- **Supervisor** — Operational access, limited financials
- **Operator** — Data entry and packhouse floor operations

## API Endpoints (Initial)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| `POST` | `/api/auth/register` | Register user |
| `POST` | `/api/auth/login` | Login (JWT) |
| `POST` | `/api/auth/refresh` | Refresh token |
| `POST` | `/api/auth/otp/send` | Send SMS OTP |
| `POST` | `/api/auth/otp/verify` | Verify OTP |
| `POST` | `/api/enterprises/` | Create enterprise (+ tenant schema) |

## License

Proprietary — Luna Development Corp.
