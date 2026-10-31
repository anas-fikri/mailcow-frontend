import assert from 'node:assert/strict';
import { EMAIL_CATEGORIES, classifyEmail, countCategories, extractEmailDomain } from '../src/lib/emailCategory.js';

// Spam: folder junk/…spam
assert.equal(classifyEmail({ folderId: 'folderJunk', from: 'a@example.com' }), EMAIL_CATEGORIES.SPAM);
assert.equal(classifyEmail({ folderId: 'INBOX/Spam', from: 'a@example.com' }), EMAIL_CATEGORIES.SPAM);

// Sosial (domain)
assert.equal(classifyEmail({ folderId: 'folderINBOX', from: 'noreply@facebookmail.com' }), EMAIL_CATEGORIES.SOSIAL);
assert.equal(classifyEmail({ folderId: 'folderINBOX', from: 'Nama <noreply@linkedin.com>' }), EMAIL_CATEGORIES.SOSIAL);

// Promo (domain)
assert.equal(classifyEmail({ folderId: 'folderINBOX', from: 'campaign@mailchimp.com' }), EMAIL_CATEGORIES.PROMO);

// Promo (subject keyword)
assert.equal(classifyEmail({ folderId: 'folderINBOX', from: 'a@b.com', subject: 'Diskon 50% akhir pekan' }), EMAIL_CATEGORIES.PROMO);

// Update (domain)
assert.equal(classifyEmail({ folderId: 'folderINBOX', from: 'no-reply@github.com' }), EMAIL_CATEGORIES.UPDATE);

// Update (subject keyword)
assert.equal(classifyEmail({ folderId: 'folderINBOX', from: 'a@b.com', subject: 'Kode OTP verifikasi Anda' }), EMAIL_CATEGORIES.UPDATE);

// Default / personal
assert.equal(classifyEmail({ folderId: 'folderINBOX', from: 'teman@contoh.com', subject: 'Halo apa kabar' }), EMAIL_CATEGORIES.UTAMA);

// Non-object / empty — safe default
assert.equal(classifyEmail(null), EMAIL_CATEGORIES.UTAMA);
assert.equal(classifyEmail(undefined), EMAIL_CATEGORIES.UTAMA);
assert.equal(classifyEmail({}), EMAIL_CATEGORIES.UTAMA);

// extractEmailDomain
assert.equal(extractEmailDomain('John <john@Example.COM>'), 'example.com');
assert.equal(extractEmailDomain('www.example.com'), 'example.com');
assert.equal(extractEmailDomain(''), '');

// countCategories
const counts = countCategories([
  { folderId: 'folderINBOX', from: 'a@b.com' },
  { folderId: 'folderINBOX', from: 'x@facebookmail.com' },
  { folderId: 'folderJunk', from: 'a@b.com' },
]);
assert.equal(counts[EMAIL_CATEGORIES.UTAMA], 1);
assert.equal(counts[EMAIL_CATEGORIES.SOSIAL], 1);
assert.equal(counts[EMAIL_CATEGORIES.SPAM], 1);
assert.equal(counts[EMAIL_CATEGORIES.PROMO], 0);

console.log('emailCategory assertions passed');
