# Digital XP — Backoffice : image statique servie par nginx pour Cloud Run
FROM nginx:1.27-alpine

# Config nginx (écoute sur 8080, port attendu par Cloud Run)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Application seule — PAS de JSON embarqué.
# Le fichier structure est uploadé par l'utilisateur en début de session.
COPY index.html /usr/share/nginx/html/index.html

EXPOSE 8080
