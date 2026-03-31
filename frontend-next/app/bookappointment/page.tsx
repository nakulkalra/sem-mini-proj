'use client';

import { useState, useEffect } from 'react';
import { useVirtualBooking } from '../hooks/useVirtualBooking';

const SERVICES = [
  'Cash Deposit', 'Cash Withdrawal', 'Account Services',
  'Loan Inquiry', 'Priority Service', 'New Account'
];

const SERVICE_ICONS: Record<string, string> = {
  'Cash Deposit': '💵',
  'Cash Withdrawal': '🏧',
  'Account Services': '📄',
  'Loan Inquiry': '🏠',
  'Priority Service': '⭐',
  'New Account': '✨'
};

export default function BookAppointmentPage() {
  const { customer, position, error, bookingForm, bookAppointment, checkIn } = useVirtualBooking();
  const [name, setName] = useState('');
  const [service, setService] = useState('Cash Deposit');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    bookAppointment(name, service);
  };

  const isCalled = !!(customer?.called_at && !customer?.checked_in);
  // Status 'served' acts as completed or skipped
  const isServed = customer?.status === 'served' || customer?.status === 'completed';

  const [timeLeft, setTimeLeft] = useState(15);
  useEffect(() => {
    if (!customer?.called_at || customer?.checked_in) return;
    const int = setInterval(() => {
      const elapsed = Math.floor((Date.now() - new Date(customer.called_at!).getTime()) / 1000);
      let remain = 15 - elapsed;
      if (remain < 0) remain = 0;
      setTimeLeft(remain);
    }, 500);
    return () => clearInterval(int);
  }, [customer?.called_at, customer?.checked_in]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg)', padding: 20 }}>
      <div style={{ background: 'var(--bg-card)', padding: '40px', borderRadius: '24px', boxShadow: '0 10px 40px rgba(0,0,0,0.1)', width: '100%', maxWidth: '400px' }}>
        
        <div style={{ textAlign: 'center', marginBottom: 30 }}>
            <div style={{ fontSize: 48, marginBottom: 10 }}>🏦</div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', marginBottom: 5 }}>SmartQueue</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1.5 }}>Virtual Booking</p>
        </div>

        {bookingForm ? (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {error && <div style={{ color: 'var(--danger)', fontSize: 13, fontWeight: 700, textAlign: 'center', background: 'rgba(239,68,68,0.1)', padding: '10px', borderRadius: '8px' }}>{error}</div>}
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dim)' }}>Your Name</label>
                <input 
                  type="text" 
                  value={name} 
                  onChange={e => setName(e.target.value)}
                  className="text-input"
                  style={{ width: '100%' }}
                  placeholder="John Doe"
                  required
                />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dim)' }}>Service Required</label>
                <select 
                  value={service} 
                  onChange={e => setService(e.target.value)}
                  className="select"
                  style={{ width: '100%' }}
                >
                  {SERVICES.map(s => <option key={s} value={s}>{SERVICE_ICONS[s]} {s}</option>)}
                </select>
            </div>

            <button type="submit" className="btn btn-primary" style={{ marginTop: 10, height: 48, fontSize: 15 }}>
              Join Queue
            </button>
          </form>
        ) : isServed ? (
            <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div style={{ fontSize: 64 }}>✅</div>
                <div>
                   <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--success)', marginBottom: 8 }}>All Done!</h2>
                   <p style={{ color: 'var(--text-muted)' }}>Your turn has completed or expired. Thank you for using SmartQueue.</p>
                </div>
                <button onClick={() => window.location.reload()} className="btn btn-ghost btn-full" style={{ height: 48 }}>Book Another Appointment</button>
            </div>
        ) : (
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 24 }}>
            
            {/* Ticket Info */}
            <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 16, padding: '20px 0' }}>
               <h3 style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: 2 }}>{customer?.service}</h3>
               <div style={{ fontSize: 42, fontWeight: 900, color: 'var(--accent)', fontFamily: 'var(--font-mono)', letterSpacing: -1, margin: '10px 0' }}>{customer?.token}</div>
               <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-dim)' }}>{customer?.name}</div>
            </div>

            {/* Status Info */}
            {isCalled ? (
                <div className="calling-pulse-bg" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 16, padding: 20 }}>
                    <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--danger)', marginBottom: 8 }}>It's your turn!</h2>
                    <p style={{ fontSize: 14, color: 'var(--text)', marginBottom: 20, fontWeight: 500 }}>Please proceed to Window <strong style={{color: 'var(--danger)'}}>{customer?.window_id}</strong>.</p>
                    
                    <div style={{ fontSize: 36, fontWeight: 800, color: 'var(--danger)', fontFamily: 'var(--font-mono)', marginBottom: 15 }}>
                        {timeLeft}s
                    </div>

                    <button className="btn btn-primary btn-full" style={{ height: 54, fontSize: 16, background: '#dc2626', outline: 'none', border: 'none', boxShadow: '0 4px 14px rgba(220,38,38,0.3)' }} onClick={checkIn}>
                        I am here! (Check In)
                    </button>
                </div>
            ) : customer?.checked_in ? (
                 <div style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 16, padding: 20 }}>
                    <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--success)', marginBottom: 8 }}>Checked In ✅</h2>
                    <p style={{ fontSize: 14, color: 'var(--success)' }}>You are currently being served at Window <strong style={{color: 'var(--text)'}}>{customer?.window_id}</strong>.</p>
                 </div>
            ) : (
                <div>
                   <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: 2, marginBottom: 8 }}>Queue Status</div>
                   <div style={{ display: 'flex', justifyContent: 'space-between', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
                       <div>
                           <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Position</div>
                           <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>{position === null ? '--' : `#${position}`}</div>
                       </div>
                       <div style={{ width: 1, background: 'var(--border)' }}></div>
                       <div>
                           <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Wait Time</div>
                           <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>~{customer?.wait_time}s</div>
                       </div>
                   </div>
                      <p style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 16, lineHeight: 1.5 }}>
                        Keep this page open. We will notify you when it's your turn. You will have 15 seconds to check in.
                      </p>
                </div>
            )}
            
            {(!isCalled && !customer?.checked_in) && (
                <button onClick={() => window.location.reload()} className="btn btn-ghost btn-full" style={{ marginTop: 10 }}>Cancel Booking</button>
            )}

          </div>
        )}
      </div>
    </div>
  );
}
