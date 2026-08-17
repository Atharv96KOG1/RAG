import { useEffect, useRef, useState } from "react";
import { Sidebar } from "./components/layout/Sidebar";
import { ErrorBanner } from "./components/layout/ErrorBanner";
import { ChatWindow } from "./components/chat/ChatWindow";
import { ChatInput } from "./components/chat/ChatInput";
import { PdfPreviewModal } from "./components/chat/PdfPreviewModal";
import { GraphView } from "./components/graph/GraphView";
import { useDocuments } from "./hooks/useDocuments";
import { useChat } from "./hooks/useChat";
import { useGraph } from "./hooks/useGraph";
import { MAX_ACTIVE_DOCUMENTS } from "./constants";
import type { SourceCitation } from "./types";

function App() {
  const docs = useDocuments();
  const chat = useChat();
  const graph = useGraph();

  const [selected, setSelected] = useState<string[]>([]);
  const [tab, setTab] = useState<"chat" | "graph">("chat");
  const [preview, setPreview] = useState<SourceCitation | null>(null);
  const initializedFromServer = useRef(false);

  // Seed local selection from whatever the backend already had active (e.g. after
  // a page refresh) exactly once, the first time the document list loads.
  useEffect(() => {
    if (!initializedFromServer.current && docs.activeHashes.length > 0) {
      setSelected(docs.activeHashes);
      initializedFromServer.current = true;
    }
  }, [docs.activeHashes]);

  useEffect(() => {
    if (selected.length > 0) {
      docs.activate(selected);
      chat.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const toggle = (hash: string) => {
    setSelected((prev) => {
      if (prev.includes(hash)) return prev.filter((h) => h !== hash);
      if (prev.length >= MAX_ACTIVE_DOCUMENTS) return prev;
      return [...prev, hash];
    });
  };

  const remove = (hash: string) => {
    setSelected((prev) => prev.filter((h) => h !== hash));
    docs.remove(hash);
  };

  // Refresh the graph tab when it's opened, and again after every chat reply (the last
  // query's touched-node highlighting changes each time — see backend state.touched_box).
  useEffect(() => {
    if (tab === "graph") graph.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, chat.messages.length]);

  const activeNames = docs.documents.filter((d) => selected.includes(d.hash)).map((d) => d.filename);
  const hasActiveDocuments = selected.length > 0 && docs.activeMetadata !== null && !docs.activating;
  const error = docs.error ?? chat.error;
  const dismissError = () => {
    docs.clearError();
    chat.clearError();
  };

  return (
    <div className="flex h-screen" style={{ background: "var(--bg)" }}>
      <Sidebar
        documents={docs.documents}
        selected={selected}
        activeNames={activeNames}
        activeMetadata={docs.activeMetadata}
        uploading={docs.uploading}
        activating={docs.activating}
        onUpload={docs.upload}
        onToggle={toggle}
        onRemove={remove}
      />

      <main className="flex flex-1 flex-col" style={{ background: "var(--bg)" }}>
        <header
          className="flex h-14 shrink-0 items-center gap-4 border-b px-5"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          <div className="flex shrink-0 items-center gap-1 rounded-lg p-1" style={{ background: "var(--surface-2)" }}>
            {(["chat", "graph"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors"
                style={{
                  background: tab === t ? "var(--surface)" : "transparent",
                  color: tab === t ? "var(--ink)" : "var(--muted)",
                  boxShadow: tab === t ? "var(--shadow-sm)" : "none",
                }}
              >
                {t}
              </button>
            ))}
          </div>

          {hasActiveDocuments ? (
            <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto">
              {activeNames.map((name) => (
                <span
                  key={name}
                  className="shrink-0 truncate rounded-full px-2.5 py-1 text-xs font-medium"
                  style={{ background: "var(--accent-soft)", color: "var(--accent)", maxWidth: 220 }}
                  title={name}
                >
                  {name}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-sm font-medium" style={{ color: "var(--muted)" }}>
              No active documents
            </span>
          )}
        </header>

        {error && <ErrorBanner message={error} onDismiss={dismissError} />}

        {tab === "chat" ? (
          <>
            <ChatWindow
              messages={chat.messages}
              sending={chat.sending}
              hasActiveDocuments={hasActiveDocuments}
              hasDocuments={docs.documents.length > 0}
              onPreview={setPreview}
            />
            <ChatInput onSend={chat.send} disabled={!hasActiveDocuments} sending={chat.sending} />
          </>
        ) : (
          <GraphView data={graph.data} loading={graph.loading} error={graph.error} />
        )}
      </main>

      {preview?.doc_hash && (
        <PdfPreviewModal
          docHash={preview.doc_hash}
          filename={preview.source_file ?? "Document"}
          page={preview.page}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}

export default App;
