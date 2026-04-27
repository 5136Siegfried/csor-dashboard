'use strict';

const express  = require('express');
const fs       = require('fs');
const path     = require('path');
const jwt      = require('jsonwebtoken');

const app  = express();
const PORT            = process.env.PORT            || 3000;
const JWT_SECRET      = process.env.JWT_SECRET      || (() => { throw new Error('JWT_SECRET manquant') })();
const EDITOR_PASSWORD = process.env.EDITOR_PASSWORD || (() => { throw new Error('EDITOR_PASSWORD manquant') })();
const DATA_FILE       = process.env.DATA_FILE       || path.join(__dirname, 'data', 'data.json');

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function requireEditor(req, res, next) {
  const auth = req.headers.authorization ?? '';
  if (!auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Non autorisé' });
  try {
    jwt.verify(auth.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token invalide ou expiré' });
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function readData() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return null; }
}

function writeData(payload) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(payload, null, 2), 'utf8');
}

// ── Routes ────────────────────────────────────────────────────────────────────

// Health-check (used by CI)
app.get('/health', (_req, res) => res.json({ status: 'ok', ts: Date.now() }));

// Auth
app.post('/api/auth', (req, res) => {
  if (req.body?.password !== EDITOR_PASSWORD)
    return res.status(401).json({ error: 'Mot de passe incorrect' });

  const token = jwt.sign({ role: 'editor' }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token });
});

// Data — lecture publique
app.get('/api/data', (req, res) => {
  const data = readData();
  if (!data) return res.status(404).json({ error: 'Aucune donnée initialisée' });
  res.json(data);
});

// Data — écriture réservée aux éditeurs
app.put('/api/data', requireEditor, (req, res) => {
  writeData(req.body);
  res.json({ ok: true });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => console.log(`[maraude] Serveur démarré sur :${PORT}`));
