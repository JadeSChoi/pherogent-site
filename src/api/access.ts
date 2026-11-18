/**
 * Whether this deployment will accept a paid AI run right now, read from the
 * Worker's status route. Shared by every consented surface: the status call
 * also establishes the visitor session the paid routes require, and —
 * through apiFetch — carries the saved owner key, so it doubles as the key's
 * validity check.
 */

import { apiFetch } from "./ownerKey";

/** needsSignIn means the owner access key is the one thing missing;
 * signedIn means the saved key was accepted. */
export type CheckAccess = {
  canRun: boolean;
  message: string;
  needsSignIn: boolean;
  signedIn: boolean;
};

export async function readCheckAccess({
  fetchImpl = apiFetch,
}: { fetchImpl?: typeof fetch } = {}): Promise<CheckAccess> {
  try {
    const response = await fetchImpl("/api/agent/status");
    const status = (await response.json()) as {
      canRun?: boolean;
      message?: string;
      needsSignIn?: boolean;
      signedIn?: boolean;
    };
    return {
      canRun: status.canRun === true,
      message:
        typeof status.message === "string" && status.message
          ? status.message
          : "The AI connection did not report a status message.",
      needsSignIn: status.needsSignIn === true,
      signedIn: status.signedIn === true,
    };
  } catch {
    return {
      canRun: false,
      message: "The AI connection could not be reached. No request was sent.",
      needsSignIn: false,
      signedIn: false,
    };
  }
}
