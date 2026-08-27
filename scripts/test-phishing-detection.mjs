#!/usr/bin/env node
// test-phishing-detection.mjs — Unit tests untuk modul phishingDetection.js
import { analyzePhishing, RISK_LEVELS } from '../src/lib/phishingDetection.js';

let pass = 0;
let fail = 0;

function assert(condition, label) {
  if (condition) { pass++; }
  else { fail++; console.error(`  FAIL: ${label}`); }
}

function assertEq(a, b, label) {
  if (a === b) { pass++; }
  else { fail++; console.error(`  FAIL: ${label} — expected "${b}", got "${a}"`); }
}

// ─── 1. Safe email ──────────────────────────────────────────────────────────
{
  const r = analyzePhishing({
    from: 'Budi Santoso <budi@pcpexpress.com>',
    replyTo: '',
    subject: 'Meeting agenda',
    bodyHtml: '<p>Silakan cek agenda meeting besok.</p>',
  });
  assertEq(r.level, 'safe', 'Normal email → safe');
  assert(r.findings.length === 0, 'Safe email tidak punya findings');
}

// ─── 2. From/Reply-To mismatch ──────────────────────────────────────────────
{
  const r = analyzePhishing({
    from: 'BCA Support <support@bca.co.id>',
    replyTo: 'phishing@scam.xyz',
    subject: 'Verifikasi akun Anda',
    bodyHtml: '<p>Silakan verifikasi.</p>',
  });
  assert(r.score >= 35, 'Reply-To mismatch → score >= 35');
  assert(r.findings.some(f => f.includes('From/Reply-To')), 'Reply-To mismatch terdeteksi');
}

// ─── 3. IP-based URL ────────────────────────────────────────────────────────
{
  const r = analyzePhishing({
    from: 'test@test.com',
    replyTo: '',
    subject: 'Click here',
    bodyHtml: '<a href="http://192.168.1.100/phish">Klik</a>',
  });
  assert(r.score >= 30, 'IP URL → score >= 30');
  assert(r.findings.some(f => f.includes('IP langsung')), 'IP URL terdeteksi');
}

// ─── 4. Blacklisted domain ──────────────────────────────────────────────────
{
  const r = analyzePhishing({
    from: 'PayPal <alerts@paypa1.com>',
    replyTo: '',
    subject: 'Account limited',
    bodyHtml: '<a href="https://paypa1.com/verify">Verify now</a>',
  });
  assert(r.score >= 50, 'Blacklisted domain → score >= 50');
  assert(r.findings.some(f => f.includes('mencurigakan')), 'Blacklisted domain terdeteksi');
}

// ─── 5. URL shortener ───────────────────────────────────────────────────────
{
  const r = analyzePhishing({
    from: 'test@test.com',
    replyTo: '',
    subject: 'Check this',
    bodyHtml: '<a href="https://bit.ly/3abc">Link</a>',
  });
  assert(r.score >= 15, 'URL shortener → score >= 15');
  assert(r.findings.some(f => f.includes('pemendek link')), 'URL shortener terdeteksi');
}

// ─── 6. Urgency keywords (Indonesia) ────────────────────────────────────────
{
  const r = analyzePhishing({
    from: 'Bank <info@bank.com>',
    replyTo: '',
    subject: 'Akun anda akan diblokir',
    bodyHtml: '<p>Segera verifikasi akun anda atau akun akan diblokir.</p>',
  });
  assert(r.score >= 15, 'Urgency keyword → score >= 15');
  assert(r.findings.some(f => f.includes('urgency')), 'Urgency keyword terdeteksi');
}

// ─── 7. Prize scam ──────────────────────────────────────────────────────────
{
  const r = analyzePhishing({
    from: 'Prize <winner@lottery.com>',
    replyTo: '',
    subject: 'Selamat anda menang',
    bodyHtml: '<p>Selamat! Anda menang hadiah Rp 500.000.000.</p>',
  });
  assert(r.score >= 20, 'Prize scam → score >= 20');
  assert(r.findings.some(f => f.includes('scam hadiah')), 'Prize scam terdeteksi');
}

// ─── 8. Credential harvesting ───────────────────────────────────────────────
{
  const r = analyzePhishing({
    from: 'IT <admin@company.com>',
    replyTo: '',
    subject: 'Update password',
    bodyHtml: '<p>Masukkan password anda untuk verifikasi.</p>',
  });
  assert(r.score >= 20, 'Credential harvesting → score >= 20');
  assert(r.findings.some(f => f.includes('credential')), 'Credential harvesting terdeteksi');
}

// ─── 9. CEO fraud ───────────────────────────────────────────────────────────
{
  const r = analyzePhishing({
    from: 'CEO <ceo@company.com>',
    replyTo: '',
    subject: 'Transfer segera',
    bodyHtml: '<p>Transfer segera ke rekening baru saya. Jangan beritahu siapapun.</p>',
  });
  assert(r.score >= 15, 'CEO fraud → score >= 15');
  assert(r.findings.some(f => f.includes('CEO fraud')), 'CEO fraud terdeteksi');
}

// ─── 10. @ in URL (phishing trick) ─────────────────────────────────────────
{
  const r = analyzePhishing({
    from: 'Google <alerts@google.com>',
    replyTo: '',
    subject: 'Verify your account',
    bodyHtml: '<a href="https://google.com@evil.com/steal">Click here</a>',
  });
  assert(r.score >= 40, '@ in URL → score >= 40');
  assert(r.findings.some(f => f.includes('@')), '@ in URL terdeteksi');
}

// ─── 11. Display name spoofing ──────────────────────────────────────────────
{
  const r = analyzePhishing({
    from: 'Google Security <phishing@scam.xyz>',
    replyTo: '',
    subject: 'Account alert',
    bodyHtml: '<p>Please verify.</p>',
  });
  assert(r.score >= 40, 'Display name spoofing → score >= 40');
  assert(r.findings.some(f => f.includes('brand')), 'Display name spoofing terdeteksi');
}

// ─── 12. Risk levels ────────────────────────────────────────────────────────
{
  assertEq(typeof RISK_LEVELS.safe, 'object', 'RISK_LEVELS.safe exists');
  assertEq(typeof RISK_LEVELS.low, 'object', 'RISK_LEVELS.low exists');
  assertEq(typeof RISK_LEVELS.medium, 'object', 'RISK_LEVELS.medium exists');
  assertEq(typeof RISK_LEVELS.high, 'object', 'RISK_LEVELS.high exists');
  assertEq(RISK_LEVELS.safe.label, 'Aman', 'safe label');
  assertEq(RISK_LEVELS.high.label, 'Sangat Mencurigakan', 'high label');
}

// ─── 13. Empty email → safe ─────────────────────────────────────────────────
{
  const r = analyzePhishing({
    from: '', replyTo: '', subject: '', bodyHtml: '',
  });
  assertEq(r.level, 'safe', 'Empty email → safe');
}

// ─── 14. Mixed signals → medium/high ────────────────────────────────────────
{
  const r = analyzePhishing({
    from: 'Bank BCA <support@paypa1.com>',
    replyTo: 'scammer@evil.xyz',
    subject: 'Akun anda akan diblokir',
    bodyHtml: '<p>Segera verifikasi. <a href="http://10.0.0.1/phish">Klik</a> <a href="https://bit.ly/x">Link</a></p>',
  });
  assert(r.score >= 80, 'Mixed signals → score >= 80 (high)');
  assertEq(r.level, 'high', 'Mixed signals → high risk');
}

console.log(`\nphishing detection assertions: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
