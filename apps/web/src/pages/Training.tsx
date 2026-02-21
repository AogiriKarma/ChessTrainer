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

const TYPE_LABELS: Record<string, string> = {
  puzzle: 'Puzzle tactique',
  opening_drill: "Drill d'ouverture",
  endgame: 'Finale',
  guided_analysis: 'Analyse guidée',
}

const MISTAKE_LABELS: Record<string, string> = {
  TACTICAL_MISS: 'Tactique ratée',
  OPENING_DEVIATION: "Déviation d'ouverture",
  ENDGAME_ERROR: 'Erreur en finale',
  BLUNDER_POSITIONAL: 'Blunder positionnel',
  INACCURACY: 'Imprécision',
}

export default function Training() {
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [current, setCurrent] = useState<Exercise | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')

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

  const filtered = exercises.filter((e) => {
    if (filter === 'all') return true
    if (filter === 'unsolved') return !e.completed
    if (filter === 'solved') return e.completed
    return e.mistake.type === filter
  })

  const startExercise = (exercise: Exercise) => {
    setCurrent(exercise)
  }

  const submitAttempt = async (exerciseId: string, solved: boolean) => {
    try {
      await apiFetch(`/exercises/${exerciseId}/attempt`, {
        method: 'POST',
        body: JSON.stringify({ solved }),
      })
      // Refresh la liste
      fetchExercises()
    } catch (err) {
      console.error('Failed to submit attempt', err)
    }
  }

  const getSolutionMoves = (exercise: Exercise): string[] => {
    if (exercise.solution.moves) return exercise.solution.moves
    if (exercise.solution.bestMove) return [exercise.solution.bestMove]
    if (exercise.solution.correctMove) return [exercise.solution.correctMove]
    return []
  }

  if (current) {
    const moves = getSolutionMoves(current)

    return (
      <div className="min-h-screen bg-gray-950 text-white">
        <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
          <button
            onClick={() => setCurrent(null)}
            className="text-gray-400 hover:text-white transition"
          >
            Retour aux exercices
          </button>
          <span className="text-sm text-gray-500">
            {TYPE_LABELS[current.type] || current.type} — coup {current.mistake.moveNumber}
          </span>
        </header>

        <main className="flex flex-col items-center py-8 gap-6">
          <div className="flex items-center gap-4">
            <span
              className={`px-3 py-1 rounded-full text-xs font-medium ${
                current.mistake.type === 'TACTICAL_MISS'
                  ? 'bg-red-900 text-red-300'
                  : current.mistake.type === 'OPENING_DEVIATION'
                    ? 'bg-blue-900 text-blue-300'
                    : current.mistake.type === 'ENDGAME_ERROR'
                      ? 'bg-purple-900 text-purple-300'
                      : 'bg-yellow-900 text-yellow-300'
              }`}
            >
              {MISTAKE_LABELS[current.mistake.type] || current.mistake.type}
            </span>
            {current.mistake.theme && (
              <span className="text-sm text-gray-400">{current.mistake.theme}</span>
            )}
            <span className="text-sm text-gray-500">
              -{current.mistake.evalLoss}cp
            </span>
          </div>

          {moves.length > 0 ? (
            <PuzzleBoard
              fen={current.fenStart}
              solution={moves}
              onSolved={() => submitAttempt(current.id, true)}
              onFailed={() => submitAttempt(current.id, false)}
            />
          ) : (
            <p className="text-gray-400">Pas de solution disponible pour cet exercice.</p>
          )}
        </main>
      </div>
    )
  }

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

      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">Exercices</h2>
          <div className="flex gap-2">
            {[
              { key: 'all', label: 'Tous' },
              { key: 'unsolved', label: 'Non résolus' },
              { key: 'solved', label: 'Résolus' },
              { key: 'TACTICAL_MISS', label: 'Tactique' },
              { key: 'OPENING_DEVIATION', label: 'Ouverture' },
              { key: 'ENDGAME_ERROR', label: 'Finale' },
            ].map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`px-3 py-1 rounded-lg text-sm transition ${
                  filter === f.key
                    ? 'bg-white text-gray-900'
                    : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <p className="text-gray-400">Chargement...</p>
        ) : filtered.length === 0 ? (
          <p className="text-gray-400">
            Aucun exercice. Lance un fetch de parties depuis le dashboard pour en générer.
          </p>
        ) : (
          <div className="grid gap-3">
            {filtered.map((exercise) => (
              <button
                key={exercise.id}
                onClick={() => startExercise(exercise)}
                className="flex items-center justify-between bg-gray-900 hover:bg-gray-800 rounded-lg px-5 py-4 transition text-left"
              >
                <div className="flex items-center gap-4">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      exercise.completed ? 'bg-green-500' : 'bg-gray-600'
                    }`}
                  />
                  <div>
                    <p className="font-medium">
                      {TYPE_LABELS[exercise.type] || exercise.type}
                    </p>
                    <p className="text-sm text-gray-500">
                      {MISTAKE_LABELS[exercise.mistake.type]} — coup {exercise.mistake.moveNumber}
                      {exercise.mistake.theme && ` — ${exercise.mistake.theme}`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-sm">
                  <span className="text-gray-500">
                    -{exercise.mistake.evalLoss}cp
                  </span>
                  {exercise.attempts > 0 && (
                    <span className="text-gray-600">
                      {exercise.attempts} essai{exercise.attempts > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
