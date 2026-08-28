#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (file) => fs.readFileSync(file, 'utf8');
const mail = read('src/pages/MailPage.jsx');
const compose = read('src/components/mailer/ComposeModal.jsx');
const reader = read('src/components/mailer/MessageReader.jsx');
const calendar = read('src/pages/CalendarPage.jsx');
const contacts = read('src/pages/ContactsPage.jsx');
const sidebar = read('src/components/layout/Sidebar.jsx');

assert.match(mail, /if \(e\.metaKey \|\| e\.ctrlKey \|\| e\.altKey\) return;/,
  'MailPage protects browser/OS modifier shortcuts');
assert.match(mail, /e\.key === '\/' && e\.ctrlKey/,
  'MailPage keeps only explicit Ctrl/Cmd+slash search exception');

for (const [label, pattern] of [
  ['compose', /setComposeOpen\(true\)/],
  ['mail move', /moveMessages\(/],
  ['mail delete', /scheduleDelete\(/],
  ['mail mark read', /markRead\(/],
  ['calendar create', /openCreateModal\(/],
  ['calendar update', /handleUpdateEvent/],
  ['calendar delete', /handleDeleteEvent/],
  ['contacts create', /handleAddContact/],
  ['contacts delete', /handleDelete/],
  ['reader reply', /onClick=\{handleReply\}/],
  ['reader forward', /onClick=\{handleForward\}/],
]) assert.match(`${mail}\n${reader}\n${calendar}\n${contacts}`, pattern, `${label} action missing`);

for (const [label, src] of [
  ['MailPage', mail], ['ComposeModal', compose], ['MessageReader', reader],
  ['CalendarPage', calendar], ['ContactsPage', contacts],
]) assert.ok(src.includes('min-w-0') || src.includes('flex-wrap'), `${label}: no shrink/wrap contract`);
assert.match(sidebar, /truncate|min-w-0|shrink-0/, 'Sidebar: text/icon sizing contract');

assert.match(compose, /flex-wrap gap-y-2/);
assert.match(reader, /flex-wrap gap-2/);
assert.match(calendar, /flex-wrap gap-2/);
assert.match(contacts, /flex-wrap/);

console.log('ui-actions-layout: assertions PASS');
