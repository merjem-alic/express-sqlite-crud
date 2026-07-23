# express-postgres-crud

Lightweight REST API for task management built with Node.js, Express, PostgreSQL, and Docker Compose.

## Features

- Full CRUD operations (`GET`, `POST`, `PUT`, `DELETE`).
- PostgreSQL persistence running in Docker with a named volume.
- Single-command stack startup with Docker Compose.
- Healthcheck integration to guarantee database readiness on startup.

## Architecture & Layering

By leveraging a modular data access pattern, we swapped out the previous storage engine for a PostgreSQL repository (`pg` pool) **without modifying any Express route handlers or service logic**. The endpoint contracts (`GET`, `POST`, `PUT`, `DELETE` at `/tasks`) remain completely identical.

## Getting Started

### Prerequisites

- Docker Desktop installed and running.

### How to Run

1. Clone the repository:

   ```bash
   git clone <YOUR_REPO_URL>
   cd express-sqlite-crud
   ```

2. Spin up the multi-container stack:

   ```bash
   docker compose up --build
   ```

3. The server will run at `http://localhost:3000`.

### Environment Variables

- `.env` contains the local database connection string (git-ignored).
- Refer to `.env.example` for the required configuration format:

  ```
  DATABASE_URL=postgres://postgres:dev@localhost:5432/tasks
  ```

### Persistence Verification

Data persistence across container restarts was verified through the following steps:

1. Started the stack with `docker compose up -d`.
2. Created a new task via `POST /tasks`.
3. Stopped and destroyed the container stack using `docker compose down`.
4. Restarted the stack with `docker compose up -d`.
5. Executed `GET /tasks` — all previously saved records persisted via the named volume (`taskdata`).

## API Endpoints

- `GET /tasks` - Get all tasks
- `GET /tasks/:id` - Get a single task by ID
- `POST /tasks` - Create a new task (`{ "title": "New Task" }`)
- `PUT /tasks/:id` - Update a task (`{ "title": "Updated", "done": true }`)
- `DELETE /tasks/:id` - Delete a task by ID