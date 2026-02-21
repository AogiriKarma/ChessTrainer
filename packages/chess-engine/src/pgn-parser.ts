import { Chess } from 'chess.js'

export interface ParsedMove {
  moveNumber: number
  color: 'w' | 'b'
  san: string
  fen: string
  fenBefore: string
  eval?: number // centipawns
}

export interface ParsedGame {
  headers: Record<string, string | null>
  moves: ParsedMove[]
  hasEvals: boolean
}

/**
 * Parse un PGN et retourne la liste des coups avec les FEN et evals (si présents).
 * Gère les evals Lichess [%eval X.XX] et les mats [%eval #N].
 */
export function parsePGN(pgn: string): ParsedGame {
  const chess = new Chess()
  chess.loadPgn(pgn)

  const headers = chess.header()
  const history = chess.history({ verbose: true })

  // Extraire les evals du PGN brut avant de rejouer
  const evals = extractEvals(pgn)

  // Replay pour extraire les FEN à chaque coup
  const game = new Chess()
  const moves: ParsedMove[] = []

  for (let i = 0; i < history.length; i++) {
    const move = history[i]
    const fenBefore = game.fen()
    game.move(move.san)

    moves.push({
      moveNumber: Math.floor(i / 2) + 1,
      color: move.color,
      san: move.san,
      fen: game.fen(),
      fenBefore,
      eval: evals[i],
    })
  }

  const hasEvals = evals.length > 0 && evals.some((e) => e !== undefined)

  return { headers, moves, hasEvals }
}

/**
 * Extraire les évaluations Lichess depuis le texte PGN.
 * Supporte [%eval 1.23], [%eval -0.5], [%eval #3], [%eval #-2]
 */
function extractEvals(pgn: string): (number | undefined)[] {
  const evals: (number | undefined)[] = []

  // Match les commentaires contenant des evals
  const commentRegex = /\{[^}]*\[%eval ([^\]]+)\][^}]*\}/g
  let match

  while ((match = commentRegex.exec(pgn)) !== null) {
    const evalStr = match[1].trim()

    if (evalStr.startsWith('#')) {
      // Mat: #3 = +10000, #-3 = -10000
      const mateIn = parseInt(evalStr.slice(1))
      evals.push(mateIn > 0 ? 10000 - mateIn : -10000 - mateIn)
    } else {
      // Eval normal en pawns -> convertir en centipawns
      evals.push(Math.round(parseFloat(evalStr) * 100))
    }
  }

  return evals
}
