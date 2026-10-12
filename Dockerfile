# Multi-stage build: compile the frontend, then run everything from one
# lightweight Python image. One container, one process, one port - works
# on any Docker host (Render, Railway, Fly.io, a plain VPS, etc.), not
# locked to a single platform.

FROM node:20-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.13-slim AS runtime
WORKDIR /app

COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend/ backend/
COPY --from=frontend-build /app/frontend/dist /app/frontend/dist

# Generates the bundled synthetic demo PDFs/fixtures at build time so demo
# mode works immediately with no extra startup step.
RUN cd backend && python fixtures/generate_fixtures.py

# Local disk default; override STORAGE_DIR/DB_PATH to point at a mounted
# persistent volume in production (see README "Deploying beyond localhost") -
# without one, uploaded files and the database reset on every redeploy.
ENV STORAGE_DIR=/data/storage
ENV DB_PATH=/data/aviation_records.db
RUN mkdir -p /data/storage

WORKDIR /app/backend
EXPOSE 8000
CMD ["sh", "-c", "python -m uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
