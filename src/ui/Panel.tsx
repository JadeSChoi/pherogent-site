import type { ReactNode } from "react";
import "./panel.css";

type PanelProps = {
  title?: string;
  children: ReactNode;
};

export function Panel({ title, children }: PanelProps) {
  return (
    <section className="ui-panel">
      {title && <h2 className="ui-panel-title">{title}</h2>}
      <div className="ui-panel-body">{children}</div>
    </section>
  );
}
