import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import PuzzleBoard from '../components/Chessboard/PuzzleBoard'

interface Mistake {
  type: string
  theme: string | null
  evalLoss: number
  moveNumber: number
}

interface Exercise {
  id: string
  type: string
  fenStart: string
  solution: { moves?: string[]; bestMove?: string; correctMove?: string }
  completed: boolean
  attempts: number
  mistake: Mistake
}

const MISTAKE_LABELS: Record<string, string> = {
  TACTICAL_MISS: 'Tactique ratée',
  OPENING_DEVIATION: "Déviation d'ouverture",
  ENDGAME_ERROR: 'Erreur en finale',
  BLUNDER_POSITIONAL: 'Blunder positionnel',
  INACCURACY: 'Imprécision',
}

const SEVERITY_LABEL = (loss: number) =>
  loss >= 200 ? 'Blunder' : loss >= 80 ? 'Mistake' : 'Inaccuracy'

const SEVERITY_COLOR = (loss: number) =>
  loss >= 200
    ? 'bg-red-900 text-red-300'
    : loss >= 80
      ? 'bg-orange-900 text-orange-300'
      : 'bg-yellow-900 text-yellow-300'

export default function Training() {
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [loading, setLoading] = useState(true)

  // Session state
  const [sessionQueue, setSessionQueue] = useState<Exercise[]>([])
  const [sessionIndex, setSessionIndex] = useState(0)
  const [sessionActive, setSessionActive] = useState(false)
  const [sessionResults, setSessionResults] = useState<Array<{ id: string; solved: boolean }>>([])
  const [currentResult, setCurrentResult] = useState<'playing' | 'solved' | 'failed'>('playing')

  const fetchExercises = useCallback(async () => {
    try {
      const data = await apiFetch<{ exercises: Exercise[] }>('/exercises')
      setExercises(data.exercises)
    } catch (err) {
      console.error('Failed to fetch exercises', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchExercises()
  }, [fetchExercises])

  const unsolvedCount = exercises.filter((e) => !e.completed).length
  const solvedCount = exercises.filter((e) => e.completed).length

  const startSession = (count: number) => {
    // Trier par priorité : blunders d'abord, puis mistakes, puis inaccuracies
    // Au sein d'un même niveau : non résolus d'abord, puis ceux avec le plus de perte
    const sorted = [...exercises]
      .filter((e) => !e.completed)
      .sort((a, b) => b.mistake.evalLoss - a.mistake.evalLoss)
      .slice(0, count)

    if (sorted.length === 0) return

    setSessionQueue(sorted)
    setSessionIndex(0)
    setSessionResults([])
    setCurrentResult('playing')
    setSessionActive(true)
  }

  const submitAttempt = async (exerciseId: string, solved: boolean) => {
    try {
      await apiFetch(`/exercises/${exerciseId}/attempt`, {
        method: 'POST',
        body: JSON.stringify({ solved }),
      })
    } catch (err) {
      console.error('Failed to submit attempt', err)
    }
  }

  const handleSolved = () => {
    const exercise = sessionQueue[sessionIndex]
    setCurrentResult('solved')
    setSessionResults((prev) => [...prev, { id: exercise.id, solved: true }])
    submitAttempt(exercise.id, true)
  }

  const handleFailed = () => {
    const exercise = sessionQueue[sessionIndex]
    setCurrentResult('failed')
    setSessionResults((prev) => [...prev, { id: exercise.id, solved: false }])
    submitAttempt(exercise.id, false)
  }

  const nextExercise = () => {
    if (sessionIndex + 1 >= sessionQueue.length) {
      // Session terminée
      setSessionActive(false)
      fetchExercises()
      return
    }
    setSessionIndex((i) => i + 1)
    setCurrentResult('playing')
  }

  const endSession = () => {
    setSessionActive(false)
    fetchExercises()
  }

  const getSolutionMoves = (exercise: Exercise): string[] => {
    if (exercise.solution.moves) return exercise.solution.moves
    if (exercise.solution.bestMove) return [exercise.solution.bestMove]
    if (exercise.solution.correctMove) return [exercise.solution.correctMove]
    return []
  }

  // === SESSION VIEW ===
  if (sessionActive && sessionQueue.length > 0) {
    const exercise = sessionQueue[sessionIndex]
    const moves = getSolutionMoves(exercise)
    const solved = sessionResults.filter((r) => r.solved).length
    const failed = sessionResults.filter((r) => !r.solved).length
    const isLast = sessionIndex + 1 >= sessionQueue.length
    const isFinished = isLast && currentResult !== 'playing'

    return (
      <div className="min-h-screen bg-gray-950 text-white">
        {/* Progress bar */}
        <div className="h-1 bg-gray-800">
          <div
            className="h-full bg-white transition-all duration-300"
            style={{ width: `${((sessionIndex + (currentResult !== 'playing' ? 1 : 0)) / sessionQueue.length) * 100}%` }}
          />
        </div>

        <header className="px-6 py-4 flex items-center justify-between">
          <button onClick={endSession} className="text-gray-500 hover:text-white transition text-sm">
            Quitter la session
          </button>
          <span className="text-sm text-gray-400">
            {sessionIndex + 1} / {sessionQueue.length}
          </span>
          <div className="flex gap-3 text-sm">
            <span className="text-green-400">{solved} ok</span>
            <span className="text-red-400">{failed} raté</span>
          </div>
        </header>

        <main className="flex flex-col items-center py-6 gap-6">
          {/* Info exercice */}
          <div className="flex items-center gap-3">
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${SEVERITY_COLOR(exercise.mistake.evalLoss)}`}>
              {SEVERITY_LABEL(exercise.mistake.evalLoss)}
            </span>
            <span className="text-sm text-gray-400">
              {MISTAKE_LABELS[exercise.mistake.type] || exercise.mistake.type}
            </span>
            <span className="text-sm text-gray-600">
              coup {exercise.mistake.moveNumber} — {(exercise.mistake.evalLoss / 100).toFixed(1)} pion{exercise.mistake.evalLoss >= 200 ? 's' : ''} perdu{exercise.mistake.evalLoss >= 200 ? 's' : ''}
            </span>
          </div>

          {/* Échiquier */}
          {moves.length > 0 ? (
            <PuzzleBoard
              key={exercise.id}
              fen={exercise.fenStart}
              solution={moves}
              onSolved={handleSolved}
              onFailed={handleFailed}
            />
          ) : (
            <p className="text-gray-400">Pas de solution pour cet exercice.</p>
          )}

          {/* Bouton suivant */}
          {currentResult !== 'playing' && (
            <button
              onClick={isFinished ? endSession : nextExercise}
              className="bg-white text-gray-900 font-semibold px-6 py-3 rounded-lg hover:bg-gray-200 transition"
            >
              {isFinished ? 'Voir les résultats' : 'Suivant'}
            </button>
          )}
        </main>

        {/* Résumé fin de session */}
        {isFinished && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
            <div className="bg-gray-900 rounded-2xl p-8 max-w-sm w-full text-center space-y-6">
              <h2 className="text-2xl font-bold">Session terminée</h2>
              <div className="flex justify-center gap-8">
                <div>
                  <p className="text-3xl font-bold text-green-400">{solved}</p>
                  <p className="text-sm text-gray-400">réussis</p>
                </div>
                <div>
                  <p className="text-3xl font-bold text-red-400">{failed}</p>
                  <p className="text-sm text-gray-400">ratés</p>
                </div>
              </div>
              <p className="text-gray-400">
                {solved > failed
                  ? 'Bien joué !'
                  : solved === failed
                    ? 'Pas mal, continue !'
                    : 'Continue à bosser, ça va venir.'}
              </p>
              <button
                onClick={endSession}
                className="bg-white text-gray-900 font-semibold px-6 py-3 rounded-lg hover:bg-gray-200 transition w-full"
              >
                Retour
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // === LOBBY VIEW ===
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">Training</h1>
        <div className="flex items-center gap-4">
          <Link to="/" className="text-gray-400 hover:text-white transition">
            Dashboard
          </Link>
          <Link to="/profile" className="text-gray-400 hover:text-white transition">
            Profil
          </Link>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-6 py-16 text-center space-y-10">
        {loading ? (
          <p className="text-gray-400">Chargement...</p>
        ) : unsolvedCount === 0 ? (
          <div className="space-y-4">
            <p className="text-gray-400 text-lg">
              {exercises.length === 0
                ? "Aucun exercice disponible. Importe des parties depuis le dashboard."
                : "Tous les exercices sont résolus. Importe de nouvelles parties !"}
            </p>
            <Link
              to="/"
              className="inline-block bg-white text-gray-900 font-semibold px-6 py-3 rounded-lg hover:bg-gray-200 transition"
            >
              Aller au dashboard
            </Link>
          </div>
        ) : (
          <>
            <div>
              <h2 className="text-3xl font-bold mb-2">Prêt à t'entraîner ?</h2>
              <p className="text-gray-400">
                {unsolvedCount} exercice{unsolvedCount > 1 ? 's' : ''} à faire
                {solvedCount > 0 && ` — ${solvedCount} déjà résolus`}
              </p>
            </div>

            <div className="space-y-3">
              <p className="text-sm text-gray-500 mb-4">Choisis la taille de ta session</p>

              {[5, 10, 20].map((count) => (
                <button
                  key={count}
                  onClick={() => startSession(count)}
                  disabled={unsolvedCount === 0}
                  className="w-full bg-gray-900 hover:bg-gray-800 py-4 rounded-xl transition text-lg font-medium disabled:opacity-50"
                >
                  {Math.min(count, unsolvedCount)} exercice{Math.min(count, unsolvedCount) > 1 ? 's' : ''}
                  {count > unsolvedCount && ` (${unsolvedCount} dispo)`}
                </button>
              ))}

              {unsolvedCount > 20 && (
                <button
                  onClick={() => startSession(unsolvedCount)}
                  className="w-full bg-gray-900 hover:bg-gray-800 py-4 rounded-xl transition text-lg font-medium"
                >
                  Tout faire ({unsolvedCount})
                </button>
              )}
            </div>

            <p className="text-xs text-gray-600">
              Les exercices sont triés par sévérité — les plus grosses erreurs en premier
            </p>
          </>
        )}
      </main>
    </div>
  )
}
