# Frontend

React + TypeScript + Vite app for Aviation Records Workspace. See the
[repository root README](../README.md) for setup, running, and testing
instructions — this app is meant to be run together with the `backend/`
FastAPI service via `./scripts/start-mac.sh`.

```bash
npm install
npm run dev     # dev server at http://127.0.0.1:5173, proxies /api to :8000
npm run build   # production build (tsc -b && vite build)
```
