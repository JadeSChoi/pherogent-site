// The HTTP surface of the Worker. This stays plain ESM so the Node test suites
// in tests/server/ can exercise the same fetch handler that deploys.
import { Hono } from "hono";
import { getStatus, runCheck, runSectionChat } from "./server/api.mjs";
import { handleStudyWorkflow } from "./server/study-workflow.mjs";

const app = new Hono();

// Optional dependency injection reaches handlers only through the env object a
// server test passes to app.fetch; bindings in a deployment never carry it, and
// nothing from the request can populate it.
const dependencies = (env) => env?.TEST_DEPENDENCIES ?? {};

app.get("/api/status", async (c) => {
  const row = await c.env.DB.prepare(
    "SELECT value FROM app_meta WHERE key = 'schema_version'",
  ).first();

  return c.json({
    ok: row !== null,
    service: "pherogent",
    schemaVersion: row?.value ?? "unknown",
  });
});

app.all("/api/agent/status", (c) => {
  if (c.req.method !== "GET") {
    return c.json(
      { error: { code: "method_not_allowed", message: "Use GET to read the status." } },
      405,
    );
  }
  return getStatus(c.req.raw, c.env, dependencies(c.env));
});

// These handlers enforce their own method/origin/content-type checks, so every
// method routes to them and a non-POST gets their 405 rather than a 404.
app.all("/api/check-claim", (c) => runCheck(c.req.raw, c.env, dependencies(c.env)));
app.all("/api/agent/chat", (c) => runSectionChat(c.req.raw, c.env, dependencies(c.env)));
app.all("/api/studies/run", (c) => handleStudyWorkflow(c.req.raw));

app.notFound((c) => c.json({ ok: false, error: "not_found" }, 404));

app.onError((error, c) => {
  console.error("unhandled error", error);
  return c.json({ ok: false, error: "internal_error" }, 500);
});

export default app;
