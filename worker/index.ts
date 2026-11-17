import { Hono } from "hono";

const app = new Hono<{ Bindings: Env }>();

app.get("/api/status", async (c) => {
  const row = await c.env.DB.prepare(
    "SELECT value FROM app_meta WHERE key = 'schema_version'",
  ).first<{ value: string }>();

  return c.json({
    ok: row !== null,
    service: "pherogent",
    schemaVersion: row?.value ?? "unknown",
  });
});

app.notFound((c) => c.json({ ok: false, error: "not_found" }, 404));

export default app;
