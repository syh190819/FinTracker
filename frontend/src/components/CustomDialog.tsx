import React, { useCallback, useRef } from 'react';
import { Modal } from 'antd';

type DialogMode = 'alert' | 'confirm' | 'prompt';

interface Params {
  mode: DialogMode;
  title: string;
  message: string;
  defaultValue?: string;
}

/**
 * CustomDialog — Ant Design Modal wrapper replacing finance_tracker.html's
 * custom dialog overlay. Supports alert / confirm / prompt modes.
 *
 * Usage: const ok = await showDialog({ mode: 'confirm', title:'...', message:'...' })
 */
export function useDialog() {
  const [open, setOpen] = React.useState(false);
  const paramsRef = useRef<Params>({ mode: 'alert', title: '', message: '' });
  const resolveRef = useRef<((v: boolean | string | null) => void) | null>(null);
  const [inputVal, setInputVal] = React.useState('');

  const showDialog = useCallback((p: Params): Promise<boolean | string | null> => {
    paramsRef.current = p;
    setInputVal(p.defaultValue || '');
    setOpen(true);
    return new Promise(resolve => {
      resolveRef.current = resolve;
    });
  }, []);

  const handleOk = useCallback(() => {
    setOpen(false);
    if (paramsRef.current.mode === 'prompt') {
      resolveRef.current?.(inputVal);
    } else {
      resolveRef.current?.(true);
    }
  }, [inputVal]);

  const handleCancel = useCallback(() => {
    setOpen(false);
    resolveRef.current?.(null);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && paramsRef.current.mode === 'prompt') {
      handleOk();
    }
  }, [handleOk]);

  const params = paramsRef.current;
  const dialog = (
    <Modal
      open={open}
      title={params.title}
      onOk={handleOk}
      onCancel={handleCancel}
      okText={params.mode === 'alert' ? '确定' : '确定'}
      cancelText="取消"
      destroyOnHidden
      centered
      width={420}
      style={{ textAlign: params.mode === 'prompt' ? 'left' : 'center' }}
    >
      <p style={{
        fontSize: 14,
        color: 'var(--text)',
        whiteSpace: 'pre-wrap',
        margin: 0,
        textAlign: 'center',
      }}>
        {params.message}
      </p>
      {params.mode === 'prompt' && (
        <input
          type="number"
          step="0.01"
          min="0"
          value={inputVal}
          onChange={e => setInputVal(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
          style={{
            marginTop: 'calc(12px * var(--S))',
            width: '100%',
            padding: 'calc(8px * var(--S)) calc(12px * var(--S))',
            border: '1px solid var(--border)',
            borderRadius: 4,
            fontSize: 14,
            textAlign: 'center',
          }}
        />
      )}
    </Modal>
  );

  return { showDialog, dialog };
}

/** Simple alert shorthand */
export function useAlert() {
  const d = useDialog();
  const alert = useCallback((msg: string, title?: string) =>
    d.showDialog({ mode: 'alert', title: title || '提示', message: msg }),
  [d]);
  return { alert, alertDialog: d.dialog };
}

export type ShowDialogFn = ReturnType<typeof useDialog>['showDialog'];
