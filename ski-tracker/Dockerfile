# ── Stage 1: Build ───────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app
COPY app/package*.json ./
RUN npm ci --ignore-scripts

COPY app/ ./

# Injected at build time by Cloud Build
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

RUN npm run build

# ── Stage 2: Serve ───────────────────────────────────────────
FROM nginx:1.27-alpine AS runner

# Remove default nginx site
RUN rm /etc/nginx/conf.d/default.conf

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/app.conf

# Cloud Run uses PORT env var
ENV PORT=8080
EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
