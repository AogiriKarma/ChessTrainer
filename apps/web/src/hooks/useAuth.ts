import { useState, useEffect, useCallback } from 'react'
import { getToken, setToken, clearToken, apiFetch } from '../lib/api'

interface Player {
  id: string
  lichessId: string | null
  chesscomId: string | null
}

export function useAuth() {
  const [player, setPlayer] = useState<Player | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchMe = useCallback(async () => {
    const token = getToken()
    if (!token) {
      setLoading(false)
      return
    }

    try {
      const data = await apiFetch<{ player: Player }>('/auth/me')
      setPlayer(data.player)
    } catch {
      clearToken()
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchMe()
  }, [fetchMe])

  const login = (token: string) => {
    setToken(token)
    fetchMe()
  }

  const logout = () => {
    clearToken()
    setPlayer(null)
  }

  return { player, loading, login, logout, isAuthenticated: !!player }
}
