#!/usr/bin/env node
import fs from 'node:fs';

const source = fs.readFileSync('src/components/mailer/MessageReader.jsx', 'utf8');
const start = source.indexOf('export default function MessageReader');
if (start < 0) throw new Error('MessageReader component tidak ditemukan');
const body = source.slice(start);
const phishing = body.indexOf('const phishingResult = React.useMemo(');
const msgIdGuard = body.indexOf('if (!msgId) return null;');
const loadingGuard = body.indexOf('if (isLoading) return <MessageReaderSkeleton />;');
const missingGuard = body.indexOf('if (!msg) {');
if (phishing < 0) {
  console.error('❌ phishingResult hook tidak ditemukan');
  process.exit(1);
}
if (msgIdGuard < 0 || loadingGuard < 0 || missingGuard < 0) {
  console.error('❌ Guard render MessageReader tidak ditemukan lengkap');
  process.exit(1);
}
const firstGuard = Math.min(msgIdGuard, loadingGuard, missingGuard);
if (phishing > firstGuard) {
  console.error('❌ phishingResult berada setelah early-return guard');
  process.exit(1);
}
const hookPattern = /(?:React\.)?use(?:State|Effect|Memo|Callback|Ref|Reducer|Context|LayoutEffect|InsertionEffect|ImperativeHandle|SyncExternalStore)\s*\(/g;
const hooksAfterFirstGuard = [...body.slice(firstGuard).matchAll(hookPattern)];
if (hooksAfterFirstGuard.length) {
  console.error('❌ Ada hook setelah early-return guard MessageReader');
  process.exit(1);
}
console.log('✓ MessageReader: hook berada sebelum semua early-return guard');
