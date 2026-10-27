FROM node:24-bookworm-slim AS frontend
WORKDIR /build
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci
COPY app ./app
COPY components ./components
COPY lib ./lib
COPY data ./data
COPY public ./public
COPY next.config.ts next-env.d.ts tsconfig.json postcss.config.mjs ./
RUN npm run build

FROM python:3.14-slim-bookworm AS runtime
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates libstdc++6 libatomic1 && rm -rf /var/lib/apt/lists/*
COPY --from=frontend /usr/local/bin/node /usr/local/bin/node
COPY backend/requirements-lock.txt ./requirements-lock.txt
RUN pip install --no-cache-dir -r requirements-lock.txt
COPY --from=frontend /build/.next/standalone ./
COPY --from=frontend /build/.next/static ./.next/static
COPY --from=frontend /build/public ./public
COPY backend ./backend
COPY data ./data
COPY deploy/start.py ./deploy/start.py
RUN useradd --uid 10001 --create-home finn && mkdir -p /app/storage/cache /app/storage/state && chown -R finn:finn /app/storage
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PYTHONUNBUFFERED=1 \
    FINN_BACKEND_URL=http://127.0.0.1:8000 FINN_CACHE_DIR=/app/storage/cache \
    FINN_STATE_DIR=/app/storage/state PORT=10000 FINN_GEMINI_DAILY_LIMIT=60
USER finn
EXPOSE 10000
CMD ["python", "deploy/start.py"]
