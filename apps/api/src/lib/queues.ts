import { Queue, Worker } from 'bullmq'
import { redisUrl } from './redis.js'
import { analyzeGameProcessor, type AnalyzeGamePayload } from '../jobs/analyzeGame.js'
import { generateExerciseProcessor, type GenerateExercisePayload } from '../jobs/generateExercise.js'

const connection = { url: redisUrl }

// Queues
export const analyzeGameQueue = new Queue<AnalyzeGamePayload>('analyze-game', {
  connection,
})

export const generateExerciseQueue = new Queue<GenerateExercisePayload>('generate-exercise', {
  connection,
})

// Workers
export function startWorkers() {
  const analyzeWorker = new Worker<AnalyzeGamePayload>(
    'analyze-game',
    analyzeGameProcessor,
    { connection, concurrency: 2 },
  )

  const exerciseWorker = new Worker<GenerateExercisePayload>(
    'generate-exercise',
    generateExerciseProcessor,
    { connection, concurrency: 4 },
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
