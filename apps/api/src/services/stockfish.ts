import { spawn, type ChildProcess } from 'child_process'

export interface AnalysisResult {
  bestMove: string
  eval: number // centipawns, positif = avantage blanc
  depth: number
  pv: string[]
  mate?: number // si mat détecté
}

interface PooledEngine {
  process: ChildProcess
  busy: boolean
}

const POOL_SIZE = parseInt(process.env.STOCKFISH_POOL_SIZE || '4')
const SF_PATH = process.env.STOCKFISH_PATH || 'stockfish'
const DEFAULT_DEPTH = parseInt(process.env.STOCKFISH_DEFAULT_DEPTH || '20')

let pool: PooledEngine[] = []
let waitQueue: Array<(engine: PooledEngine) => void> = []

function createEngine(): Promise<PooledEngine> {
  return new Promise((resolve, reject) => {
    const proc = spawn(SF_PATH)
    const engine: PooledEngine = { process: proc, busy: false }

    const onReady = (data: Buffer) => {
      if (data.toString().includes('uciok')) {
        proc.stdout?.removeListener('data', onReady)
        resolve(engine)
      }
    }

    proc.stdout?.on('data', onReady)
    proc.stderr?.on('data', (err: Buffer) => reject(new Error(err.toString())))
    proc.on('error', reject)

    proc.stdin?.write('uci\n')
  })
}

export async function initPool(): Promise<void> {
  pool = await Promise.all(Array.from({ length: POOL_SIZE }, () => createEngine()))
  console.log(`Stockfish pool initialized with ${POOL_SIZE} engines`)
}

function acquireEngine(): Promise<PooledEngine> {
  const free = pool.find((e) => !e.busy)
  if (free) {
    free.busy = true
    return Promise.resolve(free)
  }

  return new Promise((resolve) => {
    waitQueue.push(resolve)
  })
}

function releaseEngine(engine: PooledEngine) {
  if (waitQueue.length > 0) {
    const next = waitQueue.shift()!
    next(engine)
  } else {
    engine.busy = false
  }
}

export async function analyzePosition(
  fen: string,
  depth = DEFAULT_DEPTH,
): Promise<AnalysisResult> {
  const engine = await acquireEngine()
  const proc = engine.process

  return new Promise((resolve, reject) => {
    let currentEval = 0
    let pv: string[] = []
    let mate: number | undefined
    let bestMove = ''

    const timeout = setTimeout(() => {
      releaseEngine(engine)
      reject(new Error('Stockfish analysis timeout'))
    }, 30000)

    const onData = (data: Buffer) => {
      const lines = data.toString().split('\n')
      for (const line of lines) {
        // Parse info lines for the target depth
        if (line.includes('score cp') || line.includes('score mate')) {
          const cpMatch = line.match(/score cp (-?\d+)/)
          const mateMatch = line.match(/score mate (-?\d+)/)
          const pvMatch = line.match(/ pv (.+)/)

          if (cpMatch) {
            currentEval = parseInt(cpMatch[1])
            mate = undefined
          }
          if (mateMatch) {
            mate = parseInt(mateMatch[1])
            // Convert mate to a large centipawn value
            currentEval = mate > 0 ? 10000 - mate : -10000 - mate
          }
          if (pvMatch) pv = pvMatch[1].trim().split(' ')
        }

        if (line.startsWith('bestmove')) {
          bestMove = line.split(' ')[1]
          proc.stdout?.removeListener('data', onData)
          clearTimeout(timeout)
          releaseEngine(engine)
          resolve({ bestMove, eval: currentEval, depth, pv, mate })
        }
      }
    }

    proc.stdout?.on('data', onData)
    proc.stdin?.write(`position fen ${fen}\n`)
    proc.stdin?.write(`go depth ${depth}\n`)
  })
}

export interface MultiPVResult {
  rank: number
  bestMove: string
  eval: number
  depth: number
  pv: string[]
  mate?: number
}

export async function analyzePositionMultiPV(
  fen: string,
  depth = DEFAULT_DEPTH,
  numPV = 5,
): Promise<MultiPVResult[]> {
  const engine = await acquireEngine()
  const proc = engine.process

  return new Promise((resolve, reject) => {
    const results = new Map<number, MultiPVResult>()

    const timeout = setTimeout(() => {
      // Reset MultiPV before releasing
      proc.stdin?.write('setoption name MultiPV value 1\n')
      releaseEngine(engine)
      reject(new Error('Stockfish MultiPV analysis timeout'))
    }, 60000)

    const onData = (data: Buffer) => {
      const lines = data.toString().split('\n')
      for (const line of lines) {
        if (line.includes('score') && line.includes('multipv')) {
          const pvIdxMatch = line.match(/multipv (\d+)/)
          const cpMatch = line.match(/score cp (-?\d+)/)
          const mateMatch = line.match(/score mate (-?\d+)/)
          const pvMatch = line.match(/ pv (.+)/)
          const depthMatch = line.match(/depth (\d+)/)

          if (!pvIdxMatch) continue
          const rank = parseInt(pvIdxMatch[1])
          const lineDepth = depthMatch ? parseInt(depthMatch[1]) : 0

          let evalScore = 0
          let mate: number | undefined

          if (cpMatch) {
            evalScore = parseInt(cpMatch[1])
          }
          if (mateMatch) {
            mate = parseInt(mateMatch[1])
            evalScore = mate > 0 ? 10000 - mate : -10000 - mate
          }

          const pv = pvMatch ? pvMatch[1].trim().split(' ') : []

          results.set(rank, {
            rank,
            bestMove: pv[0] || '',
            eval: evalScore,
            depth: lineDepth,
            pv,
            mate,
          })
        }

        if (line.startsWith('bestmove')) {
          proc.stdout?.removeListener('data', onData)
          clearTimeout(timeout)
          // Reset MultiPV before releasing
          proc.stdin?.write('setoption name MultiPV value 1\n')
          releaseEngine(engine)

          const sorted = Array.from(results.values())
            .filter((r) => r.bestMove)
            .sort((a, b) => a.rank - b.rank)
          resolve(sorted)
        }
      }
    }

    proc.stdout?.on('data', onData)
    proc.stdin?.write(`setoption name MultiPV value ${numPV}\n`)
    proc.stdin?.write('isready\n')
    proc.stdin?.write(`position fen ${fen}\n`)
    proc.stdin?.write(`go depth ${depth}\n`)
  })
}

export async function shutdownPool(): Promise<void> {
  for (const engine of pool) {
    engine.process.stdin?.write('quit\n')
    engine.process.kill()
  }
  pool = []
  waitQueue = []
}
