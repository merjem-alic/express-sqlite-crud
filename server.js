const swaggerUi = require('swagger-ui-express');

require('dotenv').config();
const supabase = require('./supabaseClient');

const express = require('express');
const { Pool } = require('pg');

const { z } = require('zod');

const fs = require('fs');
const path = require('path');

const OpenAI = require('openai');
const client = new OpenAI({
  baseURL: process.env.LLM_BASE_URL,
  apiKey: process.env.LLM_API_KEY,
  timeout: 30000, // 30 seconds — the SDK default is 10 minutes, far too long for an HTTP endpoint
  maxRetries: 0,  // we implement our own retry logic below instead of relying on the SDK's silent defaults
});

const app = express();
app.use(express.json());

const NORMALIZE_PROMPT = fs.readFileSync(
  path.join(__dirname, 'prompts', 'normalize-v1.md'),
  'utf-8'
);

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

const swaggerDocument = require('./openapi.json');
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

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

// ---------- /normalize schema ----------

const CANONICAL_TITLES = [
  "Software Engineer",
  "Senior Software Engineer",
  "Staff Software Engineer",
  "Engineering Manager",
  "Product Manager",
  "Data Scientist",
  "DevOps Engineer",
  "QA Engineer",
  "other"
];

const NormalizeOutputSchema = z.object({
  canonical_title: z.enum(CANONICAL_TITLES),
  confidence: z.number().min(0).max(1),
  reason: z.string().min(1)
});

// ---------- /normalize helpers ----------

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function callModel(messages) {
  const maxAttempts = 3; // 1 initial + up to 2 retries on the right errors
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const startedAt = Date.now();
    try {
      const completion = await client.chat.completions.create({
        model: process.env.LLM_MODEL,
        temperature: 0.2,
        messages
      });

      const durationMs = Date.now() - startedAt;
      const usage = completion.usage || {};

      // structured cost log line
      console.log(JSON.stringify({
        type: 'llm_call',
        prompt_version: 'normalize-v1',
        model: process.env.LLM_MODEL,
        input_tokens: usage.prompt_tokens ?? null,
        output_tokens: usage.completion_tokens ?? null,
        duration_ms: durationMs,
        attempt
      }));

      return completion.choices[0].message.content;

    } catch (err) {
      const status = err.status || err.response?.status;

      // never retry client errors — a bad key or bad request will still be bad in 4 seconds
      if (status === 400 || status === 401 || status === 403) {
        throw err;
      }

      lastError = err;

      // retry on timeout, 429, or 5xx — with backoff + jitter
      const isRetryable = status === 429 || (status >= 500 && status < 600) || err.name === 'APIConnectionTimeoutError' || err.code === 'ETIMEDOUT';

      if (isRetryable && attempt < maxAttempts) {
        const retryAfterHeader = err.headers?.['retry-after'];
        const waitMs = retryAfterHeader
          ? parseInt(retryAfterHeader, 10) * 1000
          : (Math.pow(2, attempt - 1) * 1000) + Math.floor(Math.random() * 300); // exponential backoff + jitter

        console.log(JSON.stringify({ type: 'llm_retry', attempt, status, wait_ms: waitMs }));
        await sleep(waitMs);
        continue;
      }

      throw err;
    }
  }

  throw lastError;
}

function tryParse(rawText) {
  // strip code fences if present, find the JSON object
  let cleaned = rawText.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) cleaned = fenceMatch[1].trim();

  try {
    return { ok: true, data: JSON.parse(cleaned) };
  } catch (err) {
    return { ok: false, error: `JSON parse failed: ${err.message}` };
  }
}

// ---------- POST /normalize ----------

app.post('/normalize', async (req, res) => {
  const { title } = req.body;

  if (!title || typeof title !== 'string' || title.length < 1 || title.length > 100) {
    return res.status(400).json({ error: 'title is required and must be 1-100 characters' });
  }

  if (process.env.LLM_STUB === '1') {
    return res.status(200).json({
      canonical_title: "Software Engineer",
      confidence: 0.99,
      reason: "Stub mode — hard-coded response, no model called."
    });
  }

  if (process.env.LLM_ENABLED === 'false') {
    return res.status(503).json({ error: 'LLM feature is currently disabled' });
  }

  const baseMessages = [
    { role: 'system', content: NORMALIZE_PROMPT },
    { role: 'user', content: JSON.stringify({ title }) }
  ];

  try {
    // first attempt
    let rawText = await callModel(baseMessages);
    let parsed = tryParse(rawText);
    let validation = parsed.ok ? NormalizeOutputSchema.safeParse(parsed.data) : null;

    if (parsed.ok && validation.success) {
      return res.status(200).json(validation.data);
    }

    // repair retry — send the broken output + the error back to the model
    const errorMessage = parsed.ok
      ? `Validation failed: ${JSON.stringify(validation.error.issues)}`
      : parsed.error;

    const repairMessages = [
      ...baseMessages,
      { role: 'assistant', content: rawText },
      { role: 'user', content: `Your previous answer was rejected for this reason: ${errorMessage}. Return only corrected JSON matching the schema.` }
    ];

    const repairedRawText = await callModel(repairMessages);
    const repairedParsed = tryParse(repairedRawText);
    const repairedValidation = repairedParsed.ok ? NormalizeOutputSchema.safeParse(repairedParsed.data) : null;

    if (repairedParsed.ok && repairedValidation.success) {
      return res.status(200).json(repairedValidation.data);
    }

    // give up cleanly — quarantine
    const quarantineDir = path.join(__dirname, 'logs');
    if (!fs.existsSync(quarantineDir)) fs.mkdirSync(quarantineDir, { recursive: true });

    const quarantineEntry = {
      timestamp: new Date().toISOString(),
      input: { title },
      raw_output: repairedRawText,
      error: repairedParsed.ok ? JSON.stringify(repairedValidation.error.issues) : repairedParsed.error,
      prompt_version: 'normalize-v1'
    };

    fs.appendFileSync(
      path.join(quarantineDir, 'quarantine.jsonl'),
      JSON.stringify(quarantineEntry) + '\n'
    );

    return res.status(422).json({ error: 'Model could not produce a valid response after repair attempt' });

  } catch (err) {
    if (err.name === 'APIConnectionTimeoutError' || err.code === 'ETIMEDOUT') {
      return res.status(504).json({ error: 'Model call timed out' });
    }
    return res.status(500).json({ error: 'Model call failed', detail: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running and connected to Supabase on http://localhost:${PORT}`);
});