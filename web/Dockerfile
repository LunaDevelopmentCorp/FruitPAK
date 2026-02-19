# ═══════════════════════════════════════════════════════════════════
# Multi-stage Dockerfile for React Frontend
# ═══════════════════════════════════════════════════════════════════
#
# Stages:
#   - development: Hot reload for local development
#   - build: Create optimized production build
#   - production: Serve static build with nginx
#
# Usage:
#   Development: docker build --target development -t fruitpak-web:dev .
#   Production:  docker build --target production -t fruitpak-web:prod .
#
# ═══════════════════════════════════════════════════════════════════

# ── Development Stage ──────────────────────────────────────────────
FROM node:22-alpine AS development

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

EXPOSE 3000

# Start development server with hot reload
CMD ["npm", "start"]

# ── Build Stage ────────────────────────────────────────────────────
FROM node:22-alpine AS build

WORKDIR /app

# Install all dependencies (dev deps needed for build)
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Build optimized production bundle
RUN npm run build

# ── Production Stage ───────────────────────────────────────────────
FROM nginx:1.25-alpine AS production

# Copy built assets from build stage
COPY --from=build /app/dist /usr/share/nginx/html

# Copy custom nginx configuration for SPA routing
RUN echo 'server { \
    listen 3000; \
    root /usr/share/nginx/html; \
    index index.html; \
    \
    # SPA routing - serve index.html for all routes \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
    \
    # Cache static assets \
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg|woff|woff2|ttf|eot)$ { \
        expires 1y; \
        add_header Cache-Control "public, immutable"; \
    } \
    \
    # Security headers \
    add_header X-Content-Type-Options "nosniff" always; \
    add_header X-Frame-Options "DENY" always; \
    add_header X-XSS-Protection "1; mode=block" always; \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost:3000/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
