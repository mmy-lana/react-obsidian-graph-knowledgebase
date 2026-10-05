import React, { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

export interface PromptDialogProps {
  open: boolean;
  title: string;
  description?: React.ReactNode;
  label?: string;
  initialValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  /** Return `true` to allow confirmation; a string is shown as an error. */
  validate?: (value: string) => true | string;
  onConfirm: (value: string) => void | Promise<void>;
  onCancel: () => void;
  testId?: string;
}

/** Single-value prompt used for renaming notes and folders. */
export function PromptDialog({
  open,
  title,
  description,
  label = 'Name',
  initialValue = '',
  placeholder = 'New name…',
  confirmLabel = 'Save',
  cancelLabel = 'Cancel',
  busy = false,
  validate,
  onConfirm,
  onCancel,
  testId = 'prompt-dialog',
}: PromptDialogProps) {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setValue(initialValue);
      setError(null);
    }
  }, [open, initialValue]);

  const submit = () => {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      setError('Name cannot be empty');
      return;
    }

    const result = validate?.(trimmed);
    if (result !== undefined && result !== true) {
      setError(result);
      return;
    }

    void onConfirm(trimmed);
  };

  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onCancel}
      title={title}
      description={description}
      variant="bottom-sheet"
      size="sm"
      closeOnBackdrop={!busy}
      disableEscape={busy}
      showCloseButton={!busy}
      testId={testId}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onCancel} disabled={busy} testId={`${testId}-cancel`}>
            {cancelLabel}
          </Button>
          <Button
            variant="primary"
            onClick={submit}
            loading={busy}
            disabled={value.trim().length === 0}
            testId={`${testId}-confirm`}
          >
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <Input
        label={label}
        value={value}
        placeholder={placeholder}
        error={error ?? undefined}
        autoFocus
        data-autofocus
        data-testid={`${testId}-input`}
        onChange={(event) => {
          setValue(event.target.value);
          if (error) setError(null);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            submit();
          }
        }}
      />
    </Modal>
  );
}

export default PromptDialog;