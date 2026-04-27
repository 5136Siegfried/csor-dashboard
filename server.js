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

// ── Données initiales ────────────────────────────────────────────────────────
const DEFAULT_DATA = {
  benevoles: [],
  partenaires: [],
  actions: [],
  axes: [
    { id: 'recrutement', titre: 'Recrutement', items: [
      { label: 'Fiche de poste bénévole rédigée', done: false },
      { label: 'Publication JeVeuxAider', done: false },
      { label: 'Partenariat UFR santé', done: false },
      { label: "Stand en école d'infirmiers", done: false },
    ]},
    { id: 'formation', titre: 'Formation', items: [
      { label: 'Socle commun défini', done: false },
      { label: 'Module secours planifié', done: false },
      { label: 'Module orientation réalisé', done: false },
      { label: 'Formation situations complexes', done: false },
    ]},
    { id: 'partenariats', titre: 'Partenariats & points accueil', items: [
      { label: 'Cartographie des ressources locales', done: false },
      { label: 'Première convention signée', done: false },
      { label: 'Deuxième partenaire formalisé', done: false },
    ]},
    { id: 'fidelisation', titre: 'Fidélisation', items: [
      { label: 'Rythme maraude adapté défini', done: false },
      { label: 'Protocole débriefing post-maraude', done: false },
      { label: 'Parcours de progression interne', done: false },
    ]},
    { id: 'communication', titre: 'Communication', items: [
      { label: 'Page LinkedIn/Instagram créée', done: false },
      { label: 'Kit recrutement visuel', done: false },
    ]},
  ]
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function readData() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return null; }
}

function writeData(payload) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(payload, null, 2), 'utf8');
}

// Initialise data.json au démarrage si absent
function initData() {
  if (!readData()) {
    writeData(DEFAULT_DATA);
    console.log('[maraude] data.json initialisé avec les données par défaut');
  }
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
  res.json(readData());
});

// Data — écriture réservée aux éditeurs
app.put('/api/data', requireEditor, (req, res) => {
  writeData(req.body);
  res.json({ ok: true });
});

// ── Start ─────────────────────────────────────────────────────────────────────
initData();
app.listen(PORT, () => console.log(`[maraude] Serveur démarré sur :${PORT}`));