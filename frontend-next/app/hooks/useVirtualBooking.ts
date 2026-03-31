'use client';

import { useState, useCallback, useEffect } from 'react';
import type { Customer } from './useQueueSimulation';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export function useVirtualBooking() {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [position, setPosition] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [bookingForm, setBookingForm] = useState(true);

  const bookAppointment = useCallback(async (name: string, service: string) => {
    setError('');
    try {
      const res = await fetch(`${API}/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, service, priority: 'normal' }),
      });
      const data = await res.json();
      if (res.ok) {
        setCustomer(data.customer);
        setBookingForm(false);
      } else {
        setError(data.error || 'Failed to book');
      }
    } catch {
      setError('Connection error');
    }
  }, []);

  const fetchStatus = useCallback(async () => {
    if (!customer) return;
    try {
      const res = await fetch(`${API}/queue-item/${customer.id}`);
      if (!res.ok) {
        if (res.status === 404) {
          // Could be served or deleted
          setCustomer(prev => prev ? { ...prev, status: 'served' } : null);
        }
        return;
      }
      const data = await res.json();
      setCustomer(data.item);
      setPosition(data.position);
    } catch {}
  }, [customer?.id]);

  useEffect(() => {
    if (bookingForm || !customer || customer.status === 'served') return;
    const int = setInterval(fetchStatus, 1000);
    fetchStatus();
    return () => clearInterval(int);
  }, [bookingForm, customer?.id, customer?.status, fetchStatus]);

  const checkIn = useCallback(async () => {
    if (!customer) return;
    try {
      const res = await fetch(`${API}/checkin/${customer.id}`, { method: 'POST' });
      if (res.ok) {
        setCustomer(prev => prev ? { ...prev, checked_in: true } : null);
      }
    } catch {}
  }, [customer?.id]);

  return { customer, position, error, bookingForm, bookAppointment, checkIn, cancel: () => setBookingForm(true) };
}
