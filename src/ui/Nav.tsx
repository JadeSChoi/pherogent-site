import "./nav.css";

export type NavItem = {
  label: string;
  href: string;
  count?: number | string;
  current?: boolean;
};

type NavProps = {
  label: string;
  items: NavItem[];
};

export function Nav({ label, items }: NavProps) {
  return (
    <nav className="ui-nav" aria-label={label}>
      {items.map((item) => (
        <a
          key={item.href}
          href={item.href}
          className="ui-nav-item"
          aria-current={item.current ? "page" : undefined}
        >
          {item.label}
          {item.count !== undefined && (
            <span className="ui-nav-count">{item.count}</span>
          )}
        </a>
      ))}
    </nav>
  );
}
