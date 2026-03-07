# FruitPAK — AWS Setup Guide

**Date:** March 2026
**Status:** FULLY DEPLOYED — https://fruitpak.growafrica.tech
**CI/CD:** Auto-deploy on push to main via GitHub Actions

---

## What You're Building

```
Users → Route 53 (DNS) → ALB (TLS termination) → ECS (backend + web) → RDS + ElastiCache
```

Everything in one AWS region, one VPC. No servers to manage.

---

## Step 1: VPC & Networking (if not already done)

If your RDS is already in a VPC, you'll use that same VPC for everything. If you're starting fresh:

1. Go to **VPC Console** → Create VPC
2. Use the "VPC and more" wizard — it creates subnets, route tables, and an internet gateway for you
3. You need:
   - **2 public subnets** (different AZs) — for the ALB
   - **2 private subnets** (different AZs) — for ECS tasks, RDS, ElastiCache
   - **NAT Gateway** in one public subnet — so ECS tasks in private subnets can pull Docker images from ECR

**Check:** Your RDS instance should be in the private subnets. If it's currently in a public subnet, that's fine for now but move it to private before production.

---

## Step 2: Security Groups

Create these security groups in your VPC:

### SG: `fruitpak-alb`
- **Inbound:** Port 80 (HTTP) from 0.0.0.0/0, Port 443 (HTTPS) from 0.0.0.0/0
- **Outbound:** All traffic

### SG: `fruitpak-ecs`
- **Inbound:** Port 8000 from `fruitpak-alb` (backend), Port 3000 from `fruitpak-alb` (web)
- **Outbound:** All traffic

### SG: `fruitpak-rds` (may already exist)
- **Inbound:** Port 5432 from `fruitpak-ecs`
- **Outbound:** All traffic

### SG: `fruitpak-redis`
- **Inbound:** Port 6379 from `fruitpak-ecs`
- **Outbound:** All traffic

**Key principle:** ALB talks to ECS, ECS talks to RDS and Redis. Nothing else talks to anything directly.

---

## Step 3: ElastiCache (Redis)

Replace your Docker Redis with a managed service.

1. Go to **ElastiCache Console** → Create Redis Cluster
2. Settings:
   - **Engine:** Redis 7
   - **Node type:** `cache.t3.micro` (start small, scale later)
   - **Number of replicas:** 0 (for now — add replicas for production HA later)
   - **Subnet group:** select your private subnets
   - **Security group:** `fruitpak-redis`
3. Note the **Primary Endpoint** — you'll need it for the ECS task definition

**Your Redis URL will be:** `redis://<primary-endpoint>:6379/0`

---

## Step 4: ECR (Container Registry)

You need two repositories — one for the backend image, one for the web image.

1. Go to **ECR Console** → Create repository
2. Create: `fruitpak/backend` (private)
3. Create: `fruitpak/web` (private)

### Push your first images (run from your local machine):

```bash
# Login to ECR
aws ecr get-login-password --region <YOUR_REGION> | docker login --username AWS --password-stdin <YOUR_ACCOUNT_ID>.dkr.ecr.<YOUR_REGION>.amazonaws.com

# Build and push backend
cd backend
docker build -t fruitpak/backend .
docker tag fruitpak/backend:latest <YOUR_ACCOUNT_ID>.dkr.ecr.<YOUR_REGION>.amazonaws.com/fruitpak/backend:latest
docker push <YOUR_ACCOUNT_ID>.dkr.ecr.<YOUR_REGION>.amazonaws.com/fruitpak/backend:latest

# Build and push web (production target)
cd ../web
docker build --target production -t fruitpak/web .
docker tag fruitpak/web:latest <YOUR_ACCOUNT_ID>.dkr.ecr.<YOUR_REGION>.amazonaws.com/fruitpak/web:latest
docker push <YOUR_ACCOUNT_ID>.dkr.ecr.<YOUR_REGION>.amazonaws.com/fruitpak/web:latest
```

Replace `<YOUR_REGION>` and `<YOUR_ACCOUNT_ID>` with your actual values.

---

## Step 5: ECS Cluster & Task Definition

### Create the cluster

1. Go to **ECS Console** → Create cluster
2. Name: `fruitpak`
3. Infrastructure: **AWS Fargate** (serverless — no EC2 instances to manage)
4. Leave everything else default → Create

### Create the task definition

1. ECS Console → Task Definitions → Create new
2. Name: `fruitpak-app`
3. Launch type: **Fargate**
4. Task size:
   - CPU: **0.5 vCPU** (start here, scale up if needed)
   - Memory: **1 GB**
5. Task role: create a new role or use `ecsTaskExecutionRole`

### Add Container 1: backend

| Setting | Value |
|---------|-------|
| Name | `backend` |
| Image | `<ACCOUNT_ID>.dkr.ecr.<REGION>.amazonaws.com/fruitpak/backend:latest` |
| Port | 8000 (TCP) |
| CPU | 256 (0.25 vCPU) |
| Memory soft limit | 512 MB |

**Environment variables** (set these — they replace your .env file):

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | `postgresql+asyncpg://<user>:<password>@<rds-endpoint>:5432/fruitpak` |
| `DATABASE_URL_SYNC` | `postgresql://<user>:<password>@<rds-endpoint>:5432/fruitpak` |
| `REDIS_URL` | `redis://<elasticache-endpoint>:6379/0` |
| `SECRET_KEY` | A strong random string (use `openssl rand -hex 32` to generate) |
| `DEBUG` | `false` |
| `ALLOWED_ORIGINS` | `https://fruitpak.com,https://www.fruitpak.com` (your actual domain) |

**Important:** For sensitive values (DATABASE_URL, SECRET_KEY), use **AWS Secrets Manager** instead of plain text. In the ECS task definition, reference secrets as `valueFrom` ARNs.

**Health check:**
- Command: `CMD-SHELL,curl -f http://localhost:8000/health || exit 1`
- Interval: 30s, Timeout: 10s, Retries: 3, Start period: 40s

### Add Container 2: web

| Setting | Value |
|---------|-------|
| Name | `web` |
| Image | `<ACCOUNT_ID>.dkr.ecr.<REGION>.amazonaws.com/fruitpak/web:latest` |
| Port | 3000 (TCP) |
| CPU | 256 (0.25 vCPU) |
| Memory soft limit | 256 MB |

**Health check:**
- Command: `CMD-SHELL,wget --quiet --tries=1 --spider http://localhost:3000/ || exit 1`
- Interval: 30s, Timeout: 3s, Retries: 3, Start period: 5s

---

## Step 6: ALB (Application Load Balancer)

1. Go to **EC2 Console** → Load Balancers → Create
2. Type: **Application Load Balancer**
3. Name: `fruitpak-alb`
4. Scheme: **Internet-facing**
5. Subnets: select your **2 public subnets**
6. Security group: `fruitpak-alb`

### Create Target Groups

**Target Group 1: backend**
- Name: `fruitpak-backend-tg`
- Target type: **IP** (required for Fargate)
- Protocol: HTTP, Port: 8000
- Health check path: `/health`
- VPC: your VPC

**Target Group 2: web**
- Name: `fruitpak-web-tg`
- Target type: **IP**
- Protocol: HTTP, Port: 3000
- Health check path: `/`
- VPC: your VPC

### Listener Rules

**Port 80 listener:** Redirect all traffic to HTTPS (port 443). You'll set this up after TLS is configured.

**Port 443 listener (HTTPS):** Add after ACM cert is ready (Step 7). Rules:
- If path is `/api/*` or `/health*` or `/metrics*` or `/docs*` → forward to `fruitpak-backend-tg`
- Default → forward to `fruitpak-web-tg`

This means: API calls go to the backend, everything else goes to the web frontend. No Nginx needed — the ALB does the routing.

---

## Step 7: Route 53 & TLS Certificate

### Move your domain to Route 53

1. Go to **Route 53 Console** → Hosted zones → Create hosted zone
2. Domain name: `fruitpak.com` (or whatever your domain is)
3. Type: Public
4. Note the **4 NS (nameserver) records** that Route 53 assigns
5. Go to your **current domain registrar** (GoDaddy, Namecheap, etc.)
6. Update the nameservers to the 4 Route 53 NS records
7. Wait for propagation (can take up to 48 hours, usually faster)

### Request TLS certificate

1. Go to **ACM (Certificate Manager)** — must be in the **same region** as your ALB
2. Request → Public certificate
3. Domain names: `fruitpak.com` and `*.fruitpak.com` (wildcard covers all subdomains)
4. Validation method: **DNS** (recommended)
5. ACM gives you a CNAME record to add — click "Create records in Route 53" (one-click if your domain is already in Route 53)
6. Wait for validation (usually a few minutes once DNS is propagated)

### Attach certificate to ALB

1. Go back to your ALB → Listeners
2. Add listener: HTTPS (443)
3. Select your ACM certificate
4. Set routing rules (as described in Step 6)
5. Edit the HTTP (80) listener → change action to "Redirect to HTTPS"

### Create DNS records

In Route 53, create:

| Record | Type | Value |
|--------|------|-------|
| `fruitpak.com` | A (Alias) | → your ALB |
| `www.fruitpak.com` | A (Alias) | → your ALB |
| `api.fruitpak.com` | A (Alias) | → your ALB (optional — if you prefer api.fruitpak.com/batches over fruitpak.com/api/batches) |

---

## Step 8: Create the ECS Service

Now wire it all together.

1. Go to **ECS Console** → your `fruitpak` cluster → Create service
2. Settings:
   - Launch type: **Fargate**
   - Task definition: `fruitpak-app`
   - Service name: `fruitpak-service`
   - Desired tasks: **2** (minimum for HA — one per AZ)
3. Networking:
   - VPC: your VPC
   - Subnets: **private subnets**
   - Security group: `fruitpak-ecs`
   - Auto-assign public IP: **disabled** (tasks are behind ALB)
4. Load balancing:
   - Select your ALB `fruitpak-alb`
   - Container to load balance: `backend:8000` → target group `fruitpak-backend-tg`
   - Container to load balance: `web:3000` → target group `fruitpak-web-tg`
5. Auto Scaling (optional for now):
   - Min: 2, Max: 6
   - Scale on CPU > 70%

---

## Step 9: Verify Everything Works

Run through this checklist:

1. **ECS tasks running?** Check ECS Console → your service → Tasks tab. Both tasks should show RUNNING status.
2. **Health checks passing?** Check EC2 → Target Groups → both TGs should show healthy targets.
3. **DNS resolving?** `nslookup fruitpak.com` should return your ALB IP.
4. **TLS working?** `https://fruitpak.com` should load with a valid certificate (padlock icon).
5. **Backend reachable?** `https://fruitpak.com/api/health` should return `{"status": "ok"}`.
6. **Frontend loading?** `https://fruitpak.com` should show the FruitPAK login page.
7. **DB connected?** `https://fruitpak.com/api/health/ready` should confirm DB and Redis connections.

---

## Step 10: RDS Backup Configuration

Since you're on RDS, backups are easy.

1. Go to **RDS Console** → your database → Modify
2. Set:
   - **Backup retention:** 14 days (minimum recommended for production)
   - **Backup window:** pick a low-traffic time (e.g. 03:00-04:00 UTC)
   - **Multi-AZ:** enable for production (automatic failover if primary goes down)
   - **Deletion protection:** enable
3. **Test a restore** before going live: RDS → Snapshots → select latest → Restore snapshot → verify data

---

## Cost Estimate (starting point)

| Service | Spec | Approx Monthly Cost |
|---------|------|-------------------|
| ECS Fargate | 2 tasks × 0.5 vCPU / 1GB | ~$30 |
| RDS | db.t3.micro (already running) | ~$15-30 |
| ElastiCache | cache.t3.micro | ~$12 |
| ALB | base + traffic | ~$20-30 |
| Route 53 | hosted zone + queries | ~$1 |
| ACM | free | $0 |
| ECR | storage | ~$1 |
| NAT Gateway | data transfer | ~$35 |
| **Total** | | **~$115-140/month** |

NAT Gateway is the sneaky cost. If budget is tight, you can put ECS tasks in public subnets to avoid it (less secure but functional for early stage).

---

## What NOT To Do

- **Don't expose RDS publicly** — keep it in private subnets, accessible only from ECS security group
- **Don't hardcode secrets in task definitions** — use AWS Secrets Manager
- **Don't skip the HTTP→HTTPS redirect** — all traffic must be encrypted
- **Don't use `latest` tag forever** — switch to git SHA or version tags once CI/CD is automated
- **Don't forget `--no-reload` in production** — the Dockerfile CMD already uses `--workers 4` without `--reload`, which is correct

---

## Next After This

Once the above is running:
1. Set up CI/CD (GitHub Actions → ECR → ECS deploy) — replace the stub deploy steps
2. Complete JWT → HttpOnly cookie migration
3. Enable Sentry (set SENTRY_DSN env var in task definition)
4. Set up CloudWatch alarms (CPU, memory, 5xx errors, RDS connections)
