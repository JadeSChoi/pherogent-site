import { useEffect, useState } from "react";
import { Panel } from "./ui";

type Status = {
  ok: boolean;
  service: string;
  schemaVersion: string;
};

export function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/status")
      .then((response) => {
        if (!response.ok) throw new Error(`status ${response.status}`);
        return response.json() as Promise<Status>;
      })
      .then(setStatus)
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : String(cause)),
      );
  }, []);

  return (
    <main style={{ margin: "var(--space-7) auto", maxWidth: "40rem", padding: "0 var(--space-4)" }}>
      <h1>Pherogent</h1>
      <p>Evidence-first workspace for bio researchers. Rebuild in progress.</p>
      <Panel title="API status">
        {error ? (
          <p role="alert">Status check failed: {error}</p>
        ) : status ? (
          <p>
            {status.service} is {status.ok ? "up" : "down"}, schema {status.schemaVersion}
          </p>
        ) : (
          <p>Checking…</p>
        )}
      </Panel>
    </main>
  );
}
