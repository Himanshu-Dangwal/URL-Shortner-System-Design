# URL Shortener – System Design in Practice

A **production-style URL shortener** built as a complete **system design lab**:

- Horizontally scaled API & redirect services behind **Nginx load balancer**
- **PostgreSQL sharding** + read/write separation
- **Redis** for caching & rate limiting
- **RabbitMQ** as a message queue for async click processing
- **MongoDB** for analytics events (write-heavy, schema-flexible data)
- **Docker + Docker Compose** for easy local setup

If you’re searching for **“URL shortener system design”**, this repo is designed to be a **hands-on, end‑to‑end implementation** of the concepts you discuss in interviews.

---

## 1. Why this project? (System Design Theory → Implementation)

When you design a URL shortener in an interview, you typically talk about:

- High QPS for **redirects** (read-heavy workload)
- **Hot keys** (popular URLs) causing DB contention
- The need for **horizontal scaling** and **load balancing**
- Using **caches** to offload the database
- Splitting data into **SQL vs NoSQL** for different access patterns
- **Sharding** to scale writes horizontally
- **Message queues** for non-critical but important side effects (analytics, logging)

This project turns that _theory_ into a _working system_:

1. **Two API instances (`api1`, `api2`)**

   - Behind Nginx load balancer
   - Handle `POST /shorten` (create short URLs), `GET /stats/:code` (stubbed)

2. **Two Redirect instances (`redirect1`, `redirect2`)**

   - Behind Nginx load balancer
   - Handle `GET /:code` – redirect to the long URL

3. **PostgreSQL sharded into two logical shards**

   - `postgres_shard_a`, `postgres_shard_b`
   - Shard by `user_id` (even → shard A, odd → shard B)
   - Simulates horizontal scaling and isolation of data

4. **Redis**

   - Caches `code → target_url` for fast redirects
   - Stores per-user rate limit counters for `POST /shorten`

5. **RabbitMQ + Worker + MongoDB**

   - Redirect service publishes a **click event** to RabbitMQ
   - Worker consumes events and writes them to MongoDB `clicks` collection
   - Simulates async logging, analytics, and decoupled services

6. **Nginx**
   - Single entry point at `http://localhost:8080`
   - Routes `/shorten` & `/stats` to API upstream
   - Routes everything else (`/:code`) to Redirect upstream
   - Demonstrates load balancing and routing

---

## 2. Tech Stack

- **Language / Runtime**
  - Node.js (services written in JavaScript, CommonJS)
- **Core Services**
  - `services/api` – create short URLs, rate limiting
  - `services/redirect` – resolve codes and redirect
  - `services/worker` – background consumer for click events
- **Databases / Infra**
  - PostgreSQL (2 shards: `urls_a`, `urls_b`)
  - Redis (cache + rate limit)
  - RabbitMQ (message queue)
  - MongoDB (analytics / click logs)
  - Nginx (reverse proxy + load balancer)
- **Containerization**
  - Docker
  - Docker Compose

---

## 3. Project Structure

```text
.
├── Dockerfile
├── docker-compose.yml
├── nginx.conf
├── package.json
├── .env.example
├── libs
│   ├── cache
│   │   └── redisClient.js
│   ├── db
│   │   ├── mongo.js
│   │   └── pgRouter.js
│   ├── mq
│   │   └── rabbit.js
│   └── utils
│       ├── hash.js
│       └── rateLimiter.js
└── services
    ├── api
    │   └── index.js
    ├── redirect
    │   └── index.js
    └── worker
        └── index.js
```

---

## 4. How the System Works (High-Level Flow)

### 4.1 Create Short URL – `POST /shorten`

1. Client calls:

   ```http
   POST http://localhost:8080/shorten
   Content-Type: application/json

   {
     "url": "https://example.com/some/long/path"
   }
   ```

2. Nginx forwards to **API upstream**  
   → either `api1` or `api2` (round‑robin).

3. API service:

   - Reads `url` from JSON body
   - Determines `userId` from header `x-user-id` or defaults to `1`
   - Applies **rate limiting** using Redis (`20 requests / minute / user`)
   - Generates random code (e.g. `1vTwn6PZ`)
   - Chooses shard based on `userId % 2` (**sharding**)
   - Inserts URL row into appropriate Postgres shard
   - Caches `code → target_url` in Redis
   - Returns:

     ```json
     {
       "code": "1vTwn6PZ",
       "shortUrl": "http://localhost:8080/1vTwn6PZ"
     }
     ```

### 4.2 Redirect – `GET /:code`

1. Client hits `http://localhost:8080/1vTwn6PZ` in the browser.

2. Nginx forwards to **Redirect upstream**  
   → either `redirect1` or `redirect2`.

3. Redirect service:
   - Tries Redis cache: `GET code:1vTwn6PZ`
     - If **cache hit**, skip DB.
     - If **miss**, query Postgres shards via read pools to find the URL.
   - Sends a **302 redirect** to the long URL.
   - Publishes a **click event** to RabbitMQ with `code`, `userAgent`, `ip`, `ts`.

### 4.3 Click Logging – Worker + MongoDB

1. Worker service connects to RabbitMQ and consumes from `click_events` queue.
2. For each event, it inserts a document into `MongoDB.url_shortener.clicks`.
3. This simulates separating **write-heavy analytics** from the main transactional database.

---

## 5. Prerequisites

Before running locally, install:

- [Docker Desktop](https://www.docker.com/products/docker-desktop)
- [Node.js](https://nodejs.org/) (if you want to run services without Docker – optional)
- `psql` (PostgreSQL CLI) – optional but helpful for inspecting DBs

---

## 6. Step-by-Step: Run the Project Locally (Docker-First)

These are the _exact_ steps a student can follow to get everything running.

### 6.1 Clone the repository

```bash
git clone <your-repo-url> url_shortener-system-design
cd url_shortener-system-design
```

### 6.2 Install Node dependencies (for building the image)

```bash
npm install
```

This ensures your `node_modules` get installed inside the Docker image correctly.

### 6.3 Create your `.env` file

Copy the example file:

```bash
cp .env.example .env
```

Make sure `.env` contains **Docker-friendly** URLs (service names, not localhost):

```env
# Postgres shards (inside Docker network)
PG_RW_URL_SHARD_A=postgres://postgres:password@postgres_shard_a:5432/urls_a
PG_RW_URL_SHARD_B=postgres://postgres:password@postgres_shard_b:5432/urls_b
PG_RO_URL_SHARD_A=postgres://postgres:password@postgres_shard_a:5432/urls_a
PG_RO_URL_SHARD_B=postgres://postgres:password@postgres_shard_b:5432/urls_b

# Redis
REDIS_URL=redis://redis:6379
REDIS_TLS=false

# RabbitMQ
RABBITMQ_URL=amqp://user:pass@rabbitmq:5672

# MongoDB
MONGODB_URL=mongodb://mongo:27017
MONGODB_DB=url_shortener

# Public base URL (Nginx)
PUBLIC_REDIRECT_BASE_URL=http://localhost:8080

# Service ports (inside containers)
API_PORT=3000
REDIRECT_PORT=3001
```

> 🔁 If you want to run services **without Docker**, you’d change hosts to `localhost` and ports to the published ports. For Docker-only usage, **keep the service names**.

### 6.4 Start all services with Docker Compose

From the project root:

```bash
docker-compose up --build
```

This will:

- Build the Node.js app image with the `Dockerfile`
- Start:
  - 2× API containers
  - 2× Redirect containers
  - 1× Worker
  - Postgres shard A + B
  - Redis
  - RabbitMQ
  - MongoDB
  - Nginx

Leave this running in a terminal so you can see logs.

> If you prefer detached mode, use:
>
> ```bash
> docker-compose up --build -d
> ```

### 6.5 Initialize Postgres schema (create `urls` table on each shard)

Open a new terminal (keep Docker running) and run:

#### Shard A (`urls_a`)

```bash
psql postgres://postgres:password@localhost:5433/urls_a
```

Inside `psql`:

```sql
CREATE TABLE IF NOT EXISTS urls (
  id SERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  code VARCHAR(32) UNIQUE NOT NULL,
  target_url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

SELECT * FROM urls;
```

Exit:

```sql
\q
```

#### Shard B (`urls_b`)

```bash
psql postgres://postgres:password@localhost:5434/urls_b
```

Inside `psql`:

```sql
CREATE TABLE IF NOT EXISTS urls (
  id SERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  code VARCHAR(32) UNIQUE NOT NULL,
  target_url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

SELECT * FROM urls;
```

Exit:

```sql
\q
```

> ✅ Now both shards have the same `urls` table, ready to store data.

### 6.6 Confirm containers are healthy

```bash
docker-compose ps
```

You should see something like:

```text
SERVICE            STATUS
postgres_shard_a   Up
postgres_shard_b   Up
redis              Up
rabbitmq           Up
mongo              Up
api1               Up
api2               Up
redirect1          Up
redirect2          Up
worker             Up
nginx              Up
```

If `worker` is not up, start it explicitly:

```bash
docker-compose up -d worker
```

---

## 7. Try It Out

### 7.1 Create a new short URL

```bash
curl -X POST http://localhost:8080/shorten \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}'
```

Response:

```json
{
  "code": "1vTwn6PZ",
  "shortUrl": "http://localhost:8080/1vTwn6PZ"
}
```

### 7.2 Visit the short URL

Open in browser:

```bash
open "http://localhost:8080/1vTwn6PZ"
```

You should be redirected to `https://example.com`.

---

## 8. Inspecting Data

### 8.1 See URL rows in Postgres

Depending on your `userId`, data goes to:

- `urls_a` (even userId)
- `urls_b` (odd userId, default is 1 if you don’t send `x-user-id` header)

Example (check shard B, default user = 1):

```bash
psql postgres://postgres:password@localhost:5434/urls_b
```

Inside `psql`:

```sql
SELECT * FROM urls;
```

You should see rows with `code` and `target_url`.

### 8.2 See click events in MongoDB

```bash
docker exec -it url_shortner-mongo-1 mongosh
```

Inside `mongosh`:

```js
use url_shortener
db.clicks.find().pretty()
```

You should see documents like:

```js
{
  _id: ObjectId("..."),
  urlId: null,
  code: "1vTwn6PZ",
  userAgent: "Mozilla/5.0 ...",
  ip: "172.21.0.12",
  ts: ISODate("2025-12-04T04:29:23.997Z")
}
```

---

## 9. Stopping and Cleaning Up

To stop all containers:

```bash
docker-compose down
```

This stops and removes all containers and the default network, but **keeps your data** in Docker volumes unless you explicitly remove them.

To stop containers but keep them defined:

```bash
docker-compose stop
```

---

## 10. Extending the System (Ideas)

This project is a base you can build on:

- Implement real `GET /stats/:code` using MongoDB:
  - Aggregate click counts per code
  - Add breakdown by day/hour
- Add **authentication** & user accounts:
  - Store users in Postgres
  - Enforce per-user analytics, limits
- Add **link expiration**, **custom aliases**, etc.
- Deploy to cloud:
  - Replace local Postgres with Neon or RDS
  - Replace Redis with Upstash/Redis Cloud
  - Replace RabbitMQ with a managed MQ (e.g., CloudAMQP)
  - Replace MongoDB with Atlas

Each of these is a natural extension of the original system design ideas:

- scaling reads/writes,
- dealing with hot keys,
- fault tolerance,
- and separating concerns between core data & analytics.

---

## 11. SEO / Discoverability Notes

If you’re publishing this project on GitHub and want it to rank for **“URL shortener system design”**, consider:

- Repository name: `url-shortener-system-design`
- Description:
  > “URL shortener system design in practice: sharding, Redis cache, RabbitMQ, MongoDB analytics, Docker, Nginx load balancing.”
- Add tags/topics:
  - `system-design`
  - `url-shortener`
  - `distributed-systems`
  - `docker`
  - `nodejs`
- Link to it from blogs or posts about URL shortener system design.

---

## 12. Troubleshooting

### Worker not processing events / MongoDB empty

- Check worker logs:

  ```bash
  docker-compose logs worker --tail=50
  ```

- Ensure RabbitMQ is up:

  ```bash
  docker-compose logs rabbitmq --tail=50
  ```

- Make sure `RABBITMQ_URL` in `.env` is:

  ```env
  RABBITMQ_URL=amqp://user:pass@rabbitmq:5672
  ```

- Restart worker:

  ```bash
  docker-compose up -d worker
  ```

### Redis connection errors (ECONNREFUSED)

- Make sure Redis container is running:

  ```bash
  docker-compose ps
  ```

- Ensure `REDIS_URL` is:

  ```env
  REDIS_URL=redis://redis:6379
  ```

### 500 errors on `/shorten`

- Confirm both shards have the `urls` table created.
- Check API logs:

  ```bash
  docker-compose logs api1 --tail=50
  ```

---

Happy hacking & designing 🚀  
This project is meant to be both a **learning playground** and a **solid starting point** for real-world system design experiments.
