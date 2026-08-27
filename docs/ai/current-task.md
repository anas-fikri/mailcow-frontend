# Current Task

## 2026-08-27 — Local Phishing Detection (tanpa AI)

### Fitur baru:
Modul `src/lib/phishingDetection.js` — deteksi phishing 100% di browser, tidak ada data yang dikirim ke server/PII.

### Analisis yang dilakukan:
1. **URL analysis** — domain blacklist (paypa1.com, g00gle.com, dll), IP langsung, URL shortener, punycode/homograph, TLD mencurigakan, @ in URL
2. **Header analysis** — From/Reply-To domain mismatch, display name spoofing (brand terkenal + domain berbeda)
3. **Content analysis** — urgency keywords (ID+EN), scam hadiah, credential harvesting, CEO fraud

### Scoring:
- 0-19: safe (hijau)
- 20-49: low/waspada (kuning)
- 50-79: medium/mencurigakan (oranye)
- 80+: high/sangat mencurigakan (merah)

### Integrasi:
- **MessageReader**: banner peringatan di atas email (warna sesuai risk level + daftar findings)
- **MailPage**: icon ⚠️ kecil di baris email jika From/Reply-To domain mismatch
- **Test**: 31 assertions, semua PASS

### Status: 58/58 PASS, build OK, deployed.
