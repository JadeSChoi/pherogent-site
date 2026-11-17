// The Worker entry wrangler deploys. The app itself lives in plain ESM so the
// Node test suites can run against the identical fetch handler.
import app from "./app.mjs";

export default app;
