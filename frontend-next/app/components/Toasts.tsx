'use client';

import { useEffect, useState } from 'react';

interface ToastItem {
  id: number;
  msg: string;
  type: string;
}

interface ToastsProps {
  toasts: ToastItem[];
}

export function Toasts({ toasts }: ToastsProps) {
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}

function ToastItem({ toast }: { toast: ToastItem }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(timer);
  }, []);

  return (
    <div className={`toast ${toast.type} ${visible ? 'show' : ''}`}>
      {toast.msg}
    </div>
  );
}
