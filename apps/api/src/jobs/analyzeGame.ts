import { Job } from 'bullmq'
import { prisma } from '../lib/prisma.js'
import { analyzePosition } from '../services/stockfish.js'
import { parsePGN } from '@chesstrainer/chess-engine'
import { classifyMistake } from '@chesstrainer/chess-engine'
import { generateExerciseQueue } from '../lib/queues.js'

export interface AnalyzeGamePayload {
  gameId: string
  pgn: string
}

// Seuil minimum de perte en centipawns pour considérer un coup comme erreur
const INACCURACY_THRESHOLD = 50

export async function analyzeGameProcessor(job: Job<AnalyzeGamePayload>) {
  const { gameId, pgn } = job.data

  await job.log(`Parsing PGN for game ${gameId}`)
  const parsed = parsePGN(pgn)

  if (parsed.moves.length === 0) {
    await job.log('No moves found in PGN, skipping')
    await markAnalyzed(gameId)
    return { gameId, mistakes: 0 }
  }

  await job.log(`${parsed.moves.length} moves, hasEvals: ${parsed.hasEvals}`)

  // Obtenir les evals pour chaque position
  // Si les evals Lichess sont dispo, on les utilise. Sinon, Stockfish.
  const evals: number[] = []

  if (parsed.hasEvals) {
    await job.log('Using Lichess evals')
    for (const move of parsed.moves) {
      evals.push(move.eval ?? 0)
    }
  } else {
    await job.log('Running Stockfish analysis on each position')
    // Analyser la position initiale
    const startResult = await analyzePosition(parsed.moves[0].fenBefore, 18)
    evals.push(startResult.eval)

    // Analyser chaque position après coup
    for (let i = 0; i < parsed.moves.length; i++) {
      const result = await analyzePosition(parsed.moves[i].fen, 18)
      // Inverser l'eval pour le joueur qui vient de jouer (Stockfish donne toujours du point de vue du joueur au trait)
      evals.push(result.eval)

      if (i % 10 === 0) {
        await job.updateProgress(Math.round((i / parsed.moves.length) * 100))
      }
    }
  }

  // Détecter les erreurs
  let mistakeCount = 0

  for (let i = 0; i < parsed.moves.length; i++) {
    const move = parsed.moves[i]

    // Eval avant et après le coup (du point de vue du joueur qui joue)
    let evalBefore: number
    let evalAfter: number

    if (parsed.hasEvals) {
      // Les evals Lichess sont du point de vue blanc
      // On veut la perte du point de vue du joueur qui joue
      if (i === 0) {
        evalBefore = move.color === 'w' ? 0 : 0 // position de départ ~ 0
        evalAfter = move.color === 'w' ? evals[i] : -evals[i]
      } else {
        evalBefore = move.color === 'w' ? evals[i - 1] : -evals[i - 1]
        evalAfter = move.color === 'w' ? evals[i] : -evals[i]
      }
    } else {
      // Les evals Stockfish dans notre array: index 0 = avant coup 0, index 1 = après coup 0, etc.
      const rawBefore = evals[i]
      const rawAfter = evals[i + 1]
      evalBefore = move.color === 'w' ? rawBefore : -rawBefore
      evalAfter = move.color === 'w' ? rawAfter : -rawAfter
    }

    const loss = evalBefore - evalAfter

    if (loss < INACCURACY_THRESHOLD) continue

    // C'est une erreur — classifier et stocker
    const bestResult = await analyzePosition(move.fenBefore, 20)
    const classification = classifyMistake(
      move.fenBefore,
      move.san,
      bestResult.bestMove,
      evalBefore,
      evalAfter,
    )

    const mistake = await prisma.mistake.create({
      data: {
        gameId,
        moveNumber: move.moveNumber,
        fen: move.fenBefore,
        playedMove: move.san,
        bestMove: bestResult.bestMove,
        type: classification.type,
        theme: classification.theme ?? null,
        evalLoss: classification.evalLoss,
      },
    })

    // Enqueue exercise generation
    await generateExerciseQueue.add('generate', {
      mistakeId: mistake.id,
      type: classification.type,
      fen: move.fenBefore,
      bestMove: bestResult.bestMove,
    })

    mistakeCount++
  }

  await markAnalyzed(gameId)
  await job.log(`Analysis complete: ${mistakeCount} mistakes found`)

  return { gameId, mistakes: mistakeCount }
}

async function markAnalyzed(gameId: string) {
  await prisma.game.update({
    where: { id: gameId },
    data: { analyzed: true, analyzedAt: new Date() },
  })
}
