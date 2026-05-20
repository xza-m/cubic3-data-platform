FROM node:20-alpine AS frontend-builder

WORKDIR /build/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build:v2

FROM nginx:alpine

COPY nginx/conf.d/default.conf /etc/nginx/conf.d/default.conf
COPY --from=frontend-builder /build/frontend/dist-v2 /usr/share/nginx/html
