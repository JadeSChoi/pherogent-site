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
  /** In-app navigation: called with the item's href instead of a page load. */
  onSelect?: (href: string) => void;
};

export function Nav({ label, items, onSelect }: NavProps) {
  return (
    <nav className="ui-nav" aria-label={label}>
      {items.map((item) => (
        <a
          key={item.href}
          href={item.href}
          className="ui-nav-item"
          aria-current={item.current ? "page" : undefined}
          onClick={
            onSelect &&
            ((event) => {
              // A modified or non-primary click keeps its browser meaning
              // (open in a new tab); only a plain click navigates in-app.
              if (
                event.defaultPrevented ||
                event.button !== 0 ||
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey
              ) {
                return;
              }
              event.preventDefault();
              onSelect(item.href);
            })
          }
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
