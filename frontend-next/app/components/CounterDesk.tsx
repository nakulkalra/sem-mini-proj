'use client';

import { Info } from 'lucide-react';
import { useState } from 'react';
import type { Window as QueueWindow } from '../hooks/useQueueSimulation';

interface CounterDeskProps {
  window: QueueWindow;
  mode: 'manual' | 'auto';
  timerState?: { cur: number; max: number; is_calling?: boolean };
  onServe: (wid: number) => void;
  onToggle: (wid: number, isOffline: boolean) => void;
  onDelete: (wid: number) => void;
}

export function CounterDesk({
  window: w,
  mode,
  timerState,
  onServe,
  onToggle,
  onDelete,
}: CounterDeskProps) {
  const pct = timerState && timerState.max > 0
    ? Math.max(0, Math.min(100, 100 - (timerState.cur / timerState.max) * 100))
    : 0;

  const [showInfo, setShowInfo] = useState(false);
  const timeLeft = timerState ? timerState.cur : null;

  return (
    <div
      id={`cdesk-${w.window_id}`}
      className={[
        'counter-desk',
        w.type === 'vip' ? 'vip-theme' : '',
        w.is_offline ? 'is-offline' : '',
      ].filter(Boolean).join(' ')}
    >
      {/* Time-saved badge */}
      {w.time_saved > 0 && (
        <div className="time-saved-badge visible">
          ↑ Saved {w.time_saved}s
        </div>
      )}

      {/* Header: name + info + delete */}
      <div className="desk-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="desk-name">{w.name}</span>
          <button
            className="desk-info-btn"
            onClick={() => setShowInfo(!showInfo)}
            title="Desk Details"
          >
            <Info size={14} />
          </button>
        </div>
        <button
          className="desk-delete-btn"
          onClick={() => onDelete(w.window_id)}
          title="Remove desk"
        >
          ×
        </button>
      </div>

      {/* Detailed Info Overlay */}
      {showInfo && (
        <div className="desk-info-overlay">
          <div className="info-section">
            <h4>Supported Services</h4>
            <div className="info-list">
              {w.services.map(s => <span key={s}>{s}</span>)}
            </div>
          </div>
          <div className="info-section">
            <h4>Stats</h4>
            <div className="info-metrics">
              <div><span>Time Saved:</span> <strong>{w.time_saved}s</strong></div>
              <div><span>Queue Load:</span> <strong>{w.queue_length}</strong></div>
              <div><span>Total Wait:</span> <strong>{w.total_wait}s</strong></div>
            </div>
          </div>
        </div>
      )}

      {/* Service tags */}
      <div className="service-tags">
        {w.services.map(s => (
          <span key={s} className="svc-tag">
            {s.split(' ')[0]}
          </span>
        ))}
      </div>

      {/* Serving slot */}
      <div className="serving-slot">
        <span className="serving-slot-label">
          {w.current ? '' : 'IDLE'}
        </span>
      </div>

      {/* Online / Offline toggle */}
      <button
        className={`status-btn${w.is_offline ? ' offline' : ''}`}
        onClick={() => onToggle(w.window_id, !w.is_offline)}
      >
        {w.is_offline ? '🔴 Offline' : '🟢 Online'}
      </button>

      {/* Progress bar */}
      {!w.is_offline && (
        <>
          <div className="progress-label">
            <span style={{ color: timerState?.is_calling ? 'var(--danger)' : 'inherit' }}>
              {timerState?.is_calling ? 'Awaiting Check-in' : 'Est. Time'}
            </span>
            <span style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 700, color: timerState?.is_calling ? 'var(--danger)' : 'inherit' }}>
              {timeLeft !== null && timerState ? `${timeLeft}s` : '--'}
            </span>
          </div>
          <div className="progress-track" style={{ background: timerState?.is_calling ? 'rgba(220,38,38,0.15)' : 'rgba(0,0,0,0.08)' }}>
            <div
              className={`progress-fill`}
              style={{ 
                width: `${pct}%`,
                background: timerState?.is_calling ? 'linear-gradient(90deg, var(--danger), #fca5a5)' : undefined 
              }}
            />
          </div>
        </>
      )}

      {/* Serve next (manual mode only) */}
      {mode === 'manual' && (
        <button
          className="btn btn-primary btn-full"
          style={{ marginTop: 4, fontSize: 13 }}
          onClick={() => onServe(w.window_id)}
          disabled={w.is_offline || !w.current}
        >
          Serve Next
        </button>
      )}
    </div>
  );
}
