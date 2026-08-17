import { AlertIcon, CloseIcon } from "../icons";

export function ErrorBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div
      className="mx-4 mt-3 flex items-start gap-2.5 rounded-xl px-3.5 py-2.5 text-sm"
      style={{ background: "var(--danger-soft)", color: "var(--danger)" }}
    >
      <AlertIcon width={16} height={16} className="mt-0.5 shrink-0" />
      <span className="flex-1">{message}</span>
      <button onClick={onDismiss} className="shrink-0 rounded-md p-0.5 hover:bg-black/5" aria-label="Dismiss">
        <CloseIcon width={14} height={14} />
      </button>
    </div>
  );
}
