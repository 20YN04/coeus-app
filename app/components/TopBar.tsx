'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

export default function TopBar({ tenantName }: { tenantName: string }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    router.push(`/kennisbank?q=${encodeURIComponent(q.trim())}`);
  }

  return (
    <div className="topbar">
      <form className="topbar__search" onSubmit={handleSearch}>
        <svg className="topbar__search-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="7" cy="7" r="4.5" />
          <path d="M10.5 10.5L14 14" />
        </svg>
        <input
          ref={inputRef}
          type="search"
          className="topbar__search-input"
          placeholder="Zoek in kennisbank..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoComplete="off"
        />
      </form>
      <span className="topbar__tenant">{tenantName}</span>
    </div>
  );
}
