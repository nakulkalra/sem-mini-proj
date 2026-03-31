'use client';

import { useRef } from 'react';
import { useQueueSimulation } from './hooks/useQueueSimulation';
import { Sidebar } from './components/Sidebar';
import { CounterDesk } from './components/CounterDesk';
import { AvatarFloor } from './components/AvatarFloor';
import { Toasts } from './components/Toasts';

export default function Home() {
  const sim = useQueueSimulation();
  const bankFloorRef = useRef<HTMLDivElement>(null);

  return (
    <div className="app-shell">

      {/* ── Error Overlay ── */}
      {sim.error && (
        <div className="error-overlay">
          <div className="error-modal">
            <div className="error-icon">⚠️</div>
            <h2>Connection Error</h2>
            <p>Backend not reachable on port 5000</p>
          </div>
        </div>
      )}

      {/* ── Toast Notifications ── */}
      <Toasts toasts={sim.toasts} />

      {/* ── Sidebar ── */}
      <Sidebar
        mode={sim.mode}
        speed={sim.speed}
        paused={sim.paused}
        stats={sim.stats}
        queueLength={sim.queueLength}
        onAddCustomer={sim.addCustomer}
        onSpawnRandom={sim.spawnRandom}
        onCreateDesk={sim.createDesk}
        onSetMode={sim.setMode}
        onSetSpeed={sim.setSpeed}
        onTogglePause={() => sim.setPaused(p => !p)}
        onReset={sim.resetAll}
      />

      {/* ── Main Floor ── */}
      <main className="main-floor">

        {/* Floor header bar */}
        <div className="floor-header">
          <span className="floor-title">
            🏦 Bank Floor — {sim.windows.length} Desk{sim.windows.length !== 1 ? 's' : ''} Active
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {sim.paused && (
              <span style={{
                fontSize: 11,
                fontWeight: 700,
                color: 'var(--gold)',
                background: 'rgba(245,158,11,0.12)',
                border: '1px solid rgba(245,158,11,0.25)',
                borderRadius: 20,
                padding: '5px 12px',
              }}>
                ⏸ PAUSED
              </span>
            )}
            <div className="live-badge">
              <div className="live-dot" />
              LIVE
            </div>
          </div>
        </div>

        {/* Scrollable bank floor */}
        <div className="bank-scroll">
          <div className="bank-floor" ref={bankFloorRef}>

            {/* Desks row */}
            <div className="counters-row">
              {sim.windows.length === 0 ? (
                <EmptyState />
              ) : (
                sim.windows.map(w => (
                  <CounterDesk
                    key={w.window_id}
                    window={w}
                    mode={sim.mode}
                    timerState={sim.counterTimers[w.window_id]}
                    onServe={sim.serveWindow}
                    onToggle={sim.toggleDesk}
                    onDelete={sim.deleteDesk}
                  />
                ))
              )}
            </div>

            {/* Animated avatar tokens */}
            <AvatarFloor windows={sim.windows} containerRef={bankFloorRef} />

          </div>
        </div>

      </main>
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
      padding: '80px 40px',
      color: 'var(--text-muted)',
      textAlign: 'center',
      width: '100%',
    }}>
      <div style={{ fontSize: 56, opacity: 0.3 }}>🏦</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-dim)' }}>No desks configured</div>
      <div style={{ fontSize: 13, maxWidth: 280, lineHeight: 1.6 }}>
        Use the <strong style={{ color: 'var(--text)' }}>New Desk</strong> section in the sidebar to add a service window.
      </div>
    </div>
  );
}
