import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { setToken } from '../lib/api'

export default function Login() {
  const [chesscomUsername, setChesscomUsername] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const loginLichess = () => {
    window.location.href = '/api/auth/lichess'
  }

  const loginChesscom = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!chesscomUsername.trim()) return

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth/chesscom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: chesscomUsername.trim() }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Erreur de connexion')
        return
      }

      setToken(data.token)
      navigate('/', { replace: true })
    } catch {
      setError('Erreur réseau')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 text-white">
      <div className="w-full max-w-md space-y-8 p-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold">ChessTrainer</h1>
          <p className="mt-2 text-gray-400">Connecte-toi pour commencer</p>
        </div>

        <div className="space-y-4">
          <button
            onClick={loginLichess}
            className="w-full flex items-center justify-center gap-3 bg-white text-gray-900 font-semibold py-3 px-4 rounded-lg hover:bg-gray-100 transition"
          >
            Se connecter avec Lichess
          </button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-700" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="bg-gray-950 px-2 text-gray-500">ou</span>
            </div>
          </div>

          <form onSubmit={loginChesscom} className="space-y-3">
            <input
              type="text"
              placeholder="Username Chess.com"
              value={chesscomUsername}
              onChange={(e) => setChesscomUsername(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg py-3 px-4 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-green-600 text-white font-semibold py-3 px-4 rounded-lg hover:bg-green-700 transition disabled:opacity-50"
            >
              {loading ? 'Connexion...' : 'Se connecter avec Chess.com'}
            </button>
          </form>

          {error && (
            <p className="text-red-400 text-sm text-center">{error}</p>
          )}
        </div>
      </div>
    </div>
  )
}
