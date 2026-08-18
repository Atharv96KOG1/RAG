import type { DocumentMetadata } from "../../types";
import { FileIcon, ImageIcon, TableIcon, TextIcon } from "../icons";

interface Props {
  metadata: DocumentMetadata;
  activeNames: string[];
}

const FIELDS: [keyof DocumentMetadata, string, typeof FileIcon][] = [
  ["total_pages", "Pages", FileIcon],
  ["total_tables", "Tables", TableIcon],
  ["total_pictures", "Pictures", ImageIcon],
  ["total_text_blocks", "Text blocks", TextIcon],
];

export function StatsPanel({ metadata, activeNames }: Props) {
  return (
    <div className="border-t pt-3" style={{ borderColor: "var(--border)" }}>
      <p className="mb-2 truncate text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
        Stats · {activeNames.join(", ")}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {FIELDS.map(([key, label, Icon]) => (
          <div
            key={key}
            className="flex items-center gap-2 rounded-lg px-2.5 py-2"
            style={{ background: "var(--surface-2)" }}
          >
            <Icon width={14} height={14} style={{ color: "var(--muted)" }} className="shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-semibold tabular-nums leading-tight" style={{ color: "var(--ink)" }}>
                {metadata[key]}
              </div>
              <div className="truncate text-[0.68rem]" style={{ color: "var(--muted)" }}>
                {label}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
