require('dotenv').config();
const supabase = require('./supabaseClient');

const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

// Auth middleware
async function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.split(' ')[1] === '') {
    return res.status(401).json({ error: 'Access token required' });
  }

  const token = authHeader.split(' ')[1];
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.user = data.user;
  req.token = token;
  next();
}

// POST /auth/signup
app.post('/auth/signup', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  res.status(201).json(data.user);
});

// POST /auth/login
app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return res.status(401).json({ error: 'Invalid login credentials' });
  }

  res.status(200).json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    user: data.user
  });
});

// GET /public/info
app.get('/public/info', (req, res) => {
  res.status(200).json({ message: 'Welcome stranger! This info is public.' });
});

// GET /protected/profile
app.get('/protected/profile', requireAuth, (req, res) => {
  res.status(200).json({
    id: req.user.id,
    email: req.user.email,
    created_at: req.user.created_at
  });
});

// GET /protected/dashboard (second protected route to prove middleware reuse)
app.get('/protected/dashboard', requireAuth, (req, res) => {
  res.status(200).json({ message: `Welcome to your dashboard, ${req.user.email}` });
});

// POST /auth/logout
app.post('/auth/logout', requireAuth, async (req, res) => {
  const { error } = await supabase.auth.signOut(req.token);

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  res.status(204).send();
});

// Initialize PostgreSQL connection pool using .env variable
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:dev@localhost:5432/tasks'
});

// Initialize table and seed on first run
async function initDb() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        done BOOLEAN NOT NULL DEFAULT false
      )
    `);

    const countRes = await pool.query('SELECT COUNT(*) AS count FROM tasks');
    const count = parseInt(countRes.rows[0].count, 10);

    if (count === 0) {
      await pool.query(`
        INSERT INTO tasks (title, done) VALUES 
        ('Buy groceries', false),
        ('Complete Week 3 backend assignment', false),
        ('Review SQL queries', true)
      `);
      console.log('Database seeded with example tasks.');
    }
    console.log('PostgreSQL database connected and initialized.');
  } catch (err) {
    console.error('Database initialization error:', err);
  }
}

// initDb();  temporarily disabled while focusin on supabase auth setup

// GET /tasks - Read all tasks
app.get('/tasks', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, title, done FROM tasks ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /tasks/:id - Read a single task
app.get('/tasks/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('SELECT id, title, done FROM tasks WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /tasks - Create a new task using RETURNING
app.post('/tasks', async (req, res) => {
  const { title } = req.body;

  if (!title || typeof title !== 'string' || title.trim() === '') {
    return res.status(400).json({ error: 'Title is required and must be a non-empty string' });
  }

  try {
    const result = await pool.query(
      'INSERT INTO tasks (title, done) VALUES ($1, $2) RETURNING id, title, done',
      [title.trim(), false]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /tasks/:id - Update an existing task
app.put('/tasks/:id', async (req, res) => {
  const { id } = req.params;
  const { title, done } = req.body;

  try {
    const existing = await pool.query('SELECT id, title, done FROM tasks WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const currentTask = existing.rows[0];
    const updatedTitle = title !== undefined ? String(title).trim() : currentTask.title;
    const updatedDone = done !== undefined ? Boolean(done) : currentTask.done;

    if (updatedTitle === '') {
      return res.status(400).json({ error: 'Title cannot be empty' });
    }

    const result = await pool.query(
      'UPDATE tasks SET title = $1, done = $2 WHERE id = $3 RETURNING id, title, done',
      [updatedTitle, updatedDone, id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /tasks/:id - Delete a task
app.delete('/tasks/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query('DELETE FROM tasks WHERE id = $1', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    // Assignment allows 204 or 200 with message
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running and connected to Supabase on http://localhost:${PORT}`);
});