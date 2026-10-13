# E-commerce REST API (backend)

Production-minded REST API for an e-commerce backend, built with **Node.js, Express.js, MongoDB/Mongoose, JWT, and express-validator**.

## Features

- Customer registration/login (JWT), profile management, Admin/Customer roles
- Admin user listing and activation/deactivation
- Unlimited-depth category hierarchy with cycle prevention and a full-tree endpoint
- Product CRUD with unique SKUs, search, category-descendant filtering, effective-price filters, sorting, pagination
- Order creation with server-side totals, transactional atomic stock decrements, order history, ownership enforcement
- Admin order listing and guarded status transitions with exactly-once cancellation restocking
- Centralized validation errors, structured logging with redaction, security middleware, Swagger docs

## Tech stack and prerequisites

- Node.js 20+ (LTS), npm
- MongoDB: Atlas (recommended — transactions work out of the box) or local MongoDB running as a **replica set** (required for order transactions; see below)
- Dependencies: `express mongoose dotenv jsonwebtoken bcryptjs express-validator pino pino-http helmet cors express-rate-limit swagger-ui-express yaml`
- Dev: `nodemon jest supertest mongodb-memory-server`

## Install

```bash
cd backend
npm install
```

## Environment setup

```bash
cp .env.example .env
# then edit .env — notably MONGODB_URI and JWT_SECRET (min 32 chars)
```

| Variable | Purpose | Default |
|---|---|---|
| `NODE_ENV` | environment | `development` |
| `PORT` | listen port | `5000` |
| `MONGODB_URI` | MongoDB connection string | `mongodb://127.0.0.1:27017/ecommerce_api` |
| `JWT_SECRET` | signing secret (≥32 chars, random in production) | — required |
| `JWT_EXPIRES_IN` | access-token lifetime | `15m` |
| `BCRYPT_ROUNDS` | password hashing cost (≥4) | `12` |
| `LOG_LEVEL` | pino level | `info` |
| `CORS_ORIGIN` | allowed origin | `http://localhost:3000` |
| `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX` | global API rate limit | `900000` / `100` |

Startup validates required variables and fails fast when they are missing or malformed. Never commit `.env`.

## MongoDB setup and the replica-set requirement

Order creation uses **multi-document transactions**, which need a replica set or sharded cluster:

- **Atlas** (recommended): create a free cluster and use the `mongodb+srv://…` URI as `MONGODB_URI` (append `/ecommerce_api`). Works with transactions immediately.
- **Local single-node replica set**: start `mongod` with `--replSet rs0`, then `mongosh --eval "rs.initiate()"`, and point `MONGODB_URI` at it (e.g. `mongodb://127.0.0.1:27017/ecommerce_api?replicaSet=rs0`). A standalone local `mongod` will connect fine but order creation will fail — this is by design, not a bug.

## Run

```bash
npm run dev    # nodemon, development
npm start      # production
```

Health check: `GET /health`. API base: `/api/v1`. Swagger UI: `http://localhost:5000/api-docs`.

## Create the first admin

Public registration can never assign the Admin role. Seed it instead (no real credentials are published anywhere):

```bash
node scripts/create-admin.js --email=admin@example.com --password='ChangeMe123' --name="Site Admin"
# or via env: ADMIN_EMAIL=… ADMIN_PASSWORD=… ADMIN_NAME=… npm run admin:create
```

The script refuses to overwrite an existing user.

## Tests

```bash
npm test        # jest, in-band
npm run test:watch
```

The committed suite (see `tests/`) uses an isolated in-memory MongoDB replica set, so tests never touch development/production data.

- `tests/integration/` — `auth`, `users`, `categories`, `products`, `orders` API suites via Supertest (happy paths, validation errors, permissions, cycles, descendant filtering, stock races, status transitions, cancellation restocking).
- `tests/unit/` — pure-logic suites (`category-tree`, `pagination`).
- `tests/helpers/` — per-file app bootstrap (`testApp`) and seed factories (`testData`).

The suite boots a fresh replica set per file and hashes with the configured bcrypt cost, so a full run takes ~1–2 minutes.

## API overview and authorization

| Method | Endpoint | Access |
|---|---|---|
| POST | `/api/v1/auth/register`, `/api/v1/auth/login` | Public (rate-limited) |
| GET/PATCH | `/api/v1/users/me` | Authenticated |
| GET | `/api/v1/admin/users`, `/api/v1/admin/users/:id` | Admin |
| PATCH | `/api/v1/admin/users/:id/status` | Admin |
| GET | `/api/v1/categories`, `/api/v1/categories/tree`, `/api/v1/categories/:id` | Public |
| POST/PATCH/DELETE | `/api/v1/admin/categories…` | Admin |
| GET | `/api/v1/products`, `/api/v1/products/:id` | Public |
| GET/POST/PATCH/DELETE | `/api/v1/admin/products…` | Admin |
| POST | `/api/v1/orders` | Authenticated |
| GET | `/api/v1/orders/me`, `/api/v1/orders/:id` (owner or Admin) | Authenticated |
| GET/PATCH | `/api/v1/admin/orders…` | Admin |

Auth: `Authorization: Bearer <token>` (15-minute JWT with `sub` + `role` claims; the user is reloaded per request, so deactivation takes effect immediately). All responses use `{ "success": true, "data": … }`; errors use `{ "success": false, "error": { "code", "message", "details?" }, "requestId?" }`.

### Product query parameters

`search` (name/description/SKU) · `category` (includes **all descendants**) · `minPrice`/`maxPrice` (applied to the **effective price**: `salePrice` when set and valid, else `price`) · `sortBy=name|price|createdAt` (`price` = effective price) · `sortOrder=asc|desc` · `page` · `limit` (max 100).

### Order status transitions

`pending → confirmed | cancelled` · `confirmed → processing | cancelled` · `processing → shipped | cancelled` · `shipped → delivered`. `delivered`/`cancelled` are terminal. Anything else is `409`. Cancelling from `pending`/`confirmed`/`processing` restores stock exactly once.

## Key design decisions

- **Stock safety**: order lines decrement via conditional atomic updates (`stock >= qty`) inside a transaction; concurrent races for the last units resolve to one `201` + one `409`, never negative stock. Rollback on any failure leaves no partial writes.
- **Category descendants**: bulk-fetch + in-memory traversal with a visited set (single query, O(n)); corrupt cycles terminate instead of hanging.
- **Visibility**: a category counts as public only when it and its full ancestor chain are active; public product surfaces additionally require active status. Inactive categories are shown *with flags* in the tree (never silently pruned).
- **Money**: totals computed server-side only, rounded to 2 decimals; orders snapshot name/SKU/unit price so later product edits don't rewrite history.
- **Security**: bcrypt hashes (`passwordHash` never selected/returned), strict rate limits on auth endpoints, Helmet, explicit CORS, allowlisted updates (`pick`), per-request IDs, log redaction, generic login errors.

## Docker (optional)

```bash
cp .env.example .env   # set JWT_SECRET at minimum
docker compose up -d --build
```

This starts the API plus MongoDB as a **single-node replica set** (required for order transactions), including one-shot replica-set initiation, health checks, and a persistent `mongo-data` volume. The API listens on host port `5010` → container `5000`; change the mapping in `docker-compose.yml` if it clashes locally. `MONGODB_URI` and `NODE_ENV=production` are pinned in Compose so containers never inherit a local Atlas URI or development mode; remaining config comes from `.env` (never baked into the image — see `.dockerignore`).

## Known limitations and deployment notes
- No refresh tokens (short-lived access tokens only); add rotation/revocation deliberately if needed.
- No image upload / payments / shipping / tax — out of scope for the machine test.
- Product DELETE is a hard delete (order snapshots preserve history).
- Use HTTPS in deployment, a cryptographically random `JWT_SECRET`, and keep dependencies updated. No secrets, `.env` files, or logs are committed (see `.gitignore`).
