const CHESSCOM_API = 'https://api.chess.com/pub'

export interface ChesscomGame {
  url: string
  pgn: string
}

/**
 * Fetch les parties Chess.com d'un joueur pour un mois donné.
 */
export async function fetchChesscomGames(
  username: string,
  year: number,
  month: number,
): Promise<ChesscomGame[]> {
  const monthStr = month.toString().padStart(2, '0')
  const url = `${CHESSCOM_API}/player/${username}/games/${year}/${monthStr}`

  const res = await fetch(url)
  if (!res.ok) throw new Error(`Chess.com API error: ${res.status}`)

  const data = (await res.json()) as { games: Array<{ url: string; pgn: string }> }

  return data.games.map((g) => ({
    url: g.url,
    pgn: g.pgn,
  }))
}

/**
 * Fetch les archives disponibles pour un joueur Chess.com.
 * Retourne les URLs des mois avec des parties.
 */
export async function fetchChesscomArchives(username: string): Promise<string[]> {
  const url = `${CHESSCOM_API}/player/${username}/games/archives`

  const res = await fetch(url)
  if (!res.ok) throw new Error(`Chess.com API error: ${res.status}`)

  const data = (await res.json()) as { archives: string[] }
  return data.archives
}

/**
 * Fetch les parties récentes Chess.com (derniers N mois).
 */
export async function fetchRecentChesscomGames(
  username: string,
  monthsBack = 3,
): Promise<ChesscomGame[]> {
  const archives = await fetchChesscomArchives(username)
  const recentArchives = archives.slice(-monthsBack)

  const allGames: ChesscomGame[] = []

  for (const archiveUrl of recentArchives) {
    // Extract year/month from archive URL
    const match = archiveUrl.match(/\/(\d{4})\/(\d{2})$/)
    if (!match) continue

    const games = await fetchChesscomGames(username, parseInt(match[1]), parseInt(match[2]))
    allGames.push(...games)
  }

  return allGames
}
