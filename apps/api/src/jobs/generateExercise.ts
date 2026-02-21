import { Job } from 'bullmq'
import { Chess } from 'chess.js'
import { prisma } from '../lib/prisma.js'
import { analyzePositionMultiPV } from '../services/stockfish.js'
import { generateExplanation } from '../services/openrouter.js'
import { detectGamePhase } from '@chesstrainer/chess-engine'
import type {
  ExerciseSolution,
  ExerciseStep,
  AcceptableMove,
  MoveQuality,
  ExerciseType,
  MistakeType,
  TacticalTheme,
} from '@chesstrainer/types'

export interface GenerateExercisePayload {
  mistakeId: string
  type: string
  fen: string
  bestMove: string
  playedMove: string
  evalBefore: number
  evalAfter: number
  theme?: string
  bestMovePV: string[]
}

const GOOD_THRESHOLD = 30       // cp de différence avec le best
const ACCEPTABLE_THRESHOLD = 80 // cp de différence avec le best

export async function generateExerciseProcessor(job: Job<GenerateExercisePayload>) {
  const { mistakeId, type, fen, bestMove, playedMove, evalBefore, evalAfter, theme, bestMovePV } = job.data

  await job.log(`Generating v2 exercise for mistake ${mistakeId} (type: ${type})`)

  const exerciseType = mapMistakeToExercise(type)
  const evalLoss = Math.abs(evalBefore - evalAfter)

  // Déterminer le nombre de coups joueur selon la sévérité
  const playerMoveCount =
    evalLoss >= 500 ? 4 :
    evalLoss >= 200 ? 3 :
    evalLoss >= 100 ? 2 : 1

  // Construire les steps avec MultiPV
  const steps = await buildSteps(fen, bestMovePV, playerMoveCount)

  // Convertir le bestMove UCI en SAN pour l'explication
  const chess = new Chess(fen)
  let bestMoveSAN = bestMove
  try {
    const m = chess.move({ from: bestMove.slice(0, 2), to: bestMove.slice(2, 4), promotion: bestMove[4] as any })
    if (m) bestMoveSAN = m.san
  } catch { /* keep UCI */ }

  // Détecter les menaces dans la position
  const threats = detectThreats(fen)

  // Générer l'explication via OpenRouter (avec fallback)
  const phase = detectGamePhase(fen)
  const explanation = await generateExplanation({
    fen,
    playedMoveSAN: playedMove,
    bestMoveSAN,
    principalVariation: bestMovePV.slice(0, 6),
    evalBefore,
    evalAfter,
    mistakeType: type as MistakeType,
    theme: (theme as TacticalTheme) ?? null,
    phase,
    threats,
  })

  const solution: ExerciseSolution = {
    version: 2,
    steps,
    explanation,
    evalBefore,
    evalAfter,
    playedMove,
    acceptanceThreshold: ACCEPTABLE_THRESHOLD,
  }

  await prisma.exercise.create({
    data: {
      mistakeId,
      type: exerciseType,
      fenStart: fen,
      solution: solution as any,
    },
  })

  await updateWeaknessProfile(mistakeId)
  await job.log(`V2 exercise created: ${steps.length} steps, type=${exerciseType}`)

  return { mistakeId, exerciseType, steps: steps.length }
}

async function buildSteps(
  startFen: string,
  mainPV: string[],
  maxPlayerMoves: number,
): Promise<ExerciseStep[]> {
  const steps: ExerciseStep[] = []
  let currentFen = startFen
  let pvIndex = 0
  let playerMoves = 0

  while (pvIndex < mainPV.length && playerMoves < maxPlayerMoves) {
    // Step joueur : analyser avec MultiPV pour trouver les alternatives
    const multiPV = await analyzePositionMultiPV(currentFen, 20, 5)
    const chess = new Chess(currentFen)

    if (multiPV.length === 0) break

    const bestEval = multiPV[0].eval
    const alternatives: AcceptableMove[] = []

    // Le meilleur coup
    const bestUCI = multiPV[0].bestMove
    const bestSAN = uciToSan(chess, bestUCI)

    const bestAcceptable: AcceptableMove = {
      uci: bestUCI,
      san: bestSAN,
      eval: bestEval,
      rank: 1,
      quality: 'best',
    }

    // Alternatives acceptables
    for (let i = 1; i < multiPV.length; i++) {
      const pv = multiPV[i]
      const delta = Math.abs(bestEval - pv.eval)

      let quality: MoveQuality
      if (delta <= GOOD_THRESHOLD) quality = 'good'
      else if (delta <= ACCEPTABLE_THRESHOLD) quality = 'acceptable'
      else continue // trop mauvais

      alternatives.push({
        uci: pv.bestMove,
        san: uciToSan(chess, pv.bestMove),
        eval: pv.eval,
        rank: i + 1,
        quality,
      })
    }

    steps.push({
      role: 'player',
      bestMove: bestAcceptable,
      alternatives,
      fen: currentFen,
    })

    playerMoves++

    // Avancer le board avec le best move
    try {
      chess.move({ from: bestUCI.slice(0, 2), to: bestUCI.slice(2, 4), promotion: bestUCI[4] as any })
    } catch {
      break
    }

    currentFen = chess.fen()
    pvIndex++

    // Step adversaire (si il y a un coup suivant dans la PV)
    if (pvIndex < mainPV.length && playerMoves < maxPlayerMoves) {
      const opponentUCI = mainPV[pvIndex]
      const oppChess = new Chess(currentFen)
      const opponentSAN = uciToSan(oppChess, opponentUCI)

      steps.push({
        role: 'opponent',
        bestMove: {
          uci: opponentUCI,
          san: opponentSAN,
          eval: 0,
          rank: 1,
          quality: 'best',
        },
        alternatives: [],
        fen: currentFen,
      })

      try {
        oppChess.move({ from: opponentUCI.slice(0, 2), to: opponentUCI.slice(2, 4), promotion: opponentUCI[4] as any })
      } catch {
        break
      }

      currentFen = oppChess.fen()
      pvIndex++
    }
  }

  return steps
}

function uciToSan(chess: Chess, uci: string): string {
  try {
    const clone = new Chess(chess.fen())
    const m = clone.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] as any })
    return m ? m.san : uci
  } catch {
    return uci
  }
}

/**
 * Détecte les menaces dans la position pour enrichir le prompt LLM.
 */
function detectThreats(fen: string): string[] {
  const chess = new Chess(fen)
  const threats: string[] = []
  const turn = chess.turn()
  const board = chess.board()

  // Pièces en prise
  for (const row of board) {
    for (const sq of row) {
      if (!sq) continue
      if (sq.color === turn) continue // on regarde les pièces adverses qu'on menace

      const attackers = chess.moves({ verbose: true }).filter((m) => m.to === sq.square && m.flags.includes('c'))
      if (attackers.length > 0 && sq.type !== 'p') {
        threats.push(`${sq.type.toUpperCase()} en ${sq.square} est en prise`)
      }
    }
  }

  // Échecs possibles
  const checks = chess.moves({ verbose: true }).filter((m) => {
    const clone = new Chess(chess.fen())
    clone.move(m)
    return clone.isCheck()
  })
  if (checks.length > 0) {
    threats.push(`${checks.length} échec(s) possible(s)`)
  }

  return threats.slice(0, 5) // limiter à 5 menaces
}

function mapMistakeToExercise(mistakeType: string): ExerciseType {
  switch (mistakeType) {
    case 'TACTICAL_MISS': return 'puzzle'
    case 'OPENING_DEVIATION': return 'opening_drill'
    case 'ENDGAME_ERROR': return 'endgame'
    case 'BLUNDER_POSITIONAL': return 'guided_analysis'
    case 'INACCURACY': return 'puzzle'
    default: return 'puzzle'
  }
}

async function updateWeaknessProfile(mistakeId: string) {
  const mistake = await prisma.mistake.findUnique({
    where: { id: mistakeId },
    include: { game: true },
  })

  if (!mistake) return
  const playerId = mistake.game.playerId

  const mistakes = await prisma.mistake.findMany({
    where: { game: { playerId } },
    select: { type: true, evalLoss: true },
  })

  const totalMistakes = mistakes.length
  if (totalMistakes === 0) return

  const countByType = (t: string) => mistakes.filter((m) => m.type === t).length
  const avgLossByType = (t: string) => {
    const filtered = mistakes.filter((m) => m.type === t)
    if (filtered.length === 0) return 0
    return filtered.reduce((sum, m) => sum + m.evalLoss, 0) / filtered.length
  }

  const scoreForType = (t: string) => {
    const count = countByType(t)
    const avgLoss = avgLossByType(t)
    const frequency = count / totalMistakes
    return Math.max(0, Math.min(100, 100 - (frequency * 50 + avgLoss / 10)))
  }

  await prisma.weaknessProfile.upsert({
    where: { playerId },
    update: {
      tacticalScore: scoreForType('TACTICAL_MISS'),
      endgameScore: scoreForType('ENDGAME_ERROR'),
      openingScore: scoreForType('OPENING_DEVIATION'),
      positionalScore: scoreForType('BLUNDER_POSITIONAL'),
    },
    create: {
      playerId,
      tacticalScore: scoreForType('TACTICAL_MISS'),
      endgameScore: scoreForType('ENDGAME_ERROR'),
      openingScore: scoreForType('OPENING_DEVIATION'),
      positionalScore: scoreForType('BLUNDER_POSITIONAL'),
    },
  })
}
