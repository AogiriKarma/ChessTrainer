import { useState, useCallback, useMemo } from 'react'
import { Chessboard } from 'react-chessboard'
import { Chess } from 'chess.js'

interface PuzzleBoardProps {
  fen: string
  solution: string[] // moves in UCI format (e.g. "e2e4")
  onSolved: () => void
  onFailed: () => void
}

type Status = 'playing' | 'correct' | 'wrong'

export default function PuzzleBoard({ fen, solution, onSolved, onFailed }: PuzzleBoardProps) {
  const [game, setGame] = useState(() => new Chess(fen))
  const [moveIndex, setMoveIndex] = useState(0)
  const [status, setStatus] = useState<Status>('playing')
  const [highlightSquares, setHighlightSquares] = useState<Record<string, React.CSSProperties>>({})

  // Le joueur joue les coups pairs (0, 2, 4...), l'adversaire les impairs
  const isPlayerTurn = moveIndex % 2 === 0
  const orientation = useMemo(() => {
    const chess = new Chess(fen)
    return chess.turn() === 'w' ? 'white' : 'black'
  }, [fen])

  const highlightMove = useCallback((from: string, to: string, color: string) => {
    setHighlightSquares({
      [from]: { backgroundColor: color },
      [to]: { backgroundColor: color },
    })
  }, [])

  const playOpponentMove = useCallback((currentGame: Chess, currentIndex: number) => {
    const opponentMove = solution[currentIndex]
    if (!opponentMove) return

    setTimeout(() => {
      const from = opponentMove.slice(0, 2)
      const to = opponentMove.slice(2, 4)
      const promotion = opponentMove[4] as 'q' | 'r' | 'b' | 'n' | undefined

      const newGame = new Chess(currentGame.fen())
      newGame.move({ from, to, promotion: promotion || undefined })

      highlightMove(from, to, 'rgba(255, 170, 0, 0.4)')
      setGame(newGame)
      setMoveIndex(currentIndex + 1)
    }, 400)
  }, [solution, highlightMove])

  const onDrop = useCallback(
    (sourceSquare: string, targetSquare: string, piece: string) => {
      if (status !== 'playing' || !isPlayerTurn) return false

      const expectedMove = solution[moveIndex]
      if (!expectedMove) return false

      const expectedFrom = expectedMove.slice(0, 2)
      const expectedTo = expectedMove.slice(2, 4)
      const expectedPromotion = expectedMove[4]

      // Vérifier si le coup joué correspond
      const isCorrect =
        sourceSquare === expectedFrom &&
        targetSquare === expectedTo &&
        (!expectedPromotion || piece.charAt(1).toLowerCase() === expectedPromotion)

      if (!isCorrect) {
        setStatus('wrong')
        highlightMove(sourceSquare, targetSquare, 'rgba(220, 38, 38, 0.5)')

        // Montrer le bon coup
        setTimeout(() => {
          highlightMove(expectedFrom, expectedTo, 'rgba(34, 197, 94, 0.5)')
        }, 800)

        onFailed()
        return false
      }

      // Coup correct
      const newGame = new Chess(game.fen())
      const promotion = expectedPromotion as 'q' | 'r' | 'b' | 'n' | undefined
      const moveResult = newGame.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: promotion || undefined,
      })

      if (!moveResult) return false

      highlightMove(sourceSquare, targetSquare, 'rgba(34, 197, 94, 0.4)')
      setGame(newGame)

      const nextIndex = moveIndex + 1

      // Vérifier si le puzzle est fini
      if (nextIndex >= solution.length) {
        setStatus('correct')
        setMoveIndex(nextIndex)
        onSolved()
        return true
      }

      setMoveIndex(nextIndex)

      // Jouer le coup de l'adversaire
      playOpponentMove(newGame, nextIndex)

      return true
    },
    [game, moveIndex, status, isPlayerTurn, solution, onSolved, onFailed, highlightMove, playOpponentMove],
  )

  const reset = () => {
    setGame(new Chess(fen))
    setMoveIndex(0)
    setStatus('playing')
    setHighlightSquares({})
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative">
        <Chessboard
          id="puzzle-board"
          position={game.fen()}
          onPieceDrop={onDrop}
          boardOrientation={orientation as 'white' | 'black'}
          boardWidth={480}
          customSquareStyles={highlightSquares}
          animationDuration={200}
          arePiecesDraggable={status === 'playing' && isPlayerTurn}
        />

        {status !== 'playing' && (
          <div
            className={`absolute inset-0 flex items-center justify-center bg-black/40 rounded ${
              status === 'correct' ? 'text-green-400' : 'text-red-400'
            }`}
          >
            <div className="text-center">
              <p className="text-3xl font-bold">
                {status === 'correct' ? 'Correct !' : 'Raté'}
              </p>
              <button
                onClick={reset}
                className="mt-4 bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg transition"
              >
                Réessayer
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="text-sm text-gray-400">
        {status === 'playing' && isPlayerTurn && 'À toi de jouer — trouve le meilleur coup'}
        {status === 'playing' && !isPlayerTurn && 'Réponse adverse...'}
      </div>
    </div>
  )
}
