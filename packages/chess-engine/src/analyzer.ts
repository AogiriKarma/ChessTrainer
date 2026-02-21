import { Chess, type Square, type PieceSymbol, type Color } from 'chess.js'
import type { MistakeClassification, TacticalTheme } from '@chesstrainer/types'
import { detectGamePhase } from './phase-detector.js'

const PIECE_VALUES: Record<PieceSymbol, number> = {
  p: 1, n: 3, b: 3, r: 5, q: 9, k: 0,
}

/**
 * Classifie une erreur en fonction de la perte d'évaluation,
 * de la phase de jeu, et du thème tactique détecté.
 */
export function classifyMistake(
  fen: string,
  playedMove: string,
  bestMove: string,
  evalBefore: number,
  evalAfter: number,
  bestMovePV?: string[],
  mate?: number,
): MistakeClassification {
  const evalLoss = Math.abs(evalBefore - evalAfter)
  const phase = detectGamePhase(fen)
  const tacticalTheme = detectTacticalTheme(fen, bestMovePV || [], mate)

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
 * Détecte le thème tactique en analysant la position résultante
 * après le meilleur coup et sa continuation.
 */
export function detectTacticalTheme(
  fen: string,
  bestMovePV: string[],
  mate?: number,
): TacticalTheme | undefined {
  if (!bestMovePV.length) return undefined

  // Mat en N
  if (mate !== undefined && mate > 0 && mate <= 5) {
    return 'mate_in_n'
  }

  const chess = new Chess(fen)
  const turn = chess.turn()

  // Jouer le meilleur coup
  const bestUCI = bestMovePV[0]
  const from = bestUCI.slice(0, 2) as Square
  const to = bestUCI.slice(2, 4) as Square
  const promotion = bestUCI[4] as 'q' | 'r' | 'b' | 'n' | undefined

  try {
    chess.move({ from, to, promotion })
  } catch {
    return undefined
  }

  // Vérifier back rank mate
  const backRank = detectBackRank(chess, turn)
  if (backRank) return 'back_rank'

  // Vérifier fourchette
  const fork = detectFork(chess, turn, to)
  if (fork) return 'fork'

  // Vérifier clouage
  const pin = detectPin(chess, turn)
  if (pin) return 'pin'

  // Vérifier pièce piégée (après la réponse adverse)
  if (bestMovePV.length >= 2) {
    try {
      const respFrom = bestMovePV[1].slice(0, 2) as Square
      const respTo = bestMovePV[1].slice(2, 4) as Square
      const respPromo = bestMovePV[1][4] as 'q' | 'r' | 'b' | 'n' | undefined
      chess.move({ from: respFrom, to: respTo, promotion: respPromo })

      const trapped = detectTrappedPiece(chess, turn)
      if (trapped) return 'trapped_piece'
    } catch {
      // ignore
    }
  }

  return undefined
}

/**
 * Détecte si le coup donne un mat sur la dernière rangée.
 */
function detectBackRank(chess: Chess, attackerColor: Color): boolean {
  if (!chess.isCheck()) return false

  const opponentColor = attackerColor === 'w' ? 'b' : 'w'
  const backRankRow = opponentColor === 'w' ? '1' : '8'

  // Trouver le roi adverse
  const board = chess.board()
  for (const row of board) {
    for (const sq of row) {
      if (sq && sq.type === 'k' && sq.color === opponentColor) {
        const kingSquare = sq.square
        if (kingSquare[1] === backRankRow) {
          // Vérifier que les cases d'échappée sur la rangée du dessus sont bloquées
          const escapeRank = opponentColor === 'w' ? '2' : '7'
          const file = kingSquare[0]
          const files = [
            String.fromCharCode(file.charCodeAt(0) - 1),
            file,
            String.fromCharCode(file.charCodeAt(0) + 1),
          ].filter((f) => f >= 'a' && f <= 'h')

          let blocked = true
          for (const f of files) {
            const sq2 = `${f}${escapeRank}` as Square
            const piece = chess.get(sq2)
            // La case est bloquée si occupée par une pièce amie
            if (!piece || piece.color !== opponentColor) {
              blocked = false
              break
            }
          }

          if (blocked) return true
        }
      }
    }
  }
  return false
}

/**
 * Détecte si la pièce déplacée attaque 2+ pièces adverses de valeur.
 */
function detectFork(chess: Chess, attackerColor: Color, movedTo: Square): boolean {
  const piece = chess.get(movedTo)
  if (!piece || piece.color !== attackerColor) return false

  // Ne compter les fourchettes que pour les pièces légères et les pions
  // (les dames "forkent" tout le temps, c'est pas un thème)
  if (piece.type === 'q') return false

  const board = chess.board()
  const opponentColor = attackerColor === 'w' ? 'b' : 'w'
  let attackedHighValue = 0

  for (const row of board) {
    for (const sq of row) {
      if (!sq || sq.color !== opponentColor) continue
      if (PIECE_VALUES[sq.type] < 3 && sq.type !== 'k') continue

      // Vérifier si la pièce déplacée attaque cette case
      if (isAttacking(chess, movedTo, sq.square)) {
        attackedHighValue++
      }
    }
  }

  return attackedHighValue >= 2
}

/**
 * Vérifie si une pièce sur `from` attaque la case `to`.
 * Utilise une approche simple : tester si un move de from vers to
 * serait pseudo-légal (capture).
 */
function isAttacking(chess: Chess, from: Square, to: Square): boolean {
  // Sauvegarder et tester
  const moves = chess.moves({ square: from, verbose: true })
  return moves.some((m) => m.to === to)
}

/**
 * Détecte si une pièce adverse est clouée (ne peut pas bouger sans exposer le roi/dame).
 */
function detectPin(chess: Chess, attackerColor: Color): boolean {
  const opponentColor = attackerColor === 'w' ? 'b' : 'w'
  const board = chess.board()

  for (const row of board) {
    for (const sq of row) {
      if (!sq || sq.color !== opponentColor) continue
      if (sq.type === 'k') continue

      // Vérifier si cette pièce a des coups légaux
      const moves = chess.moves({ square: sq.square, verbose: true })
      if (moves.length === 0 && !chess.isCheck()) {
        // Pièce sans coups légaux et pas en échec = potentiellement clouée
        // Vérifier que c'est pas juste coincée
        if (PIECE_VALUES[sq.type] >= 3) {
          return true
        }
      }
    }
  }

  return false
}

/**
 * Détecte si une pièce adverse de valeur est piégée (peu de cases de fuite).
 */
function detectTrappedPiece(chess: Chess, playerColor: Color): boolean {
  const opponentColor = playerColor === 'w' ? 'b' : 'w'
  const board = chess.board()

  for (const row of board) {
    for (const sq of row) {
      if (!sq || sq.color !== opponentColor) continue
      if (PIECE_VALUES[sq.type] < 3) continue
      if (sq.type === 'k') continue

      const moves = chess.moves({ square: sq.square, verbose: true })
      if (moves.length <= 1) {
        return true
      }
    }
  }
  return false
}
