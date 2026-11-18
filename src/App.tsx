import { AppShell } from "./shell/AppShell";
import { useWorkspace } from "./workspace/useWorkspace";

export function App() {
  return <AppShell {...useWorkspace()} />;
}
