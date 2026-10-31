import assert from 'node:assert/strict';
import { isBlockedIpv4, isBlockedIpv6, isBlockedIp } from '../src/lib/ssrfGuard.js';

// ── IPv4 privat/reserved → blocked ────────────────────────────────────────────
const blockedV4 = [
  '0.0.0.0',
  '10.0.0.1', '10.255.255.255',
  '127.0.0.1',
  '100.64.0.1',
  '169.254.169.254', // cloud metadata
  '172.16.0.1', '172.31.255.255',
  '192.0.0.1', '192.0.2.1', '192.168.1.1',
  '198.18.0.1', '198.51.100.1', '203.0.113.1',
  '224.0.0.1', '255.255.255.255',
];
for (const ip of blockedV4) assert.equal(isBlockedIpv4(ip), true, ip);

// ── IPv4 publik → allowed ─────────────────────────────────────────────────────
const publicV4 = ['1.1.1.1', '8.8.8.8', '104.16.0.1', '203.0.114.1', '172.15.0.1', '192.169.0.1'];
for (const ip of publicV4) assert.equal(isBlockedIpv4(ip), false, ip);

// ── IPv6 blocked ──────────────────────────────────────────────────────────────
assert.equal(isBlockedIpv6('::1'), true);            // loopback
assert.equal(isBlockedIpv6('::'), true);             // unspecified
assert.equal(isBlockedIpv6('fe80::1'), true);        // link-local
assert.equal(isBlockedIpv6('fc00::1'), true);        // ULA
assert.equal(isBlockedIpv6('fd12::1'), true);        // ULA
assert.equal(isBlockedIpv6('ff02::1'), true);        // multicast
assert.equal(isBlockedIpv6('2001:db8::1'), true);    // documentation
assert.equal(isBlockedIpv6('::ffff:127.0.0.1'), true); // IPv4-mapped loopback

// ── IPv6 publik → allowed ─────────────────────────────────────────────────────
assert.equal(isBlockedIpv6('2606:4700:4700::1111'), false);
assert.equal(isBlockedIpv6('2001:4860:4860::8888'), false);
assert.equal(isBlockedIpv6('::ffff:8.8.8.8'), false); // IPv4-mapped publik

// ── isBlockedIp dispatch + fail-closed ────────────────────────────────────────
assert.equal(isBlockedIp('127.0.0.1'), true);
assert.equal(isBlockedIp('8.8.8.8'), false);
assert.equal(isBlockedIp(''), true);
assert.equal(isBlockedIp(null), true);
assert.equal(isBlockedIp(undefined), true);
assert.equal(isBlockedIp('garbage'), true);   // invalid v4 → block
assert.equal(isBlockedIp('not:an:ip'), true); // invalid v6 (non-hex) → block

console.log('ssrfGuard assertions passed');
