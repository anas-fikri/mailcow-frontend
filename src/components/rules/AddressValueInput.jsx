import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../store/authStore';
import { fetchContacts } from '../../lib/api';
import { getEmailHistory } from '../../lib/emailHistory';
import { buildAddressSuggestions } from '../../lib/ruleAddressSuggest';
import { inputCls } from './styles';

/**
 * Input nilai kondisi untuk kolom alamat (Dari / Kepada / Cc / Kepada atau Cc)
 * dengan dropdown saran alamat terkait. Teks bebas tetap diterima — operator
 * "mengandung" juga menerima sebagian alamat (mis. "@vendor.com").
 */
export default function AddressValueInput({ field, value, onChange, ariaLabel }) {
  const { user } = useAuthStore();
  const token = user?.sogoToken;
  const queryClient = useQueryClient();
  const listId = useId();
  const wrapRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  // Cache yang sama dengan Compose (['contacts', token]) — tidak fetch ulang bila sudah ada.
  const { data: contacts = [] } = useQuery({
    queryKey: ['contacts', token],
    queryFn: () => fetchContacts(token),
    enabled: !!token && open,
    staleTime: 5 * 60 * 1000,
  });

  const suggestions = useMemo(() => {
    if (!open) return [];
    // Alamat dari pesan yang sudah dimuat (semua folder di cache daftar).
    const seen = [];
    for (const [, data] of queryClient.getQueriesData({ queryKey: ['messages', token] })) {
      for (const m of data?.messages || []) seen.push(m);
      if (seen.length > 1500) break;
    }
    return buildAddressSuggestions({
      field,
      query: value,
      accountEmail: user?.email,
      contacts,
      history: getEmailHistory(user?.email, '', 200),
      seen,
      limit: 8,
    });
  }, [open, field, value, contacts, user?.email, token, queryClient]);

  useEffect(() => { setActive(-1); }, [value, field]);

  // Tutup saat klik di luar.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown, true);
    return () => document.removeEventListener('mousedown', onDown, true);
  }, [open]);

  const pick = (s) => { onChange(s.email); setOpen(false); };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((i) => Math.min(suggestions.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter' && open && active >= 0 && suggestions[active]) { e.preventDefault(); pick(suggestions[active]); }
    else if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); setOpen(false); }
  };

  const showList = open && suggestions.length > 0;
  return (
    <div ref={wrapRef} className="relative flex-1 min-w-[140px]">
      <input
        aria-label={ariaLabel}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Pilih atau ketik alamat / bagian alamat"
        className={`${inputCls} w-full`}
      />
      {showList && (
        <ul id={listId} role="listbox" aria-label="Saran alamat"
          className="absolute left-0 right-0 top-full mt-1 z-[80] max-h-64 overflow-y-auto py-1 bg-popover border border-border rounded-lg shadow-md">
          {suggestions.map((s, i) => (
            <li key={s.email} id={`${listId}-${i}`} role="option" aria-selected={i === active}
              onMouseDown={(e) => { e.preventDefault(); pick(s); }}
              onMouseEnter={() => setActive(i)}
              className={`flex items-center gap-2 px-3 min-h-11 sm:min-h-9 cursor-pointer text-[13px] ${i === active ? 'bg-muted' : ''}`}>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-foreground">{s.name || s.email}</span>
                {s.name && <span className="block truncate text-xs text-muted-foreground">{s.email}</span>}
              </span>
              <span className="shrink-0 text-[11px] text-muted-foreground">{s.hint}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
