export type AttentionItem = {
  severity: "INFO" | "WARNING" | "CRITICAL";
  title: string;
  description: string;
  action?: { label: string; href: string };
};

type AttentionCardProps = {
  item: AttentionItem;
};

export function AttentionCard({ item }: AttentionCardProps) {
  const tone = item.severity === "CRITICAL" ? "critical" : item.severity === "WARNING" ? "warning" : "info";
  return (
    <article className={`financial-attention financial-attention-${tone}`}>
      <div>
        <span className="financial-attention-severity">{item.severity === "CRITICAL" ? "דורש טיפול" : item.severity === "WARNING" ? "כדאי לבדוק" : "לתשומת לב"}</span>
        <h3>{item.title}</h3>
        <p>{item.description}</p>
      </div>
      {item.action ? <a href={item.action.href}>{item.action.label} →</a> : null}
    </article>
  );
}
