import { useEffect, useState } from "react";

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
    <main style={{ fontFamily: "system-ui, sans-serif", margin: "4rem auto", maxWidth: "40rem", padding: "0 1rem" }}>
      <h1>Pherogent</h1>
      <p>Evidence-first workspace for bio researchers. Rebuild in progress.</p>
      <h2>API status</h2>
      {error ? (
        <p role="alert">Status check failed: {error}</p>
      ) : status ? (
        <p>
          {status.service} is {status.ok ? "up" : "down"} · schema {status.schemaVersion}
        </p>
      ) : (
        <p>Checking…</p>
      )}
    </main>
  );
}
