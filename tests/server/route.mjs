// Every ported suite reaches the API through the same Hono fetch handler that
// deploys, not through the server functions directly. Test dependencies ride on
// the env object a test passes to app.fetch; a request can never supply them.
import app from '../../worker/app.mjs';

export const route = (request, env, dependencies) =>
  app.fetch(request, dependencies ? {...env, TEST_DEPENDENCIES: dependencies} : env);

// The legacy handler names are aliases of the one router so the ported suites
// keep their original call sites; the URL on each request picks the route.
export const getStatus = route;
export const runCheck = route;
export const runSectionChat = route;
export const handleStudyWorkflow = request => app.fetch(request, {});
