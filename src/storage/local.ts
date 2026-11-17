import { importBackup } from "./backup";
import { createWorkspace, type Workspace } from "./workspace";

export const STORAGE_KEY = "pherogent-workspace-v3";

/**
 * Loads the workspace from browser storage. An unreadable stored value is
 * preserved under recovered.recovery on a fresh workspace (and so carried
 * into the next save and any export) rather than discarded.
 */
export function loadWorkspace(storage: Storage): Workspace {
  let raw: string | null = null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return createWorkspace();
  }
  if (raw == null) return createWorkspace();
  const result = importBackup(raw);
  if (result.ok) return result.workspace;
  const fresh = createWorkspace();
  fresh.recovered = { recovery: raw };
  return fresh;
}

/** Returns false when storage is unavailable or full. */
export function saveWorkspace(storage: Storage, workspace: Workspace): boolean {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(workspace));
    return true;
  } catch {
    return false;
  }
}
