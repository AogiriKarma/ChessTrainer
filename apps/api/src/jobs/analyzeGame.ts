import { Job } from 'bullmq'

export interface AnalyzeGamePayload {
  gameId: string
  pgn: string
}

export async function analyzeGameProcessor(job: Job<AnalyzeGamePayload>) {
  const { gameId, pgn } = job.data
  job.log(`Analyzing game ${gameId}`)

  // TODO: parse PGN, iterate moves, analyze each position with Stockfish
  // TODO: classify mistakes and store in DB
  // TODO: trigger exercise generation for detected mistakes

  return { gameId, status: 'analyzed' }
}
