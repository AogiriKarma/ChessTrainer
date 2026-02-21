# ChessTrainer — Plateforme de training personnalisé aux échecs

Plateforme web qui analyse les parties d'un joueur via les APIs Lichess et Chess.com, détecte ses erreurs récurrentes, et génère des exercices personnalisés pour les corriger.

---

## Concept

Le principe central : au lieu de faire des puzzles génériques, le joueur s'entraîne sur **ses propres erreurs**. Le système fetch ses parties, les analyse avec Stockfish, classe les erreurs par type, et génère des exercices directement issus de ses games. La progression est trackée dans le temps pour mesurer l'amélioration réelle.

---

## Stack technique

### Frontend
- **React + Vite** — UI principale
- **Tailwind CSS** — styling
- **chess.js** — logique échiquier (validation coups, FEN, PGN)
- **react-chessboard** — composant échiquier interactif
- **Stockfish WASM** (optionnel) — évaluation en temps réel côté client pour l'exploration interactive

### Backend
- **Node.js + Fastify** — API REST
- **PostgreSQL** — base de données principale
- **Prisma** — ORM
- **Redis** — broker pour la queue de jobs
- **BullMQ** — queue d'analyse en background
- **WebSocket** — notifications temps réel (analyse prête, exercice complété)

### Engine
- **Stockfish binaire** — analyse des parties côté serveur, génération des exercices
- Appelé via `child_process` Node.js, piloté par UCI protocol

### Infrastructure
- **VPS** obligatoire (Fly.io, DigitalOcean, Hetzner) — pas de serverless, le binaire Stockfish doit être installé sur la machine
- Docker pour le déploiement

---

## Architecture du projet

```
/
├── apps/
│   ├── web/                  # React frontend
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── Chessboard/       # Échiquier interactif
│   │   │   │   ├── ExerciseView/     # Vue d'un exercice
│   │   │   │   ├── Dashboard/        # Stats et progression
│   │   │   │   └── Auth/             # Login Lichess / Chess.com
│   │   │   ├── hooks/
│   │   │   │   ├── useStockfish.ts   # Wrapper Stockfish WASM
│   │   │   │   └── useWebSocket.ts   # Connexion WS
│   │   │   └── pages/
│   │   │       ├── Home.tsx
│   │   │       ├── Training.tsx
│   │   │       └── Profile.tsx
│   │
│   └── api/                  # Fastify backend
│       ├── routes/
│       │   ├── auth.ts
│       │   ├── games.ts
│       │   ├── exercises.ts
│       │   └── profile.ts
│       ├── jobs/
│       │   ├── analyzeGame.ts        # Job BullMQ : analyse une partie
│       │   └── generateExercise.ts   # Job BullMQ : crée l'exercice
│       └── services/
│           ├── stockfish.ts          # Wrapper binaire Stockfish
│           ├── lichess.ts            # Client API Lichess
│           └── chesscom.ts           # Client API Chess.com
│
└── packages/
    ├── chess-engine/         # Logique partagée échiquier
    │   ├── analyzer.ts       # Classifier d'erreurs
    │   ├── pgn-parser.ts     # Parse et normalise les PGN
    │   └── phase-detector.ts # Détection ouverture/milieu/finale
    └── types/                # Types TypeScript partagés
```

Monorepo géré avec **pnpm workspaces**.

---

## Pipeline de données

```
1. Auth joueur (OAuth Lichess / username Chess.com)
            ↓
2. Fetch des N dernières parties via API
            ↓
3. Stockage PGN brut en DB + enqueue job d'analyse
            ↓
4. Job BullMQ : analyse chaque coup avec Stockfish
            ↓
5. Classifier les erreurs par type et sévérité
            ↓
6. Générer les exercices et les stocker en DB
            ↓
7. Notifier le client via WebSocket
            ↓
8. Le joueur fait ses exercices → progression trackée
```

---

## APIs externes

### Lichess API

L'API Lichess est publique, gratuite, sans clé pour les endpoints de base. Elle retourne les evals Stockfish déjà calculés si le joueur a activé l'analyse de ses parties — ce qui évite de relancer Stockfish sur ces games.

**Authentification :** OAuth 2.0 standard

```
GET https://lichess.org/oauth/authorize
  ?client_id=<APP_ID>
  &response_type=code
  &redirect_uri=<CALLBACK_URL>
  &scope=preference:read

POST https://lichess.org/api/token
  → access_token

GET https://lichess.org/api/games/user/<username>
  ?max=50&evals=true&opening=true&clocks=true
  Accept: application/x-ndjson
```

La réponse est streamée en NDJSON (une partie par ligne), ce qui permet de traiter les games au fur et à mesure sans attendre la fin du fetch.

### Chess.com API

L'API Chess.com est publique mais sans OAuth — on fetch les parties publiques d'un joueur via son username. Pas d'evals dans les PGN, donc Stockfish tourne côté serveur sur toutes leurs parties.

```
GET https://api.chess.com/pub/player/<username>/games/<year>/<month>
```

---

## Intégration Stockfish côté serveur

Stockfish tourne comme un processus externe, piloté via le protocole UCI (Universal Chess Interface) par stdin/stdout.

```typescript
// apps/api/services/stockfish.ts
import { spawn } from 'child_process'

interface AnalysisResult {
  bestMove: string
  eval: number       // en centipawns, positif = avantage blanc
  depth: number
  pv: string[]       // principal variation (meilleure ligne)
}

function analyzePosition(fen: string, depth = 20): Promise<AnalysisResult> {
  return new Promise((resolve, reject) => {
    const sf = spawn('stockfish')
    let currentEval = 0
    let pv: string[] = []

    sf.stdout.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n')
      for (const line of lines) {

        // Ligne d'info : contient l'eval et la variation
        if (line.startsWith(`info depth ${depth}`) && line.includes('score cp')) {
          const cpMatch = line.match(/score cp (-?\d+)/)
          const pvMatch = line.match(/pv (.+)/)
          if (cpMatch) currentEval = parseInt(cpMatch[1])
          if (pvMatch) pv = pvMatch[1].trim().split(' ')
        }

        // Stockfish a fini de calculer
        if (line.startsWith('bestmove')) {
          const bestMove = line.split(' ')[1]
          sf.kill()
          resolve({ bestMove, eval: currentEval, depth, pv })
        }
      }
    })

    sf.stderr.on('data', (err: Buffer) => reject(new Error(err.toString())))

    sf.stdin.write('uci\n')
    sf.stdin.write('isready\n')
    sf.stdin.write(`position fen ${fen}\n`)
    sf.stdin.write(`go depth ${depth}\n`)
  })
}
```

Pour ne pas spawner un processus Stockfish par requête (coûteux), on maintient un **pool de processus** avec une queue qui distribue les analyses.

---

## Classifier d'erreurs

C'est le coeur du projet. Pour chaque coup, on a : l'eval avant, l'eval après, le coup joué, le meilleur coup engine. La perte en centipawns donne la sévérité. Le classifier détermine ensuite *pourquoi* le coup était mauvais.

```typescript
// packages/chess-engine/analyzer.ts

type MistakeType =
  | 'TACTICAL_MISS'       // combinaison ratée (fourchette, mat, clouage...)
  | 'OPENING_DEVIATION'   // déviation de la théorie en ouverture
  | 'ENDGAME_ERROR'       // erreur technique en finale
  | 'BLUNDER_POSITIONAL'  // blunder sans thème tactique clair
  | 'INACCURACY'          // imprécision (perte modérée)

interface MistakeClassification {
  type: MistakeType
  theme?: TacticalTheme   // si TACTICAL_MISS : fork, pin, skewer, back_rank...
  evalLoss: number        // centipawns perdus
  severity: 'blunder' | 'mistake' | 'inaccuracy'
}

function classifyMistake(
  fen: string,
  playedMove: string,
  bestMove: string,
  evalBefore: number,
  evalAfter: number
): MistakeClassification {

  const evalLoss = Math.abs(evalBefore - evalAfter)
  const phase = detectGamePhase(fen)
  const tacticalTheme = detectTacticalTheme(fen, bestMove)

  const severity =
    evalLoss >= 200 ? 'blunder' :
    evalLoss >= 80  ? 'mistake' :
                      'inaccuracy'

  if (evalLoss >= 200) {
    if (tacticalTheme) return { type: 'TACTICAL_MISS', theme: tacticalTheme, evalLoss, severity }
    if (phase === 'endgame') return { type: 'ENDGAME_ERROR', evalLoss, severity }
    return { type: 'BLUNDER_POSITIONAL', evalLoss, severity }
  }

  if (phase === 'opening') return { type: 'OPENING_DEVIATION', evalLoss, severity }

  return { type: 'INACCURACY', evalLoss, severity }
}
```

La détection de thème tactique fonctionne en faisant jouer la meilleure séquence par Stockfish et en analysant la position résultante : est-ce qu'une pièce est en fourchette ? Y a-t-il un mat en N coups ? Un clouage ?

---

## Types d'exercices générés

Chaque type d'erreur génère un exercice différent.

### TACTICAL_MISS → Puzzle

La position exacte du moment de l'erreur est présentée comme un puzzle. Le joueur doit trouver le coup qu'il a raté en partie. Si plusieurs coups sont dans la solution, ils sont tous requis (principal variation).

### OPENING_DEVIATION → Drill d'ouverture

La séquence depuis le coup 1 jusqu'à l'erreur est rejouée. Le joueur doit répéter la bonne ligne. Un move tree des variations acceptables est stocké et vérifié à chaque coup.

### ENDGAME_ERROR → Finale contre Stockfish affaibli

La position de finale est isolée. Le joueur joue contre Stockfish avec une force réduite (Elo cible ~200 points au-dessus du joueur) pour s'entraîner à la convertir proprement.

### BLUNDER_POSITIONAL → Analyse guidée

Position présentée avec une explication (générée ou issue d'une base de positions annotées) sur pourquoi le coup joué était mauvais et quel était le plan correct.

---

## Schéma de base de données

```sql
-- Joueur
Player (
  id          UUID PRIMARY KEY,
  lichess_id  TEXT UNIQUE,
  chesscom_id TEXT UNIQUE,
  created_at  TIMESTAMP
)

-- Parties fetchées
Game (
  id           UUID PRIMARY KEY,
  player_id    UUID REFERENCES Player,
  pgn          TEXT,
  source       TEXT,        -- 'lichess' | 'chesscom'
  analyzed     BOOLEAN DEFAULT FALSE,
  analyzed_at  TIMESTAMP
)

-- Erreurs détectées dans les parties
Mistake (
  id          UUID PRIMARY KEY,
  game_id     UUID REFERENCES Game,
  move_number INTEGER,
  fen         TEXT,         -- position au moment de l'erreur
  played_move TEXT,
  best_move   TEXT,
  type        TEXT,         -- MistakeType
  theme       TEXT,         -- TacticalTheme si applicable
  eval_loss   INTEGER       -- centipawns
)

-- Exercices générés
Exercise (
  id          UUID PRIMARY KEY,
  mistake_id  UUID REFERENCES Mistake,
  type        TEXT,
  fen_start   TEXT,
  solution    JSONB,        -- move tree pour les puzzles/drills
  completed   BOOLEAN DEFAULT FALSE,
  attempts    INTEGER DEFAULT 0,
  solved_at   TIMESTAMP
)

-- Profil de faiblesses calculé
WeaknessProfile (
  player_id       UUID PRIMARY KEY REFERENCES Player,
  tactical_score  FLOAT,    -- 0-100, plus haut = meilleur
  endgame_score   FLOAT,
  opening_score   FLOAT,
  positional_score FLOAT,
  updated_at      TIMESTAMP
)
```

Le `WeaknessProfile` se recalcule après chaque batch d'analyse et drive la priorité des exercices présentés : si le score tactique est faible, les puzzles passent en premier.

---

## Ordre de développement (MVP)

L'objectif est d'avoir un pipeline bout en bout fonctionnel avant de travailler sur l'UX ou les features secondaires.

**Phase 1 — Infrastructure**
- Setup monorepo pnpm + Vite + Fastify
- PostgreSQL + Prisma schema
- Redis + BullMQ configuré

**Phase 2 — Auth et fetch des données**
- OAuth Lichess fonctionnel
- Fetch + stockage des parties en DB
- Connexion Chess.com par username

**Phase 3 — Pipeline d'analyse**
- Wrapper Stockfish binaire
- Parser PGN + extraction des evals existants (Lichess)
- Classifier d'erreurs basique (juste blunder/mistake/inaccuracy d'abord)
- Job BullMQ qui analyse une partie de bout en bout

**Phase 4 — Premier exercice fonctionnel**
- Génération de puzzle depuis position d'erreur (TACTICAL_MISS uniquement)
- Échiquier interactif qui valide la solution
- Notification WebSocket quand l'analyse est prête

**Phase 5 — Autres types d'exercices**
- Drill d'ouverture
- Finale contre Stockfish affaibli
- Analyse guidée pour les blunders positionnels

**Phase 6 — Dashboard et tracking**
- WeaknessProfile calculé et affiché
- Historique d'exercices et progression dans le temps
- Statistiques par type d'erreur et ouverture

---

## Notes importantes

**Stockfish WASM vs binaire**

Stockfish WASM peut tourner côté client dans un Web Worker pour de l'analyse interactive légère (hints, exploration de variantes). Mais pour la génération des exercices, le binaire côté serveur est obligatoire : plus puissant, pas de contraintes de mémoire navigateur, et l'analyse tourne en background sans bloquer l'UI. Les deux peuvent coexister.

```typescript
// Web Worker pour Stockfish WASM
// apps/web/src/workers/stockfish.worker.ts
import StockfishWasm from 'stockfish.wasm'

const sf = await StockfishWasm()
sf.addMessageListener((msg: string) => postMessage(msg))
onmessage = (e) => sf.postMessage(e.data)
```

**Lichess evals gratuits**

Les parties Lichess avec analyse activée contiennent déjà les evals Stockfish dans le PGN (champ `[%eval ...]`). Pour ces parties, on parse directement les evals existants sans relancer Stockfish — ce qui économise du compute et accélère l'analyse.

**Rate limiting**

L'API Lichess autorise 50 requêtes par seconde avec token, moins sans. L'API Chess.com est moins généreuse. Implémenter un rate limiter côté service client pour ne pas se faire bloquer.

**VPS obligatoire**

Vercel, Netlify et les plateformes serverless ne permettent pas d'installer des binaires arbitraires. Il faut un VPS classique. Fly.io est un bon compromis (déploiement Docker simple, pricing raisonnable, support des binaires).

---

## Variables d'environnement

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/chesstrainer

# Redis
REDIS_URL=redis://localhost:6379

# Lichess OAuth
LICHESS_CLIENT_ID=
LICHESS_CLIENT_SECRET=
LICHESS_CALLBACK_URL=http://localhost:3000/auth/lichess/callback

# Stockfish
STOCKFISH_PATH=/usr/bin/stockfish
STOCKFISH_POOL_SIZE=4          # nombre de processus Stockfish en parallèle
STOCKFISH_DEFAULT_DEPTH=20

# App
PORT=3001
FRONTEND_URL=http://localhost:5173
JWT_SECRET=
```