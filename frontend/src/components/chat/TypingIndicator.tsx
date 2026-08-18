import { SparkleIcon } from "../icons";

export function TypingIndicator() {
  return (
    <div className="message-in flex gap-3">
      <div
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
        style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
      >
        <SparkleIcon width={15} height={15} />
      </div>
      <div className="flex items-center gap-1.5 pt-2.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="typing-dot h-1.5 w-1.5 rounded-full"
            style={{ background: "var(--muted)", animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  );
}
