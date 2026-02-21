import { spawn, type ChildProcess } from 'child_process'

export interface AnalysisResult {
  bestMove: string
  eval: number
  depth: number
  pv: string[]
}

export function analyzePosition(fen: string, depth = 20): Promise<AnalysisResult> {
  return new Promise((resolve, reject) => {
    const sfPath = process.env.STOCKFISH_PATH || 'stockfish'
    const sf: ChildProcess = spawn(sfPath)
    let currentEval = 0
    let pv: string[] = []

    sf.stdout?.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n')
      for (const line of lines) {
        if (line.startsWith(`info depth ${depth}`) && line.includes('score cp')) {
          const cpMatch = line.match(/score cp (-?\d+)/)
          const pvMatch = line.match(/pv (.+)/)
          if (cpMatch) currentEval = parseInt(cpMatch[1])
          if (pvMatch) pv = pvMatch[1].trim().split(' ')
        }

        if (line.startsWith('bestmove')) {
          const bestMove = line.split(' ')[1]
          sf.kill()
          resolve({ bestMove, eval: currentEval, depth, pv })
        }
      }
    })

    sf.stderr?.on('data', (err: Buffer) => reject(new Error(err.toString())))

    sf.stdin?.write('uci\n')
    sf.stdin?.write('isready\n')
    sf.stdin?.write(`position fen ${fen}\n`)
    sf.stdin?.write(`go depth ${depth}\n`)
  })
}
