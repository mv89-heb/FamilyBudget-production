import type { ReactNode } from "react";

type EmptyStateProps = {
  title: string;
  description: string;
  action?: { label: string; href: string };
  icon?: ReactNode;
};

export function EmptyState({ title, description, action, icon }: EmptyStateProps) {
  return (
    <section className="financial-empty-state" aria-live="polite">
      {icon ? <div className="financial-empty-icon" aria-hidden="true">{icon}</div> : null}
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
        {action ? <a className="secondary-button financial-empty-action" href={action.href}>{action.label}</a> : null}
      </div>
    </section>
  );
}

export function NoHistoryState({ title = "אין עדיין מספיק היסטוריה", description = "ככל שיצטברו נתונים אמיתיים, נוכל להציג מגמות ותחזיות אמינות יותר." }: Pick<EmptyStateProps, "title" | "description">) {
  return <EmptyState title={title} description={description} />;
}
