import { Chess } from 'chess.js'
import type { GamePhase } from '@chesstrainer/types'

/**
 * Détecte la phase de jeu à partir d'une position FEN.
 * Heuristique basée sur le matériel restant et le numéro de coup.
 */
export function detectGamePhase(fen: string): GamePhase {
  const chess = new Chess(fen)
  const board = chess.board()

  let totalMaterial = 0
  let queenCount = 0

  for (const row of board) {
    for (const square of row) {
      if (!square) continue
      switch (square.type) {
        case 'q': queenCount++; totalMaterial += 9; break
        case 'r': totalMaterial += 5; break
        case 'b': totalMaterial += 3; break
        case 'n': totalMaterial += 3; break
        case 'p': totalMaterial += 1; break
      }
    }
  }

  const moveNumber = chess.moveNumber()

  if (moveNumber <= 12) return 'opening'
  if (totalMaterial <= 16 || (queenCount === 0 && totalMaterial <= 24)) return 'endgame'
  return 'middlegame'
}
