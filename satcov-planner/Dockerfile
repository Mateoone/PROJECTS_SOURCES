# --- Étape 1 : build du front Vite ---
FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- Étape 2 : service statique via nginx ---
FROM nginx:1.27-alpine
# Config nginx (écoute sur 8080, fallback SPA)
COPY nginx.conf /etc/nginx/conf.d/default.conf
# Artefacts buildés (inclut les assets statiques Cesium copiés par vite-plugin-cesium)
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
