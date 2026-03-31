'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export interface Customer {
  id: number;
  token: string;
  name: string;
  service: string;
  priority: 'vip' | 'normal';
  status: string;
  window_id: number;
  order_time: number;
  wait_time: number;
  workflow?: string | string[];
}

export interface Window {
  window_id: number;
  name: string;
  type: 'vip' | 'standard';
  services: string[];
  is_offline: boolean;
  time_saved: number;
  current: Customer | null;
  queue: Customer[];
  queue_length: number;
  total_wait: number;
}

export interface Stats {
  total_served: number;
  avg_wait_seconds: number;
}

const BASE_POLL = 1500;
const BASE_TICK = 1000;

export function useQueueSimulation() {
  const [windows, setWindows] = useState<Window[]>([]);
  const [stats, setStats] = useState<Stats>({ total_served: 0, avg_wait_seconds: 0 });
  const [queueLength, setQueueLength] = useState(0);
  const [error, setError] = useState(false);
  const [paused, setPaused] = useState(false);
  const [mode, setModeState] = useState<'manual' | 'auto'>('manual');
  const [speed, setSpeedState] = useState(1);
  const [toasts, setToasts] = useState<{ id: number; msg: string; type: string }[]>([]);

  // Timer states for progress bars
  const counterTimers = useRef<Record<number, { cur: number; max: number; customer_id: number }>>({});
  const [timerTick, setTimerTick] = useState(0);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pausedRef = useRef(paused);
  const modeRef = useRef(mode);
  const speedRef = useRef(speed);

  pausedRef.current = paused;
  modeRef.current = mode;
  speedRef.current = speed;

  const showToast = useCallback((msg: string, type: string = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4200);
  }, []);

  const fetchAll = useCallback(async () => {
    try {
      const [winRes, qRes, statRes] = await Promise.all([
        fetch(`${API}/windows`),
        fetch(`${API}/queue`),
        fetch(`${API}/stats`),
      ]);
      if (!winRes.ok) { setError(true); return; }
      const wins: Window[] = await winRes.json();
      const queue: Customer[] = await qRes.json();
      const stat: Stats = await statRes.json();
      setWindows(wins);
      setQueueLength(queue.length);
      setStats(stat);
      setError(false);

      // Sync countdown timers
      wins.forEach(w => {
        if (!w.is_offline && w.current) {
          const existing = counterTimers.current[w.window_id];
          if (!existing || existing.customer_id !== w.current.id) {
            counterTimers.current[w.window_id] = {
              cur: w.current.order_time,
              max: w.current.order_time,
              customer_id: w.current.id,
            };
          }
        } else if (w.is_offline || !w.current) {
          delete counterTimers.current[w.window_id];
        }
      });
    } catch {
      setError(true);
    }
  }, []);

  const serveWindow = useCallback(async (wid: number) => {
    try {
      await fetch(`${API}/serve/${wid}`, { method: 'POST' });
      delete counterTimers.current[wid];
      await fetchAll();
    } catch {}
  }, [fetchAll]);

  const tick = useCallback(() => {
    if (pausedRef.current) return;
    let changed = false;
    Object.keys(counterTimers.current).forEach(widStr => {
      const wid = parseInt(widStr);
      const state = counterTimers.current[wid];
      if (state.cur > 0) { state.cur -= 1; changed = true; }
      if (modeRef.current === 'auto' && state.cur <= 0) {
        serveWindow(wid);
      }
    });
    if (changed) setTimerTick(t => t + 1);
  }, [serveWindow]);

  const restartTimers = useCallback((spd: number) => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (tickRef.current) clearInterval(tickRef.current);
    const pollMs = Math.max(500, BASE_POLL / spd);
    const tickMs = Math.max(100, BASE_TICK / spd);
    pollRef.current = setInterval(fetchAll, pollMs);
    tickRef.current = setInterval(tick, tickMs);
  }, [fetchAll, tick]);

  useEffect(() => {
    fetchAll();
    restartTimers(speed);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, []);

  const setMode = useCallback((m: 'manual' | 'auto') => {
    setModeState(m);
    modeRef.current = m;
  }, []);

  const setSpeed = useCallback((s: number) => {
    setSpeedState(s);
    speedRef.current = s;
    restartTimers(s);
  }, [restartTimers]);

  const addCustomer = useCallback(async (service: string, isVIP: boolean) => {
    try {
      const res = await fetch(`${API}/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priority: isVIP ? 'vip' : 'normal', service }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`Token: ${data.customer.token}`, 'info');
        fetchAll();
      } else {
        showToast(data.error || 'Failed to add', 'danger');
      }
    } catch {}
  }, [fetchAll, showToast]);

  const spawnRandom = useCallback(async (count: number) => {
    try {
      const res = await fetch(`${API}/random`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`Spawned ${data.added} clients!`, 'success');
        fetchAll();
      } else {
        showToast(data.error || 'Spawn failed', 'danger');
      }
    } catch {}
  }, [fetchAll, showToast]);

  const createDesk = useCallback(async (name: string, services: string[]) => {
    if (!name) { showToast('Enter a desk name', 'danger'); return; }
    if (services.length === 0) { showToast('Select at least one service', 'danger'); return; }
    const type = services.includes('Priority Service') ? 'vip' : 'standard';
    try {
      const res = await fetch(`${API}/counters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, type, services }),
      });
      if (res.ok) {
        showToast('Desk added!', 'success');
        fetchAll();
      }
    } catch {}
  }, [fetchAll, showToast]);

  const deleteDesk = useCallback(async (wid: number) => {
    if (!confirm('Delete this desk? Its queue will be re-routed.')) return;
    try {
      const res = await fetch(`${API}/counters/${wid}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('Desk removed & queue re-routed', 'danger');
        fetchAll();
      }
    } catch {}
  }, [fetchAll, showToast]);

  const toggleDesk = useCallback(async (wid: number, isOffline: boolean) => {
    try {
      const res = await fetch(`${API}/status/${wid}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_offline: isOffline }),
      });
      const data = await res.json();
      if (data.movedCustomers > 0)
        showToast(`Re-routed ${data.movedCustomers} clients!`, 'warning');
      fetchAll();
    } catch {}
  }, [fetchAll, showToast]);

  const resetAll = useCallback(async () => {
    if (!confirm('Reset all data?')) return;
    try {
      await fetch(`${API}/reset`, { method: 'POST' });
      counterTimers.current = {};
      showToast('Simulation reset.', 'danger');
      fetchAll();
    } catch {}
  }, [fetchAll, showToast]);

  return {
    windows, stats, queueLength, error, paused, mode, speed,
    toasts, counterTimers: counterTimers.current, timerTick,
    setPaused, setMode, setSpeed,
    addCustomer, spawnRandom, createDesk, deleteDesk, toggleDesk, serveWindow, resetAll,
    showToast,
  };
}
