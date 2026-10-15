# claude-mods

Mod `chat-cost` para o Claude Code: mostra na status line, sempre que atualiza, o gasto do chat.

```
$1.23 · ↓850.0k entrada · ↑12.3k saída · ctx 42% (84k/200k) · último turno 18s · agentes: 2×opus 1×sonnet
```

- **Custo em US$:** total do chat inteiro (o mesmo do `/cost`).
- **Tokens de entrada/saída:** somados desde que o mod carregou; entrada inclui leitura/escrita de cache.
- **Contexto:** % e tokens da janela; aviso ao passar de 70%.
- **Último turno:** duração da última resposta do chat principal.
- **Agentes:** modelo dos agentes em execução (pode aparecer `?` até o primeiro turno do agente).
- Atualiza a cada chamada de ferramenta, a cada agente criado e no fim de cada resposta.

## Instalar

No prompt de uma sessão do Claude Code:

```
/plugin install chat-cost --marketplace MadCrow69/claude-mods
```

Pelo shell:

```
claude plugin install chat-cost --marketplace MadCrow69/claude-mods
```

Responda `y` para adicionar o marketplace e escolha o escopo (usuário = vale para todos os chats).
