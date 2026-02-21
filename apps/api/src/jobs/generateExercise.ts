import { Job } from 'bullmq'

export interface GenerateExercisePayload {
  mistakeId: string
  type: string
  fen: string
  bestMove: string
}

export async function generateExerciseProcessor(job: Job<GenerateExercisePayload>) {
  const { mistakeId, type, fen } = job.data
  job.log(`Generating exercise for mistake ${mistakeId} (type: ${type})`)

  // TODO: generate exercise based on mistake type
  // TODO: store exercise in DB
  // TODO: notify client via WebSocket

  return { mistakeId, status: 'generated' }
}
