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

// POST /tasks - Create a new task in SQLite
app.post('/tasks', (req, res) => {
  const { title } = req.body;

  // Input validation: ensure title is present and non-empty
  if (!title || typeof title !== 'string' || title.trim() === '') {
    return res.status(400).json({ error: 'Title is required and must be a non-empty string' });
  }

  const stmt = db.prepare('INSERT INTO tasks (title, done) VALUES (?, ?)');
  const result = stmt.run(title.trim(), 0);

  // Return 201 Created with the new row's ID
  res.status(201).json({
    id: Number(result.lastInsertRowid),
    title: title.trim(),
    done: false
  });
});

// PUT /tasks/:id - Update an existing task in SQLite
app.put('/tasks/:id', (req, res) => {
  const { id } = req.params;
  const { title, done } = req.body;

  // 1. Check if the task exists first
  const existing = db.prepare('SELECT id, title, done FROM tasks WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ error: 'Task not found' });
  }

  // 2. Fall back to current values if fields aren't provided in req.body
  const updatedTitle = title !== undefined ? String(title).trim() : existing.title;
  const updatedDone = done !== undefined ? (done ? 1 : 0) : existing.done;

  if (updatedTitle === '') {
    return res.status(400).json({ error: 'Title cannot be empty' });
  }

  // 3. Perform update query
  const stmt = db.prepare('UPDATE tasks SET title = ?, done = ? WHERE id = ?');
  stmt.run(updatedTitle, updatedDone, id);

  res.json({
    id: Number(id),
    title: updatedTitle,
    done: Boolean(updatedDone)
  });
});

// DELETE /tasks/:id - Delete a task from SQLite
app.delete('/tasks/:id', (req, res) => {
  const { id } = req.params;

  const stmt = db.prepare('DELETE FROM tasks WHERE id = ?');
  const result = stmt.run(id);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Task not found' });
  }

  res.status(200).json({ message: `Task ${id} deleted successfully` });
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});