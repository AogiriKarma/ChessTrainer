import { useState, useCallback, useMemo } from 'react'
import { Chessboard } from 'react-chessboard'
import { Chess } from 'chess.js'

interface AcceptableMove {
  uci: string
  san: string
  eval: number
  rank: number
  quality: 'best' | 'good' | 'acceptable'
}

interface ExerciseStep {
  role: 'player' | 'opponent'
  bestMove: AcceptableMove
  alternatives: AcceptableMove[]
  fen: string
}

interface ExerciseSolution {
  version: 2
  steps: ExerciseStep[]
  explanation: any
  evalBefore: number
  evalAfter: number
  playedMove: string
  acceptanceThreshold: number
}

interface StepFeedback {
  quality: 'best' | 'good' | 'acceptable' | 'wrong'
  message: string
}

interface PuzzleBoardProps {
  fen: string
  solution?: string[]
  richSolution?: ExerciseSolution
  onSolved: () => void
  onFailed: () => void
}

type Status = 'playing' | 'correct' | 'wrong'

const QUALITY_COLORS = {
  best: 'rgba(34, 197, 94, 0.5)',
  good: 'rgba(163, 230, 53, 0.5)',
  acceptable: 'rgba(250, 204, 21, 0.5)',
  wrong: 'rgba(220, 38, 38, 0.5)',
}

export default function PuzzleBoard({ fen, solution, richSolution, onSolved, onFailed }: PuzzleBoardProps) {
  const [game, setGame] = useState(() => new Chess(fen))
  const [stepIndex, setStepIndex] = useState(0)
  const [status, setStatus] = useState<Status>('playing')
  const [highlightSquares, setHighlightSquares] = useState<Record<string, React.CSSProperties>>({})
  const [feedback, setFeedback] = useState<StepFeedback | null>(null)

  const playerColor = useMemo(() => new Chess(fen).turn(), [fen])
  const orientation = playerColor === 'w' ? 'white' : 'black'

  // Compter les player steps pour savoir où on en est
  const isV2 = !!richSolution
  const totalSteps = isV2 ? richSolution!.steps.length : (solution?.length || 0)

  const currentPlayerStep = useMemo(() => {
    if (!isV2) return null
    // Trouver le prochain step 'player' à partir de stepIndex
    const steps = richSolution!.steps
    for (let i = stepIndex; i < steps.length; i++) {
      if (steps[i].role === 'player') return { step: steps[i], index: i }
    }
    return null
  }, [isV2, richSolution, stepIndex])

  // Legacy mode : coups pairs = joueur, impairs = adversaire
  const legacyIsPlayerTurn = stepIndex % 2 === 0

  const highlightMove = useCallback((from: string, to: string, color: string) => {
    setHighlightSquares({
      [from]: { backgroundColor: color },
      [to]: { backgroundColor: color },
    })
  }, [])

  const showFeedback = useCallback((fb: StepFeedback) => {
    setFeedback(fb)
    setTimeout(() => setFeedback(null), 2500)
  }, [])

  const playOpponentMoveV2 = useCallback((currentGame: Chess, fromStepIndex: number) => {
    const steps = richSolution!.steps
    // Trouver le prochain step opponent
    let opIdx = fromStepIndex
    if (opIdx >= steps.length || steps[opIdx].role !== 'opponent') return

    setTimeout(() => {
      const opMove = steps[opIdx].bestMove.uci
      const from = opMove.slice(0, 2)
      const to = opMove.slice(2, 4)
      const promotion = opMove[4] as any

      const newGame = new Chess(currentGame.fen())
      try {
        newGame.move({ from, to, promotion })
      } catch { return }

      highlightMove(from, to, 'rgba(255, 170, 0, 0.4)')
      setGame(newGame)
      setStepIndex(opIdx + 1)
    }, 400)
  }, [richSolution, highlightMove])

  const playOpponentMoveLegacy = useCallback((currentGame: Chess, moveIdx: number) => {
    if (!solution || moveIdx >= solution.length) return

    setTimeout(() => {
      const move = solution[moveIdx]
      const from = move.slice(0, 2)
      const to = move.slice(2, 4)
      const promotion = move[4] as any

      const newGame = new Chess(currentGame.fen())
      try {
        newGame.move({ from, to, promotion })
      } catch { return }

      highlightMove(from, to, 'rgba(255, 170, 0, 0.4)')
      setGame(newGame)
      setStepIndex(moveIdx + 1)
    }, 400)
  }, [solution, highlightMove])

  const onDrop = useCallback(
    (sourceSquare: string, targetSquare: string, piece: string) => {
      if (status !== 'playing') return false
      const userUCI = sourceSquare + targetSquare

      // === V2 mode ===
      if (isV2 && currentPlayerStep) {
        const { step, index } = currentPlayerStep
        const bestUCI = step.bestMove.uci

        // Check best move
        if (userUCI === bestUCI.slice(0, 4)) {
          const promotion = bestUCI[4] as any
          const newGame = new Chess(game.fen())
          try {
            newGame.move({ from: sourceSquare, to: targetSquare, promotion })
          } catch { return false }

          highlightMove(sourceSquare, targetSquare, QUALITY_COLORS.best)
          showFeedback({ quality: 'best', message: 'Meilleur coup !' })
          setGame(newGame)

          const nextIdx = index + 1
          if (nextIdx >= richSolution!.steps.length) {
            setStatus('correct')
            setStepIndex(nextIdx)
            onSolved()
            return true
          }

          setStepIndex(nextIdx)
          if (richSolution!.steps[nextIdx]?.role === 'opponent') {
            playOpponentMoveV2(newGame, nextIdx)
          }
          return true
        }

        // Check alternatives
        const alt = step.alternatives.find((a) => userUCI === a.uci.slice(0, 4))
        if (alt) {
          // Accept mais jouer le best move sur le board
          const promotion = bestUCI[4] as any
          const newGame = new Chess(game.fen())
          try {
            newGame.move({ from: bestUCI.slice(0, 2), to: bestUCI.slice(2, 4), promotion })
          } catch { return false }

          highlightMove(bestUCI.slice(0, 2), bestUCI.slice(2, 4), QUALITY_COLORS[alt.quality])
          showFeedback({
            quality: alt.quality,
            message: alt.quality === 'good'
              ? `Bon coup ! ${step.bestMove.san} était légèrement meilleur.`
              : `Acceptable. ${step.bestMove.san} était le meilleur coup ici.`,
          })
          setGame(newGame)

          const nextIdx = index + 1
          if (nextIdx >= richSolution!.steps.length) {
            setStatus('correct')
            setStepIndex(nextIdx)
            onSolved()
            return true
          }

          setStepIndex(nextIdx)
          if (richSolution!.steps[nextIdx]?.role === 'opponent') {
            playOpponentMoveV2(newGame, nextIdx)
          }
          return true
        }

        // Wrong move
        setStatus('wrong')
        highlightMove(sourceSquare, targetSquare, QUALITY_COLORS.wrong)
        showFeedback({ quality: 'wrong', message: `Le meilleur coup était ${step.bestMove.san}` })
        setTimeout(() => {
          highlightMove(bestUCI.slice(0, 2), bestUCI.slice(2, 4), QUALITY_COLORS.best)
        }, 800)
        onFailed()
        return false
      }

      // === Legacy mode ===
      if (solution && legacyIsPlayerTurn) {
        const expected = solution[stepIndex]
        if (!expected) return false

        const expectedFrom = expected.slice(0, 2)
        const expectedTo = expected.slice(2, 4)
        const expectedPromotion = expected[4]

        const isCorrect = sourceSquare === expectedFrom && targetSquare === expectedTo &&
          (!expectedPromotion || piece.charAt(1).toLowerCase() === expectedPromotion)

        if (!isCorrect) {
          setStatus('wrong')
          highlightMove(sourceSquare, targetSquare, QUALITY_COLORS.wrong)
          setTimeout(() => highlightMove(expectedFrom, expectedTo, QUALITY_COLORS.best), 800)
          onFailed()
          return false
        }

        const newGame = new Chess(game.fen())
        const promotion = expectedPromotion as any
        try {
          newGame.move({ from: sourceSquare, to: targetSquare, promotion })
        } catch { return false }

        highlightMove(sourceSquare, targetSquare, QUALITY_COLORS.best)
        setGame(newGame)

        const nextIdx = stepIndex + 1
        if (nextIdx >= solution.length) {
          setStatus('correct')
          setStepIndex(nextIdx)
          onSolved()
          return true
        }

        setStepIndex(nextIdx)
        playOpponentMoveLegacy(newGame, nextIdx)
        return true
      }

      return false
    },
    [game, stepIndex, status, isV2, currentPlayerStep, richSolution, solution, legacyIsPlayerTurn,
     onSolved, onFailed, highlightMove, showFeedback, playOpponentMoveV2, playOpponentMoveLegacy],
  )

  const reset = () => {
    setGame(new Chess(fen))
    setStepIndex(0)
    setStatus('playing')
    setHighlightSquares({})
    setFeedback(null)
  }

  const isWaiting = isV2
    ? (currentPlayerStep === null && status === 'playing')
    : (!legacyIsPlayerTurn && status === 'playing')

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative">
        <Chessboard
          id="puzzle-board"
          position={game.fen()}
          onPieceDrop={onDrop}
          boardOrientation={orientation}
          boardWidth={480}
          customSquareStyles={highlightSquares}
          animationDuration={200}
          arePiecesDraggable={status === 'playing' && !isWaiting}
          isDraggablePiece={({ piece }) => piece.startsWith(playerColor === 'w' ? 'w' : 'b')}
        />

        {/* Feedback toast */}
        {feedback && (
          <div
            className={`absolute top-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg text-sm font-medium shadow-lg transition-opacity ${
              feedback.quality === 'best' ? 'bg-green-600 text-white' :
              feedback.quality === 'good' ? 'bg-lime-600 text-white' :
              feedback.quality === 'acceptable' ? 'bg-yellow-600 text-white' :
              'bg-red-600 text-white'
            }`}
          >
            {feedback.message}
          </div>
        )}

        {status !== 'playing' && !feedback && (
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
        {status === 'playing' && !isWaiting && `Trait aux ${playerColor === 'w' ? 'blancs' : 'noirs'} — trouve le meilleur coup`}
        {status === 'playing' && isWaiting && 'Réponse adverse...'}
      </div>
    </div>
  )
}
