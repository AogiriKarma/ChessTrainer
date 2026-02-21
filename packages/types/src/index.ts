// === Player ===

export interface Player {
  id: string
  lichessId: string | null
  chesscomId: string | null
  createdAt: Date
}

// === Game ===

export type GameSource = 'lichess' | 'chesscom'

export interface Game {
  id: string
  playerId: string
  pgn: string
  source: GameSource
  analyzed: boolean
  analyzedAt: Date | null
}

// === Mistakes ===

export type MistakeType =
  | 'TACTICAL_MISS'
  | 'OPENING_DEVIATION'
  | 'ENDGAME_ERROR'
  | 'BLUNDER_POSITIONAL'
  | 'INACCURACY'

export type TacticalTheme =
  | 'fork'
  | 'pin'
  | 'skewer'
  | 'back_rank'
  | 'discovery'
  | 'deflection'
  | 'decoy'
  | 'mate_in_n'
  | 'trapped_piece'

export type Severity = 'blunder' | 'mistake' | 'inaccuracy'

export interface Mistake {
  id: string
  gameId: string
  moveNumber: number
  fen: string
  playedMove: string
  bestMove: string
  type: MistakeType
  theme: TacticalTheme | null
  evalLoss: number
}

export interface MistakeClassification {
  type: MistakeType
  theme?: TacticalTheme
  evalLoss: number
  severity: Severity
}

// === Exercises ===

export type ExerciseType = 'puzzle' | 'opening_drill' | 'endgame' | 'guided_analysis'

export interface Exercise {
  id: string
  mistakeId: string
  type: ExerciseType
  fenStart: string
  solution: Record<string, unknown>
  completed: boolean
  attempts: number
  solvedAt: Date | null
}

// === Weakness Profile ===

export interface WeaknessProfile {
  playerId: string
  tacticalScore: number
  endgameScore: number
  openingScore: number
  positionalScore: number
  updatedAt: Date
}

// === Game Phase ===

export type GamePhase = 'opening' | 'middlegame' | 'endgame'

// === Analysis ===

export interface AnalysisResult {
  bestMove: string
  eval: number
  depth: number
  pv: string[]
}

export interface MultiPVResult {
  rank: number
  bestMove: string
  eval: number
  depth: number
  pv: string[]
  mate?: number
}

// === Exercise Solution v2 ===

export type MoveQuality = 'best' | 'good' | 'acceptable'

export interface AcceptableMove {
  uci: string
  san: string
  eval: number
  rank: number
  quality: MoveQuality
}

export interface ExerciseStep {
  role: 'player' | 'opponent'
  bestMove: AcceptableMove
  alternatives: AcceptableMove[]
  fen: string
}

export interface ExerciseExplanation {
  mistakeSummary: string
  bestMoveReason: string
  playedMoveWeakness: string
  tip: string
  theme?: TacticalTheme
  themeLabel?: string
  evalContext: string
}

export interface ExerciseSolution {
  version: 2
  steps: ExerciseStep[]
  explanation: ExerciseExplanation
  evalBefore: number
  evalAfter: number
  playedMove: string
  acceptanceThreshold: number
}
