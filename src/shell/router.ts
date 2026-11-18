/**
 * The app's three destinations as real paths (issue #19). The Worker
 * serves index.html for unknown paths (single-page-application fallback
 * in wrangler.jsonc), so deep links land here and unknown paths read as
 * the Overview.
 */

import { useEffect, useState } from "react";

export type Route = "overview" | "library" | "manuscript" | "usage";

export const ROUTES: readonly Route[] = [
  "overview",
  "library",
  "manuscript",
  "usage",
];

const PATHS: Record<Route, string> = {
  overview: "/",
  library: "/library",
  manuscript: "/manuscript",
  usage: "/usage",
};

export function pathFor(route: Route): string {
  return PATHS[route];
}

export function routeFromPath(pathname: string): Route {
  const clean = pathname.replace(/\/+$/, "") || "/";
  const found = ROUTES.find(
    (route) => route !== "overview" && PATHS[route] === clean,
  );
  return found ?? "overview";
}

/** The current route, kept in sync with the address bar both ways. The
 * address always shows the rendered route's own path: an unknown or
 * unclean deep link is rewritten in place to the route it lands on. */
export function useRoute(): { route: Route; navigate: (next: Route) => void } {
  const [route, setRoute] = useState<Route>(() =>
    routeFromPath(window.location.pathname),
  );

  useEffect(() => {
    const canonical = pathFor(routeFromPath(window.location.pathname));
    if (window.location.pathname !== canonical) {
      window.history.replaceState(null, "", canonical);
    }
    const read = () => setRoute(routeFromPath(window.location.pathname));
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);

  const navigate = (next: Route) => {
    if (window.location.pathname !== pathFor(next)) {
      window.history.pushState(null, "", pathFor(next));
    }
    setRoute(next);
  };

  return { route, navigate };
}
