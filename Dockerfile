# EduPro: API + web app in one container. The browser talks only to the web
# app on $PORT; it proxies /api/* to the API on localhost:5000.
FROM node:20-slim AS build
WORKDIR /app
COPY server/package*.json server/
RUN cd server && npm ci --omit=dev
COPY client/package*.json client/
RUN cd client && npm ci
COPY server server
COPY client client
# Rewrites are baked in at build time; the API runs inside the container.
RUN cd client && API_INTERNAL_URL=http://127.0.0.1:5000 NEXT_TELEMETRY_DISABLED=1 node node_modules/next/dist/bin/next build && npm prune --omit=dev

FROM node:20-slim
WORKDIR /app
# A font so generated sample avatars can draw initials.
RUN apt-get update && apt-get install -y --no-install-recommends fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app/server server
COPY --from=build /app/client client
COPY deploy/start.sh deploy/start.sh
RUN chmod +x deploy/start.sh && chown -R node:node /app
USER node
EXPOSE 3000
CMD ["deploy/start.sh"]
