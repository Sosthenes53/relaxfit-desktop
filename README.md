# RelaxFit Desktop

Uma aplicação web moderna para análise de composição corporal via Bluetooth, desenvolvida com React, TypeScript e Web Bluetooth API.

## 🚀 Funcionalidades

- **Conexão Bluetooth**: Integração com balanças inteligentes via Web Bluetooth API
- **Protocolos Suportados**: FFB0 (Relaxmedic-2305), Yolanda/QN e outros protocolos BLE
- **Análise em Tempo Real**: Peso e composição corporal (8 pontos BIA)
- **Interface Responsiva**: Design moderno com acessibilidade
- **Armazenamento Local**: IndexedDB para dados persistentes
- **Gráficos e Histórico**: Visualização de tendências e histórico de medições
- **Relatórios PDF**: Geração de relatórios detalhados
- **Perfis Múltiplos**: Suporte a diferentes usuários

## 🛠️ Tecnologias

- **Frontend**: React 18 + TypeScript + Vite
- **Estado**: Zustand
- **Roteamento**: React Router v6
- **Estilização**: Tailwind CSS
- **Bluetooth**: Web Bluetooth API
- **Banco de Dados**: IndexedDB (idb)
- **Gráficos**: Recharts
- **Validação**: Zod
- **Build**: Vite

## 📋 Pré-requisitos

- Node.js 18+
- Navegador com suporte a Web Bluetooth API (Chrome recomendado)
- Balança inteligente compatível

## 🚀 Instalação e Execução

```bash
# Clone o repositório
git clone https://github.com/Sosthenes53/relaxfit-desktop.git
cd relaxfit-desktop

# Instale as dependências
npm install

# Execute em modo desenvolvimento
npm run dev

# Build para produção
npm run build
```

## 📱 Uso

1. **Configuração Inicial**:
   - Crie um perfil com seus dados (altura, idade, sexo)
   - Permita acesso ao Bluetooth quando solicitado

2. **Conexão com Balança**:
   - Clique em "Medir" na navegação
   - Selecione o modo de busca (todos os dispositivos ou só balanças)
   - Clique em "Procurar Balança"

3. **Medição**:
   - Posicione-se na balança
   - Aguarde a medição completa (peso + composição corporal)
   - Visualize os resultados na tela de resultado

4. **Histórico e Análises**:
   - Acesse "Histórico" para ver medições anteriores
   - Use o "Dashboard" para visualizar tendências
   - Gere relatórios PDF detalhados

## 🔧 Desenvolvimento

### Estrutura do Projeto

```
src/
├── components/     # Componentes reutilizáveis
├── pages/         # Páginas da aplicação
├── services/      # Serviços (BLE, DB, Decoder)
├── store/         # Estado global (Zustand)
├── types/         # Definições TypeScript
├── utils/         # Utilitários
└── hooks/         # Hooks customizados
```

### Scripts Disponíveis

- `npm run dev` - Servidor de desenvolvimento
- `npm run build` - Build para produção
- `npm run preview` - Preview do build
- `npm run lint` - Verificação de código

## 🤝 Contribuição

1. Fork o projeto
2. Crie uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

## 📄 Licença

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.

## 🙏 Agradecimentos

- Desenvolvido para análise de composição corporal precisa
- Compatível com balanças inteligentes modernas
- Interface acessível e intuitiva

## 📞 Suporte

Para dúvidas ou problemas, abra uma issue no GitHub ou entre em contato.

---

**Nota**: Esta aplicação requer um navegador com suporte à Web Bluetooth API. Chrome/Chromium é recomendado para melhor compatibilidade.