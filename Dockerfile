# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

# Sécurité : utilisateur non-root
RUN addgroup -S maraude && adduser -S maraude -G maraude

COPY --from=deps /app/node_modules ./node_modules
COPY server.js ./
COPY public/ ./public/

# Répertoire data monté en volume au runtime
RUN mkdir -p data && chown -R maraude:maraude /app

USER maraude

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "server.js"]
