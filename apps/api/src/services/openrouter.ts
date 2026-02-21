import type { ExerciseExplanation, TacticalTheme, MistakeType, GamePhase } from '@chesstrainer/types'

const OPENROUTER_API = 'https://openrouter.ai/api/v1/chat/completions'
const API_KEY = process.env.OPENROUTER_API_KEY || ''
const MODEL = process.env.OPENROUTER_MODEL || 'deepseek/deepseek-chat-v3.1'

const THEME_LABELS: Record<TacticalTheme, string> = {
  fork: 'Fourchette',
  pin: 'Clouage',
  skewer: 'Enfilade',
  back_rank: 'Mat sur la dernière rangée',
  discovery: 'Attaque à la découverte',
  deflection: 'Déviation',
  decoy: 'Attraction',
  mate_in_n: 'Mat en N coups',
  trapped_piece: 'Pièce piégée',
}

interface ExplanationContext {
  fen: string
  playedMoveSAN: string
  bestMoveSAN: string
  principalVariation: string[]
  evalBefore: number
  evalAfter: number
  mistakeType: MistakeType
  theme: TacticalTheme | null
  phase: GamePhase
  threats: string[]
}

export async function generateExplanation(ctx: ExplanationContext): Promise<ExerciseExplanation> {
  if (!API_KEY) {
    return buildFallbackExplanation(ctx)
  }

  try {
    const prompt = buildPrompt(ctx)

    const res = await fetch(OPENROUTER_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: 'system',
            content: `Tu es un coach d'échecs expert. Tu analyses les erreurs des joueurs et tu expliques de manière claire, concise et pédagogique pourquoi un coup est mauvais et quel était le meilleur coup. Tu réponds UNIQUEMENT en JSON valide, sans markdown.`,
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 500,
        response_format: { type: 'json_object' },
      }),
    })

    if (!res.ok) {
      console.error(`OpenRouter error: ${res.status}`)
      return buildFallbackExplanation(ctx)
    }

    const data = (await res.json()) as {
      choices: Array<{ message: { content: string } }>
    }

    const content = data.choices[0]?.message?.content
    if (!content) return buildFallbackExplanation(ctx)

    const parsed = JSON.parse(content)

    return {
      mistakeSummary: parsed.mistakeSummary || '',
      bestMoveReason: parsed.bestMoveReason || '',
      playedMoveWeakness: parsed.playedMoveWeakness || '',
      tip: parsed.tip || '',
      theme: ctx.theme ?? undefined,
      themeLabel: ctx.theme ? THEME_LABELS[ctx.theme] : undefined,
      evalContext: buildEvalContext(ctx.evalBefore, ctx.evalAfter),
    }
  } catch (err) {
    console.error('OpenRouter explanation failed:', err)
    return buildFallbackExplanation(ctx)
  }
}

function buildPrompt(ctx: ExplanationContext): string {
  const evalBeforePawns = (ctx.evalBefore / 100).toFixed(1)
  const evalAfterPawns = (ctx.evalAfter / 100).toFixed(1)
  const lossPawns = (Math.abs(ctx.evalBefore - ctx.evalAfter) / 100).toFixed(1)

  return `Analyse cette erreur aux échecs et réponds en JSON avec ces 4 champs :
- "mistakeSummary": 1-2 phrases expliquant ce qui s'est passé (mentionne les pièces et les cases concrètes)
- "bestMoveReason": pourquoi ${ctx.bestMoveSAN} est le meilleur coup dans cette position (menaces créées, avantage obtenu)
- "playedMoveWeakness": pourquoi ${ctx.playedMoveSAN} est mauvais (ce que ça permet à l'adversaire, ce que ça rate)
- "tip": un conseil général applicable à des positions similaires

Position FEN: ${ctx.fen}
Phase de jeu: ${ctx.phase}
Coup joué: ${ctx.playedMoveSAN} (eval résultant: ${evalAfterPawns})
Meilleur coup: ${ctx.bestMoveSAN} (eval résultant: ${evalBeforePawns})
Perte: ${lossPawns} pion(s)
Continuation optimale: ${ctx.principalVariation.join(' ')}
Type d'erreur: ${ctx.mistakeType}
${ctx.theme ? `Thème tactique: ${THEME_LABELS[ctx.theme]}` : ''}
${ctx.threats.length > 0 ? `Menaces dans la position: ${ctx.threats.join(', ')}` : ''}

Réponds en français, sois concis et concret. Mentionne les pièces et cases spécifiques.`
}

function buildEvalContext(evalBefore: number, evalAfter: number): string {
  const delta = Math.abs(evalBefore - evalAfter)
  const pawns = (delta / 100).toFixed(1)

  if (evalBefore > 0 && evalAfter < 0) {
    return `Tu es passé d'une position gagnante à une position perdante (-${pawns} pions).`
  }
  if (evalBefore > 300 && evalAfter < 100) {
    return `Tu avais un gros avantage et tu l'as laissé filer (-${pawns} pions).`
  }
  if (delta >= 300) {
    return `Perte massive de ${pawns} pions d'évaluation.`
  }
  if (delta >= 100) {
    return `Perte significative de ${pawns} pions d'évaluation.`
  }
  return `Perte de ${pawns} pions d'évaluation.`
}

function buildFallbackExplanation(ctx: ExplanationContext): ExerciseExplanation {
  const theme = ctx.theme
  const themeLabel = theme ? THEME_LABELS[theme] : undefined

  let mistakeSummary: string
  let bestMoveReason: string
  let playedMoveWeakness: string
  let tip: string

  switch (ctx.mistakeType) {
    case 'TACTICAL_MISS':
      mistakeSummary = theme
        ? `Tu as raté une ${themeLabel!.toLowerCase()}. Le coup ${ctx.bestMoveSAN} exploitait une faille tactique.`
        : `Tu as raté un coup tactique. ${ctx.bestMoveSAN} gagnait du matériel.`
      bestMoveReason = `${ctx.bestMoveSAN} crée une menace concrète que l'adversaire ne peut pas parer.`
      playedMoveWeakness = `${ctx.playedMoveSAN} laisse passer l'opportunité tactique.`
      tip = 'Avant de jouer, cherche les échecs, captures et menaces forcées.'
      break
    case 'OPENING_DEVIATION':
      mistakeSummary = `Tu t'es écarté de la ligne principale en ouverture avec ${ctx.playedMoveSAN}.`
      bestMoveReason = `${ctx.bestMoveSAN} est le coup théorique qui maintient l'équilibre.`
      playedMoveWeakness = `${ctx.playedMoveSAN} donne un léger avantage à l'adversaire.`
      tip = 'Révise les lignes principales de tes ouvertures favorites.'
      break
    case 'ENDGAME_ERROR':
      mistakeSummary = `Erreur technique en finale. ${ctx.bestMoveSAN} était le coup précis.`
      bestMoveReason = `${ctx.bestMoveSAN} progresse vers la promotion ou le gain matériel.`
      playedMoveWeakness = `${ctx.playedMoveSAN} ralentit ou compromet ta conversion.`
      tip = 'En finale, chaque tempo compte. Calcule les courses de pions.'
      break
    case 'BLUNDER_POSITIONAL':
      mistakeSummary = `Blunder positionnel avec ${ctx.playedMoveSAN}.`
      bestMoveReason = `${ctx.bestMoveSAN} maintenait une structure solide et de l'activité.`
      playedMoveWeakness = `${ctx.playedMoveSAN} affaiblit ta position sans compensation.`
      tip = 'Évalue les conséquences positionnelles à long terme de chaque coup.'
      break
    default:
      mistakeSummary = `Imprécision avec ${ctx.playedMoveSAN}. ${ctx.bestMoveSAN} était plus précis.`
      bestMoveReason = `${ctx.bestMoveSAN} est légèrement plus précis dans cette position.`
      playedMoveWeakness = `${ctx.playedMoveSAN} est jouable mais pas optimal.`
      tip = 'Prends le temps de comparer tes candidats avant de jouer.'
  }

  return {
    mistakeSummary,
    bestMoveReason,
    playedMoveWeakness,
    tip,
    theme: theme ?? undefined,
    themeLabel,
    evalContext: buildEvalContext(ctx.evalBefore, ctx.evalAfter),
  }
}
