# Correções Pós-Avaliação

## URGENTE
- [x] `bleService.ts`: Implementar AbortController em todas as operações assíncronas
- [x] `useBluetooth.ts`: Adicionar cleanup no useEffect
- [x] Desconectar corretamente ao sair da página de medição

## ALTA
- [x] Adicionar `aria-label` em todos os botões
- [x] Garantir que elementos interativos sejam focáveis com Tab
- [x] Adicionar `role` adequada para listas e dialogs
- [ ] Testar com leitor de tela (NVDA/VoiceOver)

## MÉDIA
- [x] Implementar `React.memo` nos cards de histórico
- [x] Adicionar virtualização na lista de medições
- [x] Memoizar funções em componentes pesados

## BAIXA
- [x] Adicionar Zod schemas para validação de entrada BLE
- [x] Refinar tipos de estado (unions discriminadas)
- [ ] Adicionar logging estruturado (pino, winston ou console com níveis)