# Topbrass Backend

This repo contains a Next.js API backend scaffold for the Topbrass job application management system.

## What is included

- Prisma schema for users, bidder profiles, applications, payments, and audit logs
- MongoDB connection setup via `.env.local`
- JWT auth with httpOnly cookies
- Session-based refresh flow and approval-aware auth checks
- Role checks for bidder, manager, and admin workflows
- API route scaffolding for auth, applications, payments, analytics, admin approval, and AI resume generation
- WebSocket server for live application, payment, approval, and resume events
- Redis-backed pub/sub for realtime fanout across multiple instances
- Redis-backed background jobs for resume generation and notification delivery
- S3/R2-backed resume storage when object-store env vars are configured
- Persistent notification inbox endpoints

## Next steps

1. Install dependencies.
2. Run `npm run prisma:generate`.
3. Run `npm run prisma:push`.
4. Start the app with `npm run dev`.
5. In a separate terminal, start the worker with `npm run worker`.

The local MongoDB connection string is already stored in `.env.local`.

To create the first admin, set `SEED_ADMIN_USERNAME` and `SEED_ADMIN_PASSWORD` in your local env, then run `npm run prisma:seed`.

For realtime updates, use `npm run dev:ws` during development or `npm run start:ws` after building.

For background jobs, set `REDIS_URL` and run `npm run worker` in a second terminal. Use `npm run worker:dev` while iterating locally.

To use production storage and distributed websockets, configure `REDIS_URL` and the S3/R2 variables in `.env`.

For the frontend/backend split deployment:

- Local frontend origin: `http://localhost:8080`
- Production frontend origin: `https://bid-ac6v.onrender.com`
- Set `CLIENT_URL` in Render so CORS and auth cookies work between the two services
