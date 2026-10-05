import React from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** Body copy explaining the consequence of the action. */
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles the confirm action as destructive. */
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  testId?: string;
}

/** Blocking confirmation dialog used before destructive note/folder actions. */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = true,
  busy = false,
  onConfirm,
  onCancel,
  testId = 'confirm-dialog',
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onCancel}
      title={title}
      variant="centered"
      size="sm"
      closeOnBackdrop={!busy}
      disableEscape={busy}
      showCloseButton={!busy}
      testId={testId}
      className="text-center"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onCancel} disabled={busy} testId={`${testId}-cancel`}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? 'danger' : 'primary'}
            onClick={onConfirm}
            loading={busy}
            testId={`${testId}-confirm`}
          >
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <div className="text-sm text-text-muted">{message}</div>
    </Modal>
  );
}

export default ConfirmDialog;