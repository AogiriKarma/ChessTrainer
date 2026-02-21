import { useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../lib/api'

interface Player {
  id: string
  lichessId: string | null
  chesscomId: string | null
}

interface HomeProps {
  player: Player
  onLogout: () => void
}

export default function Home({ player, onLogout }: HomeProps) {
  const [fetching, setFetching] = useState(false)
  const [fetchResult, setFetchResult] = useState<string | null>(null)

  const fetchGames = async (source: 'lichess' | 'chesscom') => {
    setFetching(true)
    setFetchResult(null)

    try {
      const data = await apiFetch<{ imported: number; total: number }>(
        `/games/fetch/${source}`,
        { method: 'POST' },
      )
      setFetchResult(`${data.imported} nouvelles parties importées sur ${data.total} récupérées`)
    } catch (err) {
      setFetchResult(`Erreur: ${err instanceof Error ? err.message : 'Échec du fetch'}`)
    } finally {
      setFetching(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">ChessTrainer</h1>
        <div className="flex items-center gap-4">
          <Link to="/training" className="text-gray-400 hover:text-white transition">
            Training
          </Link>
          <Link to="/profile" className="text-gray-400 hover:text-white transition">
            Profil
          </Link>
          <button onClick={onLogout} className="text-gray-500 hover:text-red-400 transition text-sm">
            Déconnexion
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-12 space-y-8">
        <div>
          <h2 className="text-2xl font-bold mb-2">Dashboard</h2>
          <p className="text-gray-400">
            Connecté en tant que{' '}
            <span className="text-white font-medium">
              {player.lichessId || player.chesscomId}
            </span>
          </p>
        </div>

        <div className="space-y-3">
          <h3 className="text-lg font-semibold">Importer des parties</h3>

          <div className="flex gap-3">
            {player.lichessId && (
              <button
                onClick={() => fetchGames('lichess')}
                disabled={fetching}
                className="bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-lg transition disabled:opacity-50"
              >
                {fetching ? 'Import...' : 'Fetch Lichess'}
              </button>
            )}

            {player.chesscomId && (
              <button
                onClick={() => fetchGames('chesscom')}
                disabled={fetching}
                className="bg-green-700 hover:bg-green-600 px-4 py-2 rounded-lg transition disabled:opacity-50"
              >
                {fetching ? 'Import...' : 'Fetch Chess.com'}
              </button>
            )}
          </div>

          {fetchResult && (
            <p className="text-sm text-gray-300 bg-gray-900 rounded-lg px-4 py-2">
              {fetchResult}
            </p>
          )}
        </div>
      </main>
    </div>
  )
}
