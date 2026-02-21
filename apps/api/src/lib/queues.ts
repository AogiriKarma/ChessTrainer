import { Queue, Worker } from 'bullmq'
import { redis } from './redis.js'
import { analyzeGameProcessor, type AnalyzeGamePayload } from '../jobs/analyzeGame.js'
import { generateExerciseProcessor, type GenerateExercisePayload } from '../jobs/generateExercise.js'

// Queues
export const analyzeGameQueue = new Queue<AnalyzeGamePayload>('analyze-game', {
  connection: redis,
})

export const generateExerciseQueue = new Queue<GenerateExercisePayload>('generate-exercise', {
  connection: redis,
})

// Workers
export function startWorkers() {
  const analyzeWorker = new Worker<AnalyzeGamePayload>(
    'analyze-game',
    analyzeGameProcessor,
    { connection: redis, concurrency: 2 },
  )

  const exerciseWorker = new Worker<GenerateExercisePayload>(
    'generate-exercise',
    generateExerciseProcessor,
    { connection: redis, concurrency: 4 },
  )

  analyzeWorker.on('completed', (job) => {
    console.log(`Game analysis completed: ${job.id}`)
  })

  analyzeWorker.on('failed', (job, err) => {
    console.error(`Game analysis failed: ${job?.id}`, err)
  })

  exerciseWorker.on('completed', (job) => {
    console.log(`Exercise generation completed: ${job.id}`)
  })

  exerciseWorker.on('failed', (job, err) => {
    console.error(`Exercise generation failed: ${job?.id}`, err)
  })

  return { analyzeWorker, exerciseWorker }
}
