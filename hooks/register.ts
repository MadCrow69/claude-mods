import type { Register } from 'claude-code'

const WARN_PERCENT = 70

const fmt = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)

const fmtK = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n))

const short = (model: string) => /opus|sonnet|haiku|fable/i.exec(model)?.[0].toLowerCase() ?? model

export const register: Register = on => {
  // Acumulado desde que o mod carregou (um reload zera os tokens; o custo em US$ é do chat inteiro).
  let input = 0
  let output = 0
  let startedAt = 0
  let lastSeconds: number | null = null
  let isWarned = false
  // agentId -> modelo que respondeu por último naquele agente.
  const modelOf = new Map<string, string>()

  const refresh = async ($: Parameters<Parameters<typeof on>[2]>[0]) => {
    const { cost, context } = await $.session.usage()
    // Custo e tokens vêm primeiro; o resto só complementa.
    const parts = [`$${cost.usd.toFixed(2)}`, `↓${fmt(input)} entrada`, `↑${fmt(output)} saída`]

    if (context.percent !== undefined && context.tokens !== undefined) {
      parts.push(`ctx ${context.percent}% (${fmtK(context.tokens)}/${fmtK(context.window)})`)

      if (context.percent >= WARN_PERCENT && !isWarned) {
        isWarned = true
        $.ui.toast(`Contexto em ${context.percent}% — considere /compact ou novo chat`)
      }
      if (context.percent < WARN_PERCENT) isWarned = false
    }

    if (lastSeconds !== null) parts.push(`último turno ${lastSeconds}s`)

    const running = (await $.agent.list()).filter(a => a.status === 'running')
    if (running.length > 0) {
      const count = new Map<string, number>()
      for (const a of running) {
        const model = short(modelOf.get(a.id) ?? '?')
        count.set(model, (count.get(model) ?? 0) + 1)
      }
      parts.push(`agentes: ${[...count].map(([m, n]) => `${n}×${m}`).join(' ')}`)
    }

    $.ui.status(parts.join(' · '))
  }

  on('prompt.submit', async ($, e, next) => {
    startedAt = await $.clock.now()
    return next(e)
  })

  // Atualiza a cada chamada de ferramenta, durante a resposta.
  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    await refresh($)
    return ran
  })

  // Mostra o agente assim que nasce, com o modelo pedido (se o spawn disse qual).
  on('agent.spawn', async ($, e, next) => {
    const result = await next(e)
    if (result.agentId && e.model) modelOf.set(result.agentId, e.model)
    await refresh($)
    return result
  })

  // Fecha o turno: soma tokens, grava o modelo real do agente e a duração do turno principal.
  on('turn.complete', async ($, e, next) => {
    if (e.usage) {
      input +=
        e.usage.input_tokens + e.usage.cache_read_input_tokens + e.usage.cache_creation_input_tokens
      output += e.usage.output_tokens
      if (e.agentId) modelOf.set(e.agentId, e.usage.model)
    }
    if (!e.agentId) lastSeconds = Math.round(((await $.clock.now()) - startedAt) / 1000)

    await refresh($)
    return next(e)
  })
}
