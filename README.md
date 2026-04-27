# Maraude Dashboard

> Outil de pilotage stratégique pour une association de maraude sanitaire —
> recrutement bénévoles, suivi de formation, gestion des partenariats.

[![CI/CD](https://github.com/TON_ORG/maraude/actions/workflows/deploy.yml/badge.svg)](https://github.com/TON_ORG/maraude/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## Contexte et problématique

À la reprise d'une association de maraude sanitaire après une période de sommeil,
plusieurs besoins opérationnels immédiats sont apparus simultanément :

- **aucun outil partagé** pour suivre le pipeline de recrutement bénévole,
- **absence de traçabilité** sur l'avancement des formations et des partenariats,
- **besoin de légitimité** : montrer aux partenaires et financeurs que la structure
  est pilotée avec méthode.

Ce projet répond à ces trois besoins avec un outil web léger, auto-hébergé,
sans dépendance à des SaaS tiers, pensé pour une petite équipe non technique.

---

## Fonctionnalités

| Module | Description |
|---|---|
| Vue d'ensemble | KPIs temps réel, avancement des 5 axes stratégiques |
| Pipeline bénévoles | Kanban Prospect → Contacté → Formation → Actif |
| Formation | 4 modules pédagogiques avec suivi |
| Partenaires | Gestion des associations hôtes et points d'accueil |
| Actions | Backlog priorisé par axe stratégique |

**Modèle d'accès** : lecture publique sans authentification / édition protégée par JWT.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   GitHub                             │
│  ┌──────────────┐        ┌──────────────────────┐   │
│  │ branch:      │        │ branch: main          │   │
│  │ sandbox      │        │ (production)          │   │
│  └──────┬───────┘        └──────────┬───────────┘   │
│         │ push                      │ push           │
│  ┌──────▼───────────────────────────▼───────────┐   │
│  │           GitHub Actions                      │   │
│  │  lint → build → push GHCR → deploy via SSH   │   │
│  └──────────────────────┬────────────────────────┘   │
└─────────────────────────┼────────────────────────────┘
                          │
              ┌───────────▼───────────┐
              │   Serveur Ubuntu      │
              │   ┌────────────────┐  │
              │   │  Nginx (443)   │  │
              │   └───┬────────┬───┘  │
              │       │        │      │
              │  demo.X.fr   X.fr    │
              │       │        │      │
              │  ┌────▼──┐  ┌──▼───┐  │
              │  │:3001  │  │:3000 │  │
              │  │sandbox│  │ prod │  │
              │  └───────┘  └──────┘  │
              │   (Docker)   (Docker) │
              └───────────────────────┘
```

**Stack technique** : Node.js 20 · Express 4 · JWT · Docker Alpine · GitHub Actions · Nginx

**Stockage** : fichier JSON persisté dans un volume Docker nommé.
Pas de base de données en V1 — décision intentionnelle pour limiter la surface
opérationnelle sur une structure bénévole. Voir roadmap pour l'évolution.

---

## Stratégie d'environnements

Deux environnements distincts, deux objectifs différents.

### Sandbox — `demo.maraude.5136.fr`

| Propriété | Valeur |
|---|---|
| Branche source | `sandbox` |
| Authentification | Aucune — tout le monde peut voir et éditer |
| Données | Jeu de données fictif pré-chargé |
| Objectif | Démonstration aux partenaires, recrutement, vitrine |
| Réinitialisation | Manuelle (automatique via cron en V2) |

La sandbox est délibérément ouverte : elle sert de preuve de concept tangible
lors de rencontres partenariales et permet aux futurs bénévoles de se projeter
dans l'outil avant d'intégrer l'association.

### Production — `maraude.5136.fr`

| Propriété | Valeur |
|---|---|
| Branche source | `main` |
| Authentification | JWT 24h — mot de passe partagé pour les éditeurs |
| Données | Données réelles, volume Docker persistant |
| Objectif | Usage opérationnel quotidien |
| Sauvegarde | Dump JSON hebdomadaire (cron, V2) |

La production n'est déclenchée que par merge sur `main` après review,
jamais par push direct (protection de branche activée sur GitHub).

### Matrice de déploiement

```
git push sandbox → lint → build → deploy:sandbox  (demo.maraude.5136.fr)
git push main    → lint → build → deploy:prod      (maraude.5136.fr)
Pull Request     → lint → build only (pas de déploiement)
```

---

## Modèle de sécurité

**V1 — Authentification partagée**

- Lecture : publique, aucun token requis
- Écriture : JWT signé (HS256), durée 24h, stocké en `sessionStorage`
- Mot de passe : variable d'environnement `EDITOR_PASSWORD`, injectée via
  GitHub Secrets au déploiement, jamais dans le code ni dans git
- Conteneur : utilisateur non-root `maraude:maraude`, port interne uniquement
  exposé à Nginx

**Limites connues et assumées**

Le modèle "mot de passe partagé" est adapté à une petite équipe de coordinateurs
(moins de 5 personnes) avec un niveau de confiance mutuelle élevé. Il ne convient
pas à un accès multi-utilisateurs avec traçabilité individuelle des actions.
Cette limite est documentée et adressée en roadmap V2.

---

## CI/CD

Le pipeline est entièrement piloté par GitHub Actions et suit un modèle
**trunk-based** avec deux branches long-lived (`sandbox` et `main`).

```
PR ouverte
 └── [lint] Vérification syntaxe Node.js
 └── [build] Construction image Docker (sans push)
     → feedback rapide avant merge

Merge sur sandbox / main
 └── [lint]
 └── [build + push] Image poussée sur GHCR (ghcr.io/org/maraude:<sha>)
 └── [deploy] SSH → docker compose pull && up -d
 └── [healthcheck] GET /health → 200 attendu dans les 10s
     → échec = rollback manuel alerté dans les logs Actions
```

Chaque image est taguée par SHA de commit (`sha-abc1234`) et `latest`.
Le tag SHA permet un rollback précis sans reconstruire.

**Secrets GitHub requis**

| Secret | Sandbox | Prod |
|---|:---:|:---:|
| `SERVER_HOST` | ✓ | ✓ |
| `SERVER_USER` | ✓ | ✓ |
| `SERVER_SSH_KEY` | ✓ | ✓ |
| `JWT_SECRET` | — | ✓ |
| `EDITOR_PASSWORD` | — | ✓ |

---

## Roadmap

### V1 — Fondations *(en cours)*
- [x] Dashboard mono-page — 5 modules fonctionnels
- [x] API REST légère Node.js/Express
- [x] Authentification JWT (lecture publique / écriture protégée)
- [x] Persistance JSON sur volume Docker
- [x] CI/CD GitHub Actions — deux environnements distincts
- [x] Nginx reverse proxy + TLS Let's Encrypt

### V2 — Consolidation opérationnelle
- [ ] Comptes utilisateurs distincts avec rôles (coordinateur / observateur)
- [ ] Sauvegarde automatique vers stockage objet (cron hebdomadaire)
- [ ] Réinitialisation sandbox automatisée (cron)
- [ ] Notifications email sur actions prioritaires (Nodemailer)
- [ ] Export CSV pipeline bénévoles
- [ ] Agenda des maraudes avec récurrence

### V3 — Ouverture et collaboration
- [ ] Migration vers SQLite (garanties de consistance multi-writers)
- [ ] API documentée OpenAPI — intégration outils tiers
- [ ] Accès en lecture partageable par lien tokenisé
- [ ] Tableau de bord partenaires en lecture seule (par association)
- [ ] Internationalisation (fr/en)

---

## Décisions techniques (ADR)

Ce projet maintient un journal des décisions d'architecture.

**ADR-001 — JSON file vs base de données**
Contexte : structure bénévole, administrateur unique, volume < 500 entrées.
Décision : stockage JSON sur volume Docker en V1.
Raison : zéro maintenance (pas de migration, pas de processus à superviser),
rollback trivial (copie du fichier). Coût d'opportunité acceptable à ce stade.
Révision prévue si le volume dépasse 500 entrées ou si plusieurs administrateurs
simultanés deviennent nécessaires.

**ADR-002 — Mot de passe partagé vs comptes utilisateurs**
Contexte : équipe de 2 à 3 coordinateurs, relation de confiance forte.
Décision : mot de passe partagé JWT en V1.
Raison : la complexité d'un système de comptes complet (inscription, reset,
audit trail) n'est pas justifiée à ce stade de maturité de l'association.
Révision en V2 si l'équipe dépasse 5 personnes ou si la traçabilité individuelle
devient une exigence partenariale ou réglementaire.

**ADR-003 — Auto-hébergement vs SaaS**
Contexte : données sensibles (coordonnées bénévoles, informations partenaires),
budget associatif contraint.
Décision : auto-hébergement sur VPS dédié.
Raison : souveraineté des données, coût maîtrisé (environ 5 € / mois),
aucune dépendance à un tiers pour la continuité de service.

**ADR-004 — Deux branches long-lived vs GitFlow**
Contexte : un seul développeur, deux cibles de déploiement.
Décision : `sandbox` et `main` comme seules branches permanentes.
Raison : GitFlow ajoute une complexité de merge non justifiée pour une équipe
solo. Le modèle trunk-based simplifié suffit et évite les conflits de longue durée.

---

## Installation

### Prérequis serveur

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

sudo mkdir -p /opt/maraude-prod /opt/maraude-sandbox
sudo chown $USER:$USER /opt/maraude-prod /opt/maraude-sandbox

sudo apt install -y nginx certbot python3-certbot-nginx
```

### Nginx + TLS

```bash
sudo cp nginx/prod.conf    /etc/nginx/sites-available/maraude-prod
sudo cp nginx/sandbox.conf /etc/nginx/sites-available/maraude-sandbox
sudo ln -s /etc/nginx/sites-available/maraude-prod    /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/maraude-sandbox /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

sudo certbot --nginx \
  -d maraude.tondomaine.fr \
  -d demo.maraude.5136.fr
```

### Clé SSH dédiée CI/CD

```bash
ssh-keygen -t ed25519 -C "github-actions-maraude" \
  -f ~/.ssh/maraude_deploy -N ""
ssh-copy-id -i ~/.ssh/maraude_deploy.pub deploy@ton-serveur
# Copier le contenu de ~/.ssh/maraude_deploy → secret SERVER_SSH_KEY
```

### Premier déploiement

```bash
git remote add origin git@github.com:TON_ORG/maraude.git

# Sandbox en premier pour valider le pipeline
git checkout -b sandbox && git push origin sandbox

# Production après validation
git checkout main && git push origin main
```

---

## Développement local

```bash
npm install
JWT_SECRET=dev EDITOR_PASSWORD=dev node server.js
# → http://localhost:3000  |  mot de passe éditeur : "dev"
```

---

## Structure du projet

```
maraude/
├── .github/
│   └── workflows/
│       └── deploy.yml              Pipeline CI/CD — lint, build, deploy
├── public/
│   └── index.html                  Application frontend (SPA, zéro dépendance)
├── nginx/
│   ├── prod.conf                   Reverse proxy production (TLS, headers sécurité)
│   └── sandbox.conf                Reverse proxy sandbox
├── server.js                       API Express — auth JWT + lecture/écriture données
├── package.json
├── Dockerfile                      Build multi-stage, image Alpine non-root
├── docker-compose.prod.yml         Déploiement production
├── docker-compose.sandbox.yml      Déploiement sandbox (auth désactivée)
├── .env.example                    Variables d'environnement attendues
└── README.md
```

---

## Licence

MIT — voir [LICENSE](LICENSE).

---

*Projet initié en 2025 dans le cadre de la reprise de l'association.*
*Conçu pour être transférable à un successeur sans compétences techniques avancées.*
