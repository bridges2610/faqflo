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

/**
 * Expand the short forms of an IPv4 address into four octets.
 *
 * ⚠️ `http://127.1/` IS LOOPBACK, AND IT USED TO GET STRAIGHT THROUGH. The
 * check below bailed on anything that wasn't four dot-separated parts, and the
 * "no dot means a local name" rule further down didn't catch it either, because
 * it does contain a dot. Every resolver and every browser reads 127.1 as
 * 127.0.0.1.
 *
 * The rule is the old inet_aton one: with fewer than four parts, the LAST part
 * is a big-endian remainder filling the rest of the address. So 127.1 is
 * 127 + 0.0.1, and 10.1.2 is 10 + 1 + 0.2.
 *
 * Returns null when this isn't a numeric address at all — a normal hostname
 * like "example.com" lands here and must fall through untouched.
 */
function expandIpv4(host: string): number[] | null {
  const parts = host.split('.');
  if (parts.length < 2 || parts.length > 4) return null;

  // Number() reads "0x7f" as 127 and "" as 0, so both are rejected explicitly:
  // a hex octet is a real obfuscation, and an empty part means a malformed
  // address rather than a zero.
  const values: number[] = [];
  for (const part of parts) {
    if (!/^[0-9]+$/.test(part)) return null;
    values.push(Number(part));
  }

  const last = values[values.length - 1];
  const leading = values.slice(0, -1);

  // Leading parts are single octets; the remainder fills what's left.
  if (leading.some((n) => n > 255)) return null;
  const remainderOctets = 4 - leading.length;
  if (last >= 2 ** (8 * remainderOctets)) return null;

  const filled: number[] = [...leading];
  for (let i = remainderOctets - 1; i >= 0; i--) {
    filled.push((last >>> (8 * i)) & 0xff);
  }
  return filled;
}

function isPrivateIpv4(host: string): boolean {
  const octets = expandIpv4(host);
  if (!octets) return false;

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

  /*
    ⚠️ IPv4-MAPPED ADDRESSES USED TO WALK PAST ALL OF THIS.
    `[::ffff:127.0.0.1]` is loopback written the v6 way: it isn't `::1`, and it
    starts with a colon rather than fc/fd/fe8, so every test here said "public"
    and the v4 test never saw it, because the host is not a dotted quad.

    ⚠️ AND IT MUST BE MATCHED IN HEX, NOT DOTTED. This is the trap: the first
    fix here only looked for `::ffff:127.0.0.1`, and it did nothing at all,
    because `new URL()` has already rewritten the hostname by the time we read
    it — `[::ffff:127.0.0.1]` normalises to `[::ffff:7f00:1]`. The dotted form
    never reaches this function. Both spellings are handled below; a test table
    over checkPublicHttpUrl is the only reason that was caught.
  */
  const mappedDotted = /^::ffff:((?:[0-9]{1,3}\.){3}[0-9]{1,3})$/.exec(address);
  if (mappedDotted) return isPrivateIpv4(mappedDotted[1]);

  const mappedHex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(address);
  if (mappedHex) {
    const high = parseInt(mappedHex[1], 16);
    const low = parseInt(mappedHex[2], 16);
    return isPrivateIpv4(`${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`);
  }

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
