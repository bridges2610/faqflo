/**
 * Guard for URLs supplied by whoever is calling us.
 *
 * Both the audit and the URL reader fetch an address a stranger typed, from our
 * server, inside our network. Without a check that's a server-side request
 * forgery hole: `http://169.254.169.254/` is the cloud metadata endpoint, and
 * `http://localhost:3000/api/...` is us.
 *
 * This is a hostname/literal-IP check, so it does not stop a DNS name that
 * resolves to a private address (DNS rebinding). Closing that needs resolution
 * before connect, which the platform fetch doesn't expose — worth doing at the
 * network layer. What's here removes the trivially exploitable cases.
 */

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
  // AWS/GCP/Azure instance metadata, by name as well as by address.
  'metadata',
  'metadata.google.internal',
  'instance-data',
]);

function isPrivateIpv4(host: string): boolean {
  const parts = host.split('.');
  if (parts.length !== 4) return false;

  const octets = parts.map((p) => Number(p));
  if (octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;

  const [a, b] = octets;
  return (
    a === 0 || // "this network"
    a === 10 || // RFC1918
    a === 127 || // loopback
    (a === 100 && b >= 64 && b <= 127) || // RFC6598 carrier-grade NAT
    (a === 169 && b === 254) || // link-local, incl. cloud metadata
    (a === 172 && b >= 16 && b <= 31) || // RFC1918
    (a === 192 && b === 168) || // RFC1918
    a >= 224 // multicast and reserved
  );
}

function isPrivateIpv6(host: string): boolean {
  // URL hostnames keep IPv6 in brackets.
  const address = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (address === '::1' || address === '::') return true;
  // fc00::/7 unique-local, fe80::/10 link-local.
  return /^f[cd]/.test(address) || /^fe[89ab]/.test(address);
}

export type UrlCheck = { ok: true; url: URL } | { ok: false; reason: string };

/** Parse and vet a user-supplied address, adding https:// when none is given. */
export function checkPublicHttpUrl(input: string): UrlCheck {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, reason: 'Enter a web address.' };

  // Reject a foreign scheme before the https:// fallback below can disguise it:
  // "file:///etc/passwd" prefixed with https:// parses as the host "file", and
  // would be turned away for the wrong reason with a confusing message.
  // No dot in the scheme pattern on purpose: "example.com:8080" is a host and a
  // port, not a scheme, and must not be caught here.
  const scheme = /^([a-z][a-z0-9+-]*):/i.exec(trimmed)?.[1]?.toLowerCase();
  if (scheme && scheme !== 'http' && scheme !== 'https') {
    return { ok: false, reason: 'Only http and https addresses can be checked.' };
  }

  let url: URL;
  try {
    // Someone typing "example.com" means https://example.com — requiring the
    // scheme would fail the most common way a person types an address.
    url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return { ok: false, reason: "That doesn't look like a web address." };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: 'Only http and https addresses can be checked.' };
  }

  const host = url.hostname.toLowerCase();

  if (BLOCKED_HOSTNAMES.has(host) || host.endsWith('.localhost') || host.endsWith('.internal')) {
    return { ok: false, reason: 'That address points at a private host.' };
  }
  if (isPrivateIpv4(host) || isPrivateIpv6(host)) {
    return { ok: false, reason: 'That address points at a private network.' };
  }
  // A bare hostname with no dot is a local network name, not a public site.
  if (!host.includes('.') && !host.includes(':')) {
    return { ok: false, reason: 'Enter a full domain, like example.com.' };
  }

  return { ok: true, url };
}
