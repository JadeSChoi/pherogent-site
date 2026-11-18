/**
 * The access section of a consent dialog, shared by every paid AI surface:
 * the deployment's own status line, the owner-key unlock when the key is
 * the one thing missing (issue #25), and the forget action when a saved key
 * was accepted. The key lives in session storage only — never in the
 * workspace or its backups — and rides along solely as an authorization
 * header via apiFetch.
 */

import { useState } from "react";
import { Button, TextInput } from "../ui";
import { readCheckAccess, type CheckAccess } from "./access";
import { clearOwnerKey, saveOwnerKey } from "./ownerKey";

type ConsentAccessProps = {
  /** The latest access read; undefined while one is in flight. */
  access: CheckAccess | undefined;
  onAccess: (access: CheckAccess | undefined) => void;
};

export function ConsentAccess({ access, onAccess }: ConsentAccessProps) {
  const [keyInput, setKeyInput] = useState("");
  const [keyNotice, setKeyNotice] = useState<string>();

  // A rejected key is cleared rather than kept for silent retries.
  const unlock = async () => {
    saveOwnerKey(keyInput);
    setKeyInput("");
    onAccess(undefined);
    const next = await readCheckAccess();
    if (!next.signedIn) {
      clearOwnerKey();
      setKeyNotice("The key was not accepted and was not kept. Check it and try again.");
    } else {
      setKeyNotice(undefined);
    }
    onAccess(next);
  };

  const forgetKey = async () => {
    clearOwnerKey();
    setKeyNotice(undefined);
    onAccess(undefined);
    onAccess(await readCheckAccess());
  };

  return (
    <>
      <p className="review-margin-hint" role="status">
        {access === undefined
          ? "Checking whether this deployment accepts a run…"
          : access.message}
      </p>
      {access?.needsSignIn && (
        <div className="evidence-check-unlock">
          <TextInput
            label="Owner access key"
            type="password"
            autoComplete="off"
            value={keyInput}
            hint="Kept in this tab's session storage only — never in your workspace or its backups — and sent solely as an authorization header."
            onChange={(event) => setKeyInput(event.currentTarget.value)}
          />
          <Button disabled={!keyInput.trim()} onClick={() => void unlock()}>
            Unlock AI runs
          </Button>
        </div>
      )}
      {access?.signedIn && (
        <p className="review-margin-hint">
          Runs are unlocked with your owner key, which rides along only as an
          authorization header on this request.{" "}
          <Button variant="link" onClick={() => void forgetKey()}>
            Forget owner key
          </Button>
        </p>
      )}
      {keyNotice && (
        <p className="review-notice" role="status">
          {keyNotice}
        </p>
      )}
    </>
  );
}
