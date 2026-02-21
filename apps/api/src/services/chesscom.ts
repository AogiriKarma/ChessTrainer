const CHESSCOM_API = 'https://api.chess.com/pub'

export async function fetchChesscomGames(
  username: string,
  year: number,
  month: number,
): Promise<string> {
  const monthStr = month.toString().padStart(2, '0')
  const url = `${CHESSCOM_API}/player/${username}/games/${year}/${monthStr}`

  const res = await fetch(url)
  if (!res.ok) throw new Error(`Chess.com API error: ${res.status}`)

  const data = await res.json()
  return JSON.stringify(data)
}
