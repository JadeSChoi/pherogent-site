import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "./Button";
import "./dialog.css";

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
};

export function Dialog({ open, onClose, title, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="ui-dialog"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="ui-dialog-head">
        <h2 className="ui-dialog-title">{title}</h2>
        <Button variant="link" aria-label="Close" onClick={onClose}>
          ×
        </Button>
      </div>
      <div className="ui-dialog-body">{children}</div>
    </dialog>
  );
}
