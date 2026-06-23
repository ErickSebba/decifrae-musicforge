interface ModulePlaceholderProps {
  title: string;
  description: string;
}

/**
 * Layout temporário de um módulo ainda não implementado: título + descrição do que virá.
 * Usa os tokens de cor centralizados (src/index.css) — não introduzir cores locais.
 */
export function ModulePlaceholder({ title, description }: ModulePlaceholderProps) {
  return (
    <div className="flex flex-col gap-3 max-w-2xl">
      <h2 className="text-2xl font-semibold" style={{ color: "var(--color-text-primary)" }}>
        {title}
      </h2>
      <p className="text-sm leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
        {description}
      </p>
      <span
        className="text-xs uppercase tracking-widest mt-2"
        style={{ color: "var(--color-text-dim)" }}
      >
        Em construção
      </span>
    </div>
  );
}
