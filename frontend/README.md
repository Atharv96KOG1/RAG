# Frontend

React + TypeScript + Vite UI for the Document RAG backend.

## Structure

```
frontend/
  src/
    api/           # fetch wrapper + typed calls (documents.ts, chat.ts)
    types/         # shared TypeScript types matching backend schemas
    hooks/         # useDocuments, useChat — state + API orchestration
    components/
      layout/       # Sidebar, ErrorBanner
      documents/    # Uploader, List, StatsPanel
      chat/         # ChatWindow, MessageBubble, ChatInput, TypingIndicator, EmptyState
    App.tsx
    main.tsx
    index.css       # Tailwind v4 + design tokens (light/dark aware)
```

## Run

```bash
npm install
cp .env.example .env   # set VITE_API_URL if backend isn't on localhost:8000
npm run dev
```

## Build / lint

```bash
npm run build   # tsc -b && vite build
npm run lint     # oxlint
```
