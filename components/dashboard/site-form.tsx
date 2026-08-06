'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useDashboard } from '@/lib/dashboard/provider';
import { normalizeDomain } from '@/lib/dashboard/store';

/*
  Add a site. Two fields, because that's all a site is until the snippet is on
  it: a name to recognise in the switcher, and the domain it lives at.

  The domain is normalised on save (scheme and path stripped), and shown back
  normalised while typing so nobody is surprised by what got stored.
*/
export function SiteForm({ onDone }: { onDone?: () => void }) {
  const { addSite, sites } = useDashboard();
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const cleaned = normalizeDomain(domain);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) return setError('Give the site a name.');
    if (!cleaned || !cleaned.includes('.')) return setError('Enter a domain, like example.com.');
    if (sites.some((s) => s.domain === cleaned)) {
      return setError('That domain is already on your account.');
    }

    setSaving(true);
    await addSite({ name, domain: cleaned });
    setSaving(false);
    setName('');
    setDomain('');
    onDone?.();
  }

  return (
    <form onSubmit={submit} className="border-line bg-cloud rounded-xl border p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-slate font-mono text-[0.6875rem] tracking-wide uppercase">
            Site name
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Summit Roofing"
            className="border-line text-navy focus:border-primary mt-1.5 w-full rounded-input border bg-white px-3 py-2 text-sm outline-none transition-colors duration-150"
          />
        </label>

        <label className="block">
          <span className="text-slate font-mono text-[0.6875rem] tracking-wide uppercase">
            Domain
          </span>
          <input
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="summitroofing.com"
            className="border-line text-navy focus:border-primary mt-1.5 w-full rounded-input border bg-white px-3 py-2 text-sm outline-none transition-colors duration-150"
          />
        </label>
      </div>

      {cleaned && cleaned !== domain.trim().toLowerCase() && (
        <p className="text-slate mt-2 text-xs">
          Saved as <code className="text-navy font-mono">{cleaned}</code>
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button size="sm" type="submit" disabled={saving}>
          {saving ? 'Adding…' : 'Add site'}
        </Button>
        {onDone && (
          <Button size="sm" variant="ghost" type="button" onClick={onDone}>
            Cancel
          </Button>
        )}
        {error && (
          <p role="alert" className="text-error-ink text-sm">
            {error}
          </p>
        )}
      </div>
    </form>
  );
}
