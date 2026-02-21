import type { MistakeClassification, TacticalTheme } from '@chesstrainer/types'
import { detectGamePhase } from './phase-detector.js'

/**
 * Classifie une erreur en fonction de la perte d'évaluation,
 * de la phase de jeu, et du thème tactique détecté.
 */
export function classifyMistake(
  fen: string,
  _playedMove: string,
  _bestMove: string,
  evalBefore: number,
  evalAfter: number,
): MistakeClassification {
  const evalLoss = Math.abs(evalBefore - evalAfter)
  const phase = detectGamePhase(fen)
  const tacticalTheme = detectTacticalTheme()

  const severity =
    evalLoss >= 200 ? 'blunder' as const :
    evalLoss >= 80  ? 'mistake' as const :
                      'inaccuracy' as const

  if (evalLoss >= 200) {
    if (tacticalTheme) return { type: 'TACTICAL_MISS', theme: tacticalTheme, evalLoss, severity }
    if (phase === 'endgame') return { type: 'ENDGAME_ERROR', evalLoss, severity }
    return { type: 'BLUNDER_POSITIONAL', evalLoss, severity }
  }

  if (phase === 'opening') return { type: 'OPENING_DEVIATION', evalLoss, severity }

  return { type: 'INACCURACY', evalLoss, severity }
}

/**
 * Détecte le thème tactique dans le meilleur coup.
 * TODO: implémenter la détection réelle (fork, pin, skewer, etc.)
 */
function detectTacticalTheme(): TacticalTheme | undefined {
  // TODO: analyser la position résultante après la meilleure séquence
  // pour détecter fourchettes, clouages, etc.
  return undefined
}
