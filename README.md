# express-sqlite-crud
Lightweight REST API for task management built with Node.js, Express, and SQLite persistence.

## Features

- Full CRUD operations (`GET`, `POST`, `PUT`, `DELETE`).
- SQLite persistence (`tasks.db`) with automatic table creation and initial seeding.
- Zero extra native build dependencies (uses Node's built-in `node:sqlite`).

## Getting Started

### Prerequisites

- Node.js (v22.5.0 or higher recommended for `node:sqlite`)

### Installation

1. Clone the repository:
   ```bash
   git clone <YOUR_REPO_URL>
   cd express-sqlite-crud
   ```
2. Install dependencies:
    ```npm install```
3. Start the server:
    ```node server.js```
4. The server will run at `http://localhost:3000`.

### API Endpoints
- GET,/tasks,Get all tasks
- GET,/tasks/:id,Get a single task by ID
- POST,/tasks,Create a new task
- PUT,/tasks/:id,Update a task (title/done)
- DELETE,/tasks/:id,Delete a task by ID