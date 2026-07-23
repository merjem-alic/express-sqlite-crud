const express = require('express');
const { DatabaseSync } = require('node:sqlite');

const app = express();
app.use(express.json());

// 1. Open (or create) the SQLite database file
const db = new DatabaseSync('tasks.db');

// 2. Create the table if it doesn't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    done BOOLEAN NOT NULL DEFAULT 0
  )
`);

// 3. Seed 3 example tasks ONLY if the table is empty
const count = db.prepare('SELECT COUNT(*) AS count FROM tasks').get().count;

if (count === 0) {
  const insert = db.prepare('INSERT INTO tasks (title, done) VALUES (?, ?)');
  insert.run('Buy groceries', 0);
  insert.run('Complete Week 3 backend assignment', 0);
  insert.run('Review SQL queries', 1);
  console.log('Database seeded with example tasks.');
}

// GET /tasks - Read all tasks from SQLite
app.get('/tasks', (req, res) => {
  const tasks = db.prepare('SELECT id, title, done FROM tasks').all();
  
  // SQLite stores booleans as 0 or 1, convert back to true/false for JSON
  const formattedTasks = tasks.map(task => ({
    ...task,
    done: Boolean(task.done)
  }));

  res.json(formattedTasks);
});

// GET /tasks/:id - Read a single task by ID using parameterized query (?)
app.get('/tasks/:id', (req, res) => {
  const { id } = req.params;
  const task = db.prepare('SELECT id, title, done FROM tasks WHERE id = ?').get(id);

  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }

  res.json({
    ...task,
    done: Boolean(task.done)
  });
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});