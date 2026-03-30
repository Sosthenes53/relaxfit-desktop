# Revisão Técnica Frontend — RelaxFit Desktop

**Data**: Março 2026  
**Escopo**: BLE memory leaks, acessibilidade, performance de listas, tipagem TS e tratamento de erros  
**Status**: Achados documentados com priorização e correções práticas

---

## 1. Vazamentos de Memória Relacionados ao BLE

### 🔴 Crítico: Timeout FFB0 não limpo em desconexão
- **Arquivo**: `src/pages/Connect.tsx`
- **Problema**: `ffbFallbackTimerRef` é criado com `setTimeout`, mas não é limpo em `handleDisconnect()` nem no cleanup do `useEffect` principal. Pode dispararação de salvamento tardio após desconexão/unmount, mantendo referências antigas.
- **Impacto**: Memory leak, ações assíncronas fora de contexto, possível duplo-save
- **Correção Prática**:
  ```tsx
  // Em handleDisconnect()
  if (ffbFallbackTimerRef.current) {
    clearTimeout(ffbFallbackTimerRef.current)
    ffbFallbackTimerRef.current = null
  }
  
  // No cleanup do useEffect
  return () => {
    if (ffbFallbackTimerRef.current) clearTimeout(ffbFallbackTimerRef.current)
    // ... demais cleanups
  }
  ```

### 🟡 Médio: Timer de retry em handleDiscovery sem cancelamento
- **Arquivo**: `src/pages/Connect.tsx` (line ~336)
- **Problema**: `setTimeout(() => attemptSendUserData(merged), 400)` não guarda o ID do timer nem cancela em unmount/reconnect. Pode executar com estado obsoleto (stale refs).
- **Impacto**: Duplicação de tentativas de envio de dados, refs antigas sendo acessadas
- **Correção Prática**:
  ```tsx
  const sendDataTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  
  const handleDiscovery = useCallback((chars: DiscoveredChar[]) => {
    // ...
    if (newChars.length > 0 || hasNewWritable) {
      if (sendDataTimerRef.current) clearTimeout(sendDataTimerRef.current)
      sendDataTimerRef.current = setTimeout(() => attemptSendUserData(merged), 400)
    }
  }, [attemptSendUserData])
  
  // No cleanup: limpar sendDataTimerRef.current
  ```

### 🟡 Médio: Hook useBluetooth re-subscrevendo desnecessariamente
- **Arquivo**: `src/hooks/useBluetooth.ts`
- **Problema**: Effect depende de `options.onDataReceived` e `options.onDiscovery`. Se callbacks mudarem de identidade por re-render, o hook desconecta/reconecta BLE inteiro (re-subscription churn).
- **Impacto**: Overhead de reconexão, perda de notificações, UX degradada
- **Correção Prática**:
  - Exigir `useCallback` estável no chamador (Connect.tsx já usa)
  - Ou estabilizar internamente com `useRef`: armazenar callbacks em refs e atualizar sem disparar effect

---

## 2. Acessibilidade

### 🔴 Crítico: Cards de perfil sem semântica de interação
- **Arquivo**: `src/pages/Home.tsx`
- **Problema**: Cards de perfil clicáveis são `<div onClick>` sem `role`, `tabIndex`, `onKeyDown` (Enter/Espaço). Usuários de teclado/leitor de tela perdem navegabilidade.
- **Impacto**: Não-conformidade WCAG 2.1 (nível A), exclusão de usuários assistivos
- **Correção Prática**:
  ```tsx
  // ❌ Antes
  <div onClick={() => navigate(`/settings/${profile.id}`)}>
    {profile.name}
  </div>
  
  // ✅ Depois
  <button
    onClick={() => navigate(`/settings/${profile.id}`)}
    aria-label={`Editar perfil ${profile.name}`}
  >
    {profile.name}
  </button>
  ```

### 🟡 Médio: Cabeçalho expansível em History com interação frágil
- **Arquivo**: `src/pages/History.tsx` (MeasurementItem)
- **Problema**: Header expansível usa `div role="button"` contendo outro `<button>` de excluir. Estrutura confusa para leitor de tela e foco previsível.
- **Impacto**: Navegação assistiva inconsistente, interação não-intuitiva
- **Correção Prática**:
  ```tsx
  // Separar areas clicáveis
  <div className="flex items-center justify-between">
    <button
      onClick={() => onToggle(id)}
      aria-expanded={expanded}
      aria-label={`${expanded ? 'Colapsar' : 'Expandir'} medição de ${date}`}
    >
      <ChevronDown /> {/* ícone muda com expanded */}
    </button>
    <button
      onClick={(e) => { e.stopPropagation(); onDelete(id); }}
      aria-label="Deletar medição"
    >
      <Trash2 />
    </button>
  </div>
  ```

### 🟡 Médio: Gráfico sem alternativa textual
- **Arquivo**: `src/components/MeasurementChart.tsx`
- **Problema**: Recharts não oferece alternativa textual/tabela para leitores de tela. Só visual.
- **Impacto**: Usuários de leitor de tela não acessam dados do gráfico
- **Correção Prática**:
  ```tsx
  <div>
    <Recharts.ResponsiveContainer>{/* gráfico */}</Recharts.ResponsiveContainer>
    <div
      role="region"
      aria-label="Dados do gráfico em formato tabular"
      className="mt-4 text-xs text-gray-600"
    >
      <table>
        <tr>
          <td>Data</td><td>Peso (kg)</td><td>Gordura (%)</td>
        </tr>
        {measurements.map(m => (
          <tr key={m.id}>
            <td>{new Date(m.timestamp).toLocaleDateString()}</td>
            <td>{m.weight}</td>
            <td>{m.fatPercent}</td>
          </tr>
        ))}
      </table>
    </div>
  </div>
  ```

---

## 3. Performance de Listas de Histórico

### 🟡 Médio: MeasurementItem memo com callbacks inline
- **Arquivo**: `src/pages/History.tsx`
- **Problema**: `MeasurementItem` está `React.memo`, mas recebe callbacks inline (`onToggle`, `onDelete`, `onViewReport`) recriadas a cada render do pai. Reduz benefício do memo em listas grandes.
- **Impacto**: Re-renderização desnecessária quando lista cresce (100+ itens → lag)
- **Correção Prática**:
  ```tsx
  // Em History.tsx
  const handleToggle = useCallback((id: string) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }))
  }, [])
  
  const handleDelete = useCallback((id: string) => {
    // delete logic
  }, [measurements, deleteMeasurement])
  
  const handleViewReport = useCallback((id: string) => {
    navigate(`/report/${id}`)
  }, [navigate])
  
  // Passar apenas ids como props
  <MeasurementItem
    measurement={m}
    isExpanded={expanded[m.id]}
    onToggle={handleToggle}  // ← agora estável
    onDelete={handleDelete}
    onViewReport={handleViewReport}
  />
  ```

### 🟡 Médio: Série de gráfico recalculada a cada render
- **Arquivo**: `src/components/MeasurementChart.tsx`
- **Problema**: `reverse().map()` da série é recalculado em toda renderização do gráfico, mesmo que `measurements` não mudou.
- **Impacto**: CPU desnecessária em gráficos frequentes
- **Correção Prática**:
  ```tsx
  const chartData = useMemo(() => {
    return measurements.slice().reverse().map(/* ... */)
  }, [measurements, field])
  
  return <LineChart data={chartData} /* ... */ />
  ```

### 🟢 Baixo: Chaves por índice em listas dinâmicas
- **Arquivo**: `src/pages/Connect.tsx` (linhas ~347, 352)
- **Problema**: `key={i}` em listas de diagnóstico e pacotes BLE piora reconciliação se itens mudam ordem/conteúdo.
- **Impacto**: Possível embaralhamento de foco/estado visual com listas grandes
- **Correção Prática**:
  ```tsx
  {packets.map((p, i) => (
    <div key={`${p.char}-${p.ts}-${p.bytes.length}`}>
      {/* content */}
    </div>
  ))}
  ```

### 🟢 Baixo: getMeasurements carrega tudo sem paginação
- **Arquivo**: `src/services/dbService.ts`
- **Problema**: Carrega e ordena em memória, degradação com histórico muito grande (1000+ itens).
- **Impacto**: Latência na primeira renderização de History
- **Correção Prática** (futuro):
  - Implementar paginação: `getMeasurements(profileId, limit, offset)`
  - Usar índice por timestamp no IndexedDB para ordenação eficiente

---

## 4. Tipagem TypeScript e Tratamento de Erros

### 🟡 Médio: Erros BLE capturados silenciosamente
- **Arquivo**: `src/services/bleService.ts` (múltiplas operações)
- **Problema**: Catch blocks vazios (`catch {}`) em `getCharacteristics`, `startNotifications`, `readValue`, etc. ocultam causa real e dificultam fallback/UX.
- **Impacto**: Usuário vê apenas "Failed to connect" genérico; desenvolvimento difícil
- **Correção Prática**:
  ```tsx
  try {
    await characteristic.startNotifications()
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[BLE] Notificações falharam:', msg)
    if (msg.includes('permission')) {
      statusCallback('permission_denied')
    } else if (msg.includes('unsupported')) {
      statusCallback('unsupported_notification')
    } else {
      statusCallback('error')
    }
    throw err // ou retornar status específico
  }
  ```

### 🟡 Médio: Ações assíncronas sem try/catch local
- **Arquivos**: `src/pages/Settings.tsx`, `src/pages/Home.tsx`, `src/pages/History.tsx`
- **Problema**: Operações async de persistência/export/delete sem try/catch local para feedback amigável (falha IndexedDB, quota, etc.).
- **Impacto**: Erro genérico ou crash silencioso ao usuário
- **Correção Prática**:
  ```tsx
  async function handleDelete(profileId: string) {
    try {
      setLoading(true)
      await deleteProfile(profileId)
      setError(null)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao deletar perfil'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }
  ```

### 🟢 Baixo: Non-null assertion sem fallback
- **Arquivo**: `src/pages/History.tsx` (linha com `find(...)!`)
- **Problema**: `!` assertion pode mascarar inconsistência futura de estado/tipo.
- **Impacto**: Crash potencial em produção
- **Correção Prática**:
  ```tsx
  const selected = measurements.find(m => m.id === selectedId)
  if (!selected) {
    return <div>Medição não encontrada</div>
  }
  // use case que renderiza com selected (type-safe agora)
  ```

### 🟢 Baixo: Payload BLE sem tipo discriminado
- **Arquivo**: `src/services/decoder.ts`
- **Problema**: Payload modelado como `number[]` sem tipo discriminado por `PacketKind`. Aumenta fragilidade de contratos TS.
- **Impacto**: Erro em runtime por acesso a índice inválido
- **Correção Prática** (futuro):
  ```tsx
  type WeightPayload = { kind: 'weight_realtime'; data: Uint8Array }
  type CompositionPayload = { kind: 'body_composition'; data: Uint8Array }
  type Payload = WeightPayload | CompositionPayload
  
  function decodePacket(payload: Payload): Measurement | null {
    switch (payload.kind) {
      case 'weight_realtime': 
        return decodeWeightPacket(payload.data)
      case 'body_composition':
        return decodeBodyPacket(payload.data)
    }
  }
  ```

---

## Resumo por Gravidade

| Gravidade | Contagem | Categor ias |
|-----------|----------|-----------|
| 🔴 Crítico | 2 | BLE memory + Home acessibilidade |
| 🟡 Médio | 7 | BLE timers, History UX, Chart data, Gráfico acessível, Errors |
| 🟢 Baixo | 4 | Chaves índice, Paginação, Non-null, Tipos discriminados |

---

## Roadmap de Correção

### Sprint 1 (Crítico)
1. ✅ Limpar `ffbFallbackTimerRef` em cleanup/disconnect
2. ✅ Converter cards Home para `<button>` semântico

### Sprint 2 (Médio Alto)
3. Timer em `handleDiscovery` com `sendDataTimerRef`
4. Callbacks `useCallback` em History + memoiza
5. Tabela alternativa em MeasurementChart

### Sprint 3 (Médio Baixo)
6. Try/catch em operações async em Settings/Home/History
7. Melhorar erros BLE com status específico

### Futuro
8. Paginação em dbService
9. Tipos discriminados em decoder.ts

---

## Validação

- ✅ `npm run build` — sem erros
- ✅ `git status --short` — reviews enfileirados
- ✅ Documentação de achados e correções práticas incluídos

---

**Próximo Passo**: Implementar correções críticas e médias em PRs temáticos (BLE → a, Acessibilidade → b, Performance → c, Erros → d).
