'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { Window as QueueWindow, Customer } from '../hooks/useQueueSimulation';

interface AvatarState {
  el: HTMLDivElement;
  customer: Customer;
}

interface AvatarFloorProps {
  windows: QueueWindow[];
  containerRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * This component manages CSS-animated avatar tokens inside a walking-area div.
 * It stays synchronised with the queue data by imperatively creating/moving/removing
 * DOM elements — matching the vanilla JS approach.
 */
export function AvatarFloor({ windows, containerRef }: AvatarFloorProps) {
  const walkingAreaRef = useRef<HTMLDivElement>(null);
  const avatars = useRef<Record<string, AvatarState>>({});

  const getWorkflowText = (wf: string | string[] | undefined): { isChained: boolean; text: string } => {
    try {
      const arr: string[] = typeof wf === 'string' ? JSON.parse(wf) : (wf || []);
      if (Array.isArray(arr) && arr.length > 0) {
        return { isChained: true, text: 'Next: ' + arr.join(' → ') };
      }
    } catch {}
    return { isChained: false, text: '' };
  };

  const createOrGetAvatar = useCallback((cust: Customer): HTMLDivElement => {
    const existing = avatars.current[cust.id];
    if (existing) {
      // Update tooltip content
      const { isChained, text: chainText } = getWorkflowText(cust.workflow);
      const tooltip = existing.el.querySelector('.avatar-tooltip');
      if (tooltip) {
        tooltip.textContent = isChained ? chainText : `Service: ${cust.service}`;
      }

      const indicator = existing.el.querySelector('.chain-indicator');
      if (isChained && !indicator) {
        const ind = document.createElement('div');
        ind.className = 'chain-indicator';
        ind.title = chainText;
        existing.el.appendChild(ind);
      } else if (!isChained && indicator) {
        indicator.remove();
      }
      return existing.el;
    }

    // Build token
    const prefix = cust.token.split('-')[0].toLowerCase();
    const el = document.createElement('div');
    el.className = `avatar-token token-${prefix}${cust.priority === 'vip' ? ' vip-token' : ''}`;

    const label = document.createElement('span');
    label.className = 'token-label';
    label.textContent = cust.token;
    el.appendChild(label);

    if (cust.priority === 'vip') {
      const sub = document.createElement('span');
      sub.className = 'token-sub';
      sub.textContent = 'VIP';
      el.appendChild(sub);
    }

    const { isChained, text: chainText } = getWorkflowText(cust.workflow);
    
    // Add Tooltip
    const tooltip = document.createElement('div');
    tooltip.className = 'avatar-tooltip';
    tooltip.textContent = isChained ? chainText : `Service: ${cust.service}`;
    el.appendChild(tooltip);

    if (isChained) {
      const ind = document.createElement('div');
      ind.className = 'chain-indicator';
      el.appendChild(ind);
    }

    // Spawn off-screen
    el.style.left = '50%';
    el.style.top = '150%';
    el.style.opacity = '0';
    el.style.transform = 'scale(0.7)';

    walkingAreaRef.current?.appendChild(el);
    avatars.current[cust.id] = { el, customer: cust };

    // Fade-in
    requestAnimationFrame(() => {
      el.style.opacity = '1';
      el.style.transform = 'scale(1)';
    });

    return el;
  }, []);

  useEffect(() => {
    const walkingArea = walkingAreaRef.current;
    const bankFloor = containerRef.current;
    if (!walkingArea || !bankFloor) return;

    const floorRect = bankFloor.getBoundingClientRect();
    const expected = new Set<string>();

    windows.forEach(w => {
      const deskEl = document.getElementById(`cdesk-${w.window_id}`);
      if (!deskEl) return;
      const deskRect = deskEl.getBoundingClientRect();
      const centerX = deskRect.left - floorRect.left + deskRect.width / 2;

      // Current customer (in serving slot)
      if (w.current) {
        expected.add(w.current.id.toString());
        const el = createOrGetAvatar(w.current);
        el.classList.add('is-serving');

        const slotEl = deskEl.querySelector<HTMLElement>('.serving-slot');
        if (slotEl) {
          const slotRect = slotEl.getBoundingClientRect();
          const targetY = slotRect.top - floorRect.top + slotRect.height / 2 - 34;
          el.style.left = `${centerX - 34}px`;
          el.style.top = `${targetY}px`;
        }
      }

      // Waiting queue beneath the desk
      const deskBottom = deskRect.bottom - floorRect.top + 16;
      const line = w.queue.slice(1);
      line.forEach((cust, idx) => {
        expected.add(cust.id.toString());
        const el = createOrGetAvatar(cust);
        el.classList.remove('is-serving');
        el.style.left = `${centerX - 34}px`;
        el.style.top = `${deskBottom + idx * 82}px`;
      });
    });

    // Remove departed customers
    Object.keys(avatars.current).forEach(id => {
      if (!expected.has(id)) {
        const el = avatars.current[id].el;
        el.style.left = '-150px';
        el.style.opacity = '0';
        el.style.transform = 'scale(0.8)';
        setTimeout(() => { el.remove(); }, 600);
        delete avatars.current[id];
      }
    });

    // Expand floor height for long queues
    const maxLine = Math.max(...windows.map(w => w.queue.length), 0);
    bankFloor.style.minHeight = `${420 + maxLine * 82}px`;
  }, [windows, createOrGetAvatar, containerRef]);

  return (
    <div
      ref={walkingAreaRef}
      className="walking-area"
    />
  );
}
