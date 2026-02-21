const LICHESS_API = 'https://lichess.org/api'

export async function fetchLichessGames(
  username: string,
  token?: string,
  max = 50,
): Promise<string> {
  const url = `${LICHESS_API}/games/user/${username}?max=${max}&evals=true&opening=true&clocks=true`

  const headers: Record<string, string> = {
    Accept: 'application/x-ndjson',
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(url, { headers })
  if (!res.ok) throw new Error(`Lichess API error: ${res.status}`)

  return res.text()
}
