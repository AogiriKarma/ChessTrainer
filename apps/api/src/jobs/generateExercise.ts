import { Job } from 'bullmq'
import { prisma } from '../lib/prisma.js'
import { analyzePosition } from '../services/stockfish.js'
import type { ExerciseType } from '@chesstrainer/types'

export interface GenerateExercisePayload {
  mistakeId: string
  type: string
  fen: string
  bestMove: string
}

export async function generateExerciseProcessor(job: Job<GenerateExercisePayload>) {
  const { mistakeId, type, fen, bestMove } = job.data

  await job.log(`Generating exercise for mistake ${mistakeId} (type: ${type})`)

  const exerciseType = mapMistakeToExercise(type)
  const solution = await buildSolution(fen, bestMove, exerciseType)

  await prisma.exercise.create({
    data: {
      mistakeId,
      type: exerciseType,
      fenStart: fen,
      solution: solution as any,
    },
  })

  // Recalculate weakness profile
  await updateWeaknessProfile(mistakeId)

  await job.log(`Exercise created (type: ${exerciseType})`)
  return { mistakeId, exerciseType }
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

/**
 * Construit la solution de l'exercice.
 * Pour les puzzles : principal variation de Stockfish (les N meilleurs coups à jouer).
 * Pour les drills : juste le coup correct.
 */
async function buildSolution(
  fen: string,
  bestMove: string,
  exerciseType: ExerciseType,
): Promise<Record<string, unknown>> {
  if (exerciseType === 'puzzle') {
    // Obtenir la principal variation complète
    const analysis = await analyzePosition(fen, 22)
    return {
      moves: analysis.pv.slice(0, 6), // 3 coups de chaque côté max
      bestMove,
      eval: analysis.eval,
    }
  }

  if (exerciseType === 'opening_drill') {
    return {
      correctMove: bestMove,
    }
  }

  if (exerciseType === 'endgame') {
    const analysis = await analyzePosition(fen, 24)
    return {
      bestMove,
      pv: analysis.pv,
      eval: analysis.eval,
    }
  }

  // guided_analysis
  const analysis = await analyzePosition(fen, 20)
  return {
    bestMove,
    eval: analysis.eval,
    explanation: `Le meilleur coup était ${bestMove} avec un avantage de ${(analysis.eval / 100).toFixed(1)} pawns.`,
  }
}

/**
 * Recalcule le WeaknessProfile du joueur après chaque exercice généré.
 */
async function updateWeaknessProfile(mistakeId: string) {
  const mistake = await prisma.mistake.findUnique({
    where: { id: mistakeId },
    include: { game: true },
  })

  if (!mistake) return

  const playerId = mistake.game.playerId

  // Compter les erreurs par type pour ce joueur
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

  // Score 0-100 : moins d'erreurs et moins de perte = meilleur score
  const scoreForType = (t: string) => {
    const count = countByType(t)
    const avgLoss = avgLossByType(t)
    const frequency = count / totalMistakes
    // Score inversé: beaucoup d'erreurs graves = score bas
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
