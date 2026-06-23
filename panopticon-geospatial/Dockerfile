# --- Build + run dans une seule image (le serveur Express sert dist/ + les API) ---
FROM node:20-slim

WORKDIR /app

# Dépendances (couche cache)
COPY package*.json ./
RUN npm ci

# Code source + build front
COPY . .
RUN npm run build

ENV NODE_ENV=production
# Cloud Run injecte PORT (8080 par défaut) ; server/index.js le respecte.
ENV PORT=8080
EXPOSE 8080

CMD ["node", "server/index.js"]
