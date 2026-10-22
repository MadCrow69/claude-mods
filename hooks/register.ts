import type { EngineInterface, Register } from 'claude-code'

const WARN_PERCENT = 70

type State = {
  // Acumulado desde que o mod carregou (um reload zera os tokens; o custo em US$ é do chat inteiro).
  input: number
  output: number
  startedAt: number
  lastSeconds: number | null
  isWarned: boolean
  // agentId -> modelo que respondeu por último naquele agente.
  modelOf: Map<string, string>
}

const fmt = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)

const fmtK = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n))

const short = (model: string) => /opus|sonnet|haiku|fable/i.exec(model)?.[0].toLowerCase() ?? model

// Declarada no topo do arquivo: o motor só aceita repassar `$` para funções assim.
async function refresh($: EngineInterface, s: State) {
  const { cost, context } = await $.session.usage()
  // Custo e tokens vêm primeiro; o resto só complementa.
  const parts = [`$${cost.usd.toFixed(2)}`, `↓${fmt(s.input)} entrada`, `↑${fmt(s.output)} saída`]

  if (context.percent !== undefined && context.tokens !== undefined) {
    parts.push(`ctx ${context.percent}% (${fmtK(context.tokens)}/${fmtK(context.window)})`)

    if (context.percent >= WARN_PERCENT && !s.isWarned) {
      s.isWarned = true
      $.ui.toast(`Contexto em ${context.percent}% — considere /compact ou novo chat`)
    }
    if (context.percent < WARN_PERCENT) s.isWarned = false
  }

  if (s.lastSeconds !== null) parts.push(`último turno ${s.lastSeconds}s`)

  const running = (await $.agent.list()).filter(a => a.status === 'running')
  if (running.length > 0) {
    const count = new Map<string, number>()
    for (const a of running) {
      const model = short(s.modelOf.get(a.id) ?? '?')
      count.set(model, (count.get(model) ?? 0) + 1)
    }
    parts.push(`agentes: ${[...count].map(([m, n]) => `${n}×${m}`).join(' ')}`)
  }

  $.ui.status(parts.join(' · '))
}

export const register: Register = on => {
  const s: State = {
    input: 0,
    output: 0,
    startedAt: 0,
    lastSeconds: null,
    isWarned: false,
    modelOf: new Map(),
  }

  on('prompt.submit', async ($, e, next) => {
    s.startedAt = await $.clock.now()
    return next(e)
  })

  // Atualiza a cada chamada de ferramenta, durante a resposta.
  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    await refresh($, s)
    return ran
  })

  // Mostra o agente assim que nasce, com o modelo pedido (se o spawn disse qual).
  on('agent.spawn', async ($, e, next) => {
    const result = await next(e)
    if (result.agentId && e.model) s.modelOf.set(result.agentId, e.model)
    await refresh($, s)
    return result
  })

  // Fecha o turno: soma tokens, grava o modelo real do agente e a duração do turno principal.
  on('turn.complete', async ($, e, next) => {
    if (e.usage) {
      s.input +=
        e.usage.input_tokens + e.usage.cache_read_input_tokens + e.usage.cache_creation_input_tokens
      s.output += e.usage.output_tokens
      if (e.agentId) s.modelOf.set(e.agentId, e.usage.model)
    }
    if (!e.agentId) s.lastSeconds = Math.round(((await $.clock.now()) - s.startedAt) / 1000)

    await refresh($, s)
    return next(e)
  })
}
