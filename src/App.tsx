import { useState } from 'react';

const sections = [
  {
    id: 'editor',
    icon: '💻',
    title: 'Editor de Código',
    subtitle: 'VS Code & Extensões',
    content: {
      intro: 'O Visual Studio Code é o editor mais popular para desenvolvimento web. Configure-o para máxima produtividade.',
      items: [
        {
          title: 'Extensões Essenciais',
          description: 'Instale estas extensões para melhorar sua experiência:',
          list: [
            'ESLint — Linting de JavaScript/TypeScript',
            'Prettier — Formatação automática de código',
            'GitLens — Visualização avançada de Git',
            'Auto Rename Tag — Renomeia tags HTML automaticamente',
            'Live Server — Servidor de desenvolvimento local',
            'Thunder Client — Teste de APIs direto no editor',
            'Tailwind CSS IntelliSense — Autocomplete para Tailwind',
          ],
        },
        {
          title: 'Configurações Recomendadas',
          description: 'Adicione ao settings.json:',
          code: `{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit"
  },
  "editor.tabSize": 2,
  "editor.wordWrap": "on",
  "files.autoSave": "afterDelay",
  "editor.minimap.enabled": false
}`,
        },
      ],
    },
  },
  {
    id: 'tools',
    icon: '🛠️',
    title: 'Ferramentas Essenciais',
    subtitle: 'Node.js, Git & Package Managers',
    content: {
      intro: 'Tenha as ferramentas certas instaladas para um fluxo de trabalho eficiente.',
      items: [
        {
          title: 'Node.js & Version Manager',
          description: 'Use um version manager para gerenciar múltiplas versões do Node:',
          list: [
            'nvm (Linux/Mac) — Gerenciador de versões do Node',
            'nvm-windows — Versão para Windows',
            'fnm — Alternativa mais rápida escrita em Rust',
            'Volta — Gerenciador de ferramentas JavaScript',
          ],
          code: `# Instalando nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Instalando e usando Node.js LTS
nvm install --lts
nvm use --lts`,
        },
        {
          title: 'Git & GitHub',
          description: 'Configure o Git corretamente:',
          code: `# Configuração inicial
git config --global user.name "Seu Nome"
git config --global user.email "seu@email.com"
git config --global init.defaultBranch main
git config --global core.editor "code --wait"

# Aliases úteis
git config --global alias.st status
git config --global alias.co checkout
git config --global alias.br branch
git config --global alias.lg "log --oneline --graph --all"`,
        },
        {
          title: 'Package Managers',
          description: 'Escolha seu gerenciador de pacotes preferido:',
          list: [
            'npm — Padrão do Node.js, confiável',
            'yarn — Rápido, cache eficiente',
            'pnpm — Mais rápido, economiza disco',
            'bun — Ultra rápido, runtime + package manager',
          ],
        },
      ],
    },
  },
  {
    id: 'env',
    icon: '🔐',
    title: 'Variáveis de Ambiente',
    subtitle: 'Segurança & Configuração',
    content: {
      intro: 'Variáveis de ambiente são essenciais para manter dados sensíveis fora do código e configurar diferentes ambientes.',
      items: [
        {
          title: 'Arquivo .env',
          description: 'Crie arquivos .env para cada ambiente:',
          code: `# .env.development
VITE_API_URL=http://localhost:3000/api
VITE_APP_TITLE="Meu App (Dev)"

# .env.production
VITE_API_URL=https://api.meusite.com
VITE_APP_TITLE="Meu App"

# .env.local (ignorado pelo git)
VITE_API_KEY=sk-123456789
VITE_SECRET_TOKEN=token-secreto-aqui`,
        },
        {
          title: 'Regras de Segurança',
          description: 'Nunca commite dados sensíveis:',
          list: [
            'Adicione .env ao .gitignore',
            'Crie .env.example com valores de exemplo',
            'Use ferramentas como dotenv-safe para validação',
            'Nunca logue secrets no console',
            'Use serviços como Vault ou AWS Secrets Manager em produção',
          ],
        },
        {
          title: 'Acessando no Código',
          description: 'No Vite, use o prefixo VITE_:',
          code: `// Acessando variáveis no código
const apiUrl = import.meta.env.VITE_API_URL;
const appTitle = import.meta.env.VITE_APP_TITLE;

// Verificando ambiente
const isDev = import.meta.env.DEV;
const isProd = import.meta.env.PROD;`,
        },
      ],
    },
  },
  {
    id: 'project',
    icon: '📁',
    title: 'Organização de Projetos',
    subtitle: 'Estrutura & Convenções',
    content: {
      intro: 'Uma boa estrutura de pastas facilita a manutenção e o trabalho em equipe.',
      items: [
        {
          title: 'Estrutura Recomendada (React/Vite)',
          description: 'Organize seus arquivos de forma lógica:',
          code: `src/
├── components/       # Componentes reutilizáveis
│   ├── ui/          # Botões, inputs, cards
│   └── layout/      # Header, Footer, Sidebar
├── pages/           # Páginas da aplicação
├── hooks/           # Custom hooks
├── services/        # Chamadas de API
├── utils/           # Funções auxiliares
├── types/           # Tipos TypeScript
├── styles/          # Estilos globais
├── assets/          # Imagens, fontes
├── constants/       # Constantes da aplicação
└── App.tsx`,
        },
        {
          title: 'Convenções de Nomes',
          description: 'Siga padrões consistentes:',
          list: [
            'PascalCase — Componentes React (MyComponent.tsx)',
            'camelCase — Funções e variáveis (handleSubmit)',
            'kebab-case — Arquivos CSS (my-component.css)',
            'UPPER_SNAKE_CASE — Constantes (MAX_RETRIES)',
            'Prefixe hooks com "use" (useAuth, useFetch)',
          ],
        },
        {
          title: 'Arquivos de Configuração',
          description: 'Mantenha na raiz do projeto:',
          list: [
            '.gitignore — Ignorar arquivos desnecessários',
            '.env.example — Template de variáveis',
            'README.md — Documentação do projeto',
            'tsconfig.json — Configuração TypeScript',
            '.eslintrc — Regras de linting',
            '.prettierrc — Configuração do Prettier',
          ],
        },
      ],
    },
  },
  {
    id: 'workflow',
    icon: '⚡',
    title: 'Fluxo de Trabalho',
    subtitle: 'Git, CI/CD & Boas Práticas',
    content: {
      intro: 'Um bom fluxo de trabalho garante qualidade e consistência no desenvolvimento.',
      items: [
        {
          title: 'Git Flow',
          description: 'Adote um modelo de branching:',
          list: [
            'main — Código de produção (sempre estável)',
            'develop — Branch de desenvolvimento',
            'feature/* — Novas funcionalidades',
            'hotfix/* — Correções urgentes',
            'release/* — Preparação de releases',
          ],
          code: `# Criando uma feature branch
git checkout -b feature/nova-funcionalidade

# Commits convencionais
git commit -m "feat: adicionar login com OAuth"
git commit -m "fix: corrigir bug no formulário"
git commit -m "docs: atualizar README"
git commit -m "style: formatar código com Prettier"
git commit -m "refactor: simplificar lógica de autenticação"`,
        },
        {
          title: 'Scripts do package.json',
          description: 'Automatize tarefas comuns:',
          code: `{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "lint": "eslint . --ext ts,tsx",
    "lint:fix": "eslint . --ext ts,tsx --fix",
    "format": "prettier --write \\"src/**/*.{ts,tsx,css}\\"",
    "test": "vitest",
    "test:coverage": "vitest --coverage",
    "prepare": "husky install"
  }
}`,
        },
        {
          title: 'Checklist de Qualidade',
          description: 'Antes de fazer push, verifique:',
          list: [
            '✅ Código compila sem erros',
            '✅ Todos os testes passam',
            '✅ Linting não reporta problemas',
            '✅ Código formatado com Prettier',
            '✅ Sem console.log ou código comentado',
            '✅ README atualizado se necessário',
            '✅ Variáveis de ambiente documentadas',
          ],
        },
      ],
    },
  },
  {
    id: 'terminal',
    icon: '🖥️',
    title: 'Terminal & Shell',
    subtitle: 'Produtividade na Linha de Comando',
    content: {
      intro: 'Domine o terminal para ser mais produtivo no dia a dia.',
      items: [
        {
          title: 'Shells Modernos',
          description: 'Considere alternativas ao terminal padrão:',
          list: [
            'Zsh + Oh My Zsh — Altamente customizável',
            'Fish — Autocomplete inteligente por padrão',
            'Warp — Terminal moderno com IA (Mac/Linux)',
            'Windows Terminal — Terminal oficial do Windows',
          ],
        },
        {
          title: 'Aliases Úteis',
          description: 'Adicione ao seu .zshrc ou .bashrc:',
          code: `# Navegação rápida
alias ..="cd .."
alias ...="cd ../.."
alias projects="cd ~/projects"

# Git shortcuts
alias g="git"
alias gp="git push"
alias gl="git pull"
alias gc="git commit"
alias gco="git checkout"

# Desenvolvimento
alias dev="npm run dev"
alias build="npm run build"
alias serve="npx serve"

# Limpeza
alias clean="rm -rf node_modules dist .cache"`,
        },
        {
          title: 'Ferramentas CLI Essenciais',
          description: 'Instale estas ferramentas globais:',
          list: [
            'create-vite — Scaffolding de projetos',
            'typescript — Compilador TypeScript',
            'nodemon — Reinicia servidor automaticamente',
            'httpie — Cliente HTTP moderno',
            'jq — Processar JSON no terminal',
            'fzf — Busca fuzzy no terminal',
            'ripgrep — Busca de texto ultra rápida',
          ],
        },
      ],
    },
  },
];

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group">
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded opacity-0 group-hover:opacity-100 transition-opacity"
      >
        {copied ? '✓ Copiado!' : 'Copiar'}
      </button>
      <pre className="bg-gray-900 text-green-400 p-4 rounded-lg overflow-x-auto text-sm font-mono leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function SectionCard({
  section,
  isActive,
  onClick,
}: {
  section: (typeof sections)[0];
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-4 rounded-xl transition-all duration-300 border ${
        isActive
          ? 'bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border-indigo-500/50 shadow-lg shadow-indigo-500/10'
          : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
      }`}
    >
      <div className="flex items-center gap-3">
        <span className="text-2xl">{section.icon}</span>
        <div>
          <h3 className={`font-semibold ${isActive ? 'text-indigo-300' : 'text-gray-200'}`}>
            {section.title}
          </h3>
          <p className="text-xs text-gray-400">{section.subtitle}</p>
        </div>
      </div>
    </button>
  );
}

function ContentArea({ section }: { section: (typeof sections)[0] }) {
  return (
    <div className="animate-fadeIn">
      <div className="flex items-center gap-3 mb-6">
        <span className="text-4xl">{section.icon}</span>
        <div>
          <h2 className="text-2xl font-bold text-white">{section.content.intro}</h2>
        </div>
      </div>

      <div className="space-y-8">
        {section.content.items.map((item, idx) => (
          <div
            key={idx}
            className="bg-white/5 backdrop-blur-sm rounded-xl p-6 border border-white/10"
          >
            <h3 className="text-lg font-semibold text-indigo-300 mb-2">{item.title}</h3>
            <p className="text-gray-300 text-sm mb-4">{item.description}</p>

            {item.list && (
              <ul className="space-y-2">
                {item.list.map((listItem, listIdx) => (
                  <li key={listIdx} className="flex items-start gap-2 text-gray-300 text-sm">
                    <span className="text-indigo-400 mt-0.5">▸</span>
                    <span>{listItem}</span>
                  </li>
                ))}
              </ul>
            )}

            {item.code && <CodeBlock code={item.code} />}
          </div>
        ))}
      </div>
    </div>
  );
}

function App() {
  const [activeSection, setActiveSection] = useState(sections[0].id);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const currentSection = sections.find((s) => s.id === activeSection)!;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-indigo-950 text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-gray-950/80 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-xl">
              🚀
            </div>
            <div>
              <h1 className="text-lg font-bold">Organize seu Ambiente</h1>
              <p className="text-xs text-gray-400">Guia completo de desenvolvimento</p>
            </div>
          </div>
          <button
            className="md:hidden p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {mobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row gap-8">
          {/* Sidebar */}
          <aside
            className={`md:w-72 flex-shrink-0 ${
              mobileMenuOpen ? 'block' : 'hidden md:block'
            }`}
          >
            <nav className="sticky top-24 space-y-2">
              <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-3 px-4">
                Seções
              </p>
              {sections.map((section) => (
                <SectionCard
                  key={section.id}
                  section={section}
                  isActive={activeSection === section.id}
                  onClick={() => {
                    setActiveSection(section.id);
                    setMobileMenuOpen(false);
                  }}
                />
              ))}
            </nav>
          </aside>

          {/* Main Content */}
          <main className="flex-1 min-w-0">
            <ContentArea section={currentSection} />

            {/* Navigation */}
            <div className="flex justify-between mt-10 pt-6 border-t border-white/10">
              {sections.findIndex((s) => s.id === activeSection) > 0 && (
                <button
                  onClick={() => {
                    const idx = sections.findIndex((s) => s.id === activeSection);
                    setActiveSection(sections[idx - 1].id);
                  }}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition-colors text-sm"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Anterior
                </button>
              )}
              <div className="flex-1" />
              {sections.findIndex((s) => s.id === activeSection) < sections.length - 1 && (
                <button
                  onClick={() => {
                    const idx = sections.findIndex((s) => s.id === activeSection);
                    setActiveSection(sections[idx + 1].id);
                  }}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/30 transition-colors text-sm text-indigo-300"
                >
                  Próximo
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              )}
            </div>
          </main>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-white/10 mt-16">
        <div className="max-w-7xl mx-auto px-4 py-8 text-center text-gray-500 text-sm">
          <p>🚀 Organize seu ambiente, organize seu código.</p>
          <p className="mt-2">Feito com React + Vite + Tailwind CSS</p>
        </div>
      </footer>
    </div>
  );
}

export default App;
