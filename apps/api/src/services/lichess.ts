const LICHESS_API = 'https://lichess.org/api'

export interface LichessGame {
  id: string
  pgn: string
}

/**
 * Fetch les parties d'un joueur Lichess en NDJSON.
 * Retourne un tableau de games avec id et PGN.
 */
export async function fetchLichessGames(
  username: string,
  token?: string,
  max?: number,
): Promise<LichessGame[]> {
  const params = new URLSearchParams({
    evals: 'true',
    opening: 'true',
    clocks: 'true',
    pgnInJson: 'true',
  })
  if (max) params.set('max', max.toString())

  const url = `${LICHESS_API}/games/user/${username}?${params}`

  const headers: Record<string, string> = {
    Accept: 'application/x-ndjson',
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(url, { headers })
  if (!res.ok) throw new Error(`Lichess API error: ${res.status}`)

  const text = await res.text()
  const lines = text.trim().split('\n').filter(Boolean)

  return lines.map((line) => {
    const data = JSON.parse(line)
    return {
      id: data.id as string,
      pgn: data.pgn as string,
    }
  })
}
