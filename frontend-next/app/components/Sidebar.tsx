'use client';

import { useState } from 'react';

const SERVICES = [
  'Cash Deposit',
  'Cash Withdrawal',
  'Account Services',
  'Loan Inquiry',
  'Priority Service',
  'New Account',
];

const SERVICE_ICONS: Record<string, string> = {
  'Cash Deposit': '💵',
  'Cash Withdrawal': '💸',
  'Account Services': '📁',
  'Loan Inquiry': '🏡',
  'Priority Service': '⭐',
  'New Account': '🪪',
};

interface SidebarProps {
  mode: 'manual' | 'auto';
  speed: number;
  paused: boolean;
  stats: { total_served: number; avg_wait_seconds: number };
  queueLength: number;
  onAddCustomer: (service: string, isVIP: boolean) => void;
  onSpawnRandom: (count: number) => void;
  onCreateDesk: (name: string, services: string[]) => void;
  onSetMode: (m: 'manual' | 'auto') => void;
  onSetSpeed: (s: number) => void;
  onTogglePause: () => void;
  onReset: () => void;
}

export function Sidebar({
  mode, speed, paused, stats, queueLength,
  onAddCustomer, onSpawnRandom, onCreateDesk,
  onSetMode, onSetSpeed, onTogglePause, onReset,
}: SidebarProps) {
  const [selectedService, setSelectedService] = useState('Cash Deposit');
  const [isVIP, setIsVIP] = useState(false);
  const [randomCount, setRandomCount] = useState(1);
  const [deskName, setDeskName] = useState('');
  const [checkedServices, setCheckedServices] = useState<Set<string>>(new Set());

  const toggleService = (svc: string) => {
    setCheckedServices(prev => {
      const next = new Set(prev);
      next.has(svc) ? next.delete(svc) : next.add(svc);
      return next;
    });
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-inner">

        {/* Brand */}
        <div className="brand">
          <div className="brand-icon">🏦</div>
          <div>
            <div className="brand-title">SmartQueue</div>
            <div className="brand-sub">Bank Simulation</div>
          </div>
        </div>

        {/* Walk-in Client */}
        <div className="card">
          <div className="card-header">
            <span className="dot" />
            Walk-in Client
          </div>
          <div className="input-stack">
            <div className="spawn-row">
              <input
                type="number"
                className="count-input"
                value={randomCount}
                min={1}
                max={50}
                onChange={e => setRandomCount(Math.max(1, parseInt(e.target.value) || 1))}
              />
              <button
                className="btn btn-ghost btn-full"
                onClick={() => onSpawnRandom(randomCount)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="16 3 21 3 21 8" />
                  <line x1="4" y1="20" x2="21" y2="3" />
                  <polyline points="21 16 21 21 16 21" />
                  <line x1="15" y1="15" x2="21" y2="21" />
                </svg>
                Spawn Random
              </button>
            </div>

            <div className="divider">Manual Entry</div>

            <select
              className="select"
              value={selectedService}
              onChange={e => setSelectedService(e.target.value)}
            >
              {SERVICES.map(s => (
                <option key={s} value={s}>{SERVICE_ICONS[s]} {s}</option>
              ))}
            </select>

            <div
              className={`priority-toggle${isVIP ? ' vip' : ''}`}
              onClick={() => setIsVIP(v => !v)}
            >
              <span>{isVIP ? 'VIP Priority' : 'Regular Priority'}</span>
              <span className="star">{isVIP ? '⭐' : '☆'}</span>
            </div>

            <button
              className="btn btn-primary btn-full"
              onClick={() => onAddCustomer(selectedService, isVIP)}
            >
              Add to Queue
            </button>
          </div>
        </div>

        {/* Desk Config */}
        <div className="card">
          <div className="card-header">
            <span className="dot" style={{ background: 'var(--gold)', boxShadow: '0 0 6px var(--gold)' }} />
            New Desk
          </div>
          <div className="input-stack">
            <input
              type="text"
              className="text-input"
              placeholder="Desk name…"
              value={deskName}
              onChange={e => setDeskName(e.target.value)}
            />
            <div className="services-grid">
              {SERVICES.map(s => (
                <label key={s} className="service-checkbox">
                  <input
                    type="checkbox"
                    checked={checkedServices.has(s)}
                    onChange={() => toggleService(s)}
                  />
                  {SERVICE_ICONS[s]} {s.split(' ')[0]}
                </label>
              ))}
            </div>
            <button
              className="btn btn-ghost btn-full btn-sm"
              onClick={() => {
                onCreateDesk(deskName, Array.from(checkedServices));
                setDeskName('');
                setCheckedServices(new Set());
              }}
            >
              + Add Desk
            </button>
          </div>
        </div>

        {/* Control Panel */}
        <div className="card">
          <div className="card-header">
            <span className="dot" style={{ background: 'var(--success)', boxShadow: '0 0 6px var(--success)' }} />
            Control Panel
          </div>
          <div className="input-stack">
            <div className="toggle-row">
              <span>Simulation Mode</span>
              <div className="toggle-pill">
                <button
                  className={`toggle-opt${mode === 'manual' ? ' active' : ''}`}
                  onClick={() => onSetMode('manual')}
                >
                  Manual
                </button>
                <button
                  className={`toggle-opt${mode === 'auto' ? ' active' : ''}`}
                  onClick={() => onSetMode('auto')}
                >
                  Auto
                </button>
              </div>
            </div>

            <div className="toggle-row">
              <span>Tick Speed</span>
              <div className="speed-opts">
                {[1, 2, 5, 10].map(s => (
                  <button
                    key={s}
                    className={`speed-btn${speed === s ? ' active' : ''}`}
                    onClick={() => onSetSpeed(s)}
                  >
                    {s}×
                  </button>
                ))}
              </div>
            </div>

            <div className="sim-actions">
              <button
                className={`btn ${paused ? 'btn-gold' : 'btn-ghost'}`}
                onClick={onTogglePause}
              >
                {paused ? '▶ Resume' : '⏸ Pause'}
              </button>
              <button className="btn btn-danger" onClick={onReset}>
                ↺ Reset
              </button>
            </div>
          </div>
        </div>

        {/* Analytics */}
        <div className="card">
          <div className="card-header">
            <span className="dot" style={{ background: '#a855f7', boxShadow: '0 0 6px #a855f7' }} />
            Analytics
          </div>
          <div className="stats-grid">
            <div className="stat-item">
              <span className="stat-val">{stats.total_served}</span>
              <span className="stat-lbl">Served</span>
            </div>
            <div className="stat-item">
              <span className="stat-val">{queueLength}</span>
              <span className="stat-lbl">Waiting</span>
            </div>
            <div className="stat-item full">
              <span className="stat-val">
                {stats.avg_wait_seconds ? Math.round(stats.avg_wait_seconds) + 's' : '0s'}
              </span>
              <span className="stat-lbl">Avg Wait Time</span>
            </div>
          </div>
        </div>

      </div>
    </aside>
  );
}
