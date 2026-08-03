import { useEffect, useRef, type ReactNode } from 'react';
import { CloseIcon } from './Icons';

interface DialogProps {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  actions?: ReactNode;
  danger?: boolean;
}

export function Dialog({ open, title, children, onClose, actions, danger }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog ref={ref} className={`dialog ${danger ? 'dialog--danger' : ''}`} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => event.target === ref.current && onClose()}>
      <div className="dialog__surface">
        <header className="dialog__header">
          <h2>{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="Close dialog"><CloseIcon /></button>
        </header>
        <div className="dialog__body">{children}</div>
        {actions && <footer className="dialog__actions">{actions}</footer>}
      </div>
    </dialog>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}

export function ConfirmDialog({ open, title, description, confirmLabel, onConfirm, onCancel, danger }: ConfirmDialogProps) {
  return <Dialog open={open} title={title} onClose={onCancel} danger={danger} actions={<><button className="button button--quiet" onClick={onCancel}>Cancel</button><button className={`button ${danger ? 'button--danger' : 'button--primary'}`} onClick={onConfirm}>{confirmLabel}</button></>}><p>{description}</p></Dialog>;
}
