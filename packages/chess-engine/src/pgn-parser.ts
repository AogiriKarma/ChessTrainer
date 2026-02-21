import { Chess } from 'chess.js'

export interface ParsedMove {
  moveNumber: number
  color: 'w' | 'b'
  san: string
  fen: string
  eval?: number
}

export interface ParsedGame {
  headers: Record<string, string>
  moves: ParsedMove[]
}

/**
 * Parse un PGN et retourne la liste des coups avec les FEN et evals (si présents).
 */
export function parsePGN(pgn: string): ParsedGame {
  const chess = new Chess()
  chess.loadPgn(pgn)

  const headers = chess.header()
  const history = chess.history({ verbose: true })

  // Replay pour extraire les FEN à chaque coup
  const game = new Chess()
  const moves: ParsedMove[] = []

  for (const move of history) {
    game.move(move.san)
    moves.push({
      moveNumber: Math.ceil(moves.length / 2) + (moves.length % 2 === 0 ? 1 : 0),
      color: move.color,
      san: move.san,
      fen: game.fen(),
    })
  }

  // Extraire les evals Lichess si présents dans les commentaires du PGN
  const evalRegex = /\[%eval ([+-]?\d+\.?\d*)\]/g
  let match
  let evalIndex = 0
  while ((match = evalRegex.exec(pgn)) !== null && evalIndex < moves.length) {
    moves[evalIndex].eval = parseFloat(match[1]) * 100 // convertir en centipawns
    evalIndex++
  }

  return { headers, moves }
}
