import assert from 'node:assert/strict';
import { pathSegment } from '../src/lib/pathSegment.js';

assert.equal(pathSegment('user@example.com', 'sogoToken'), 'user@example.com');
assert.equal(pathSegment('folderProjects%2F2026', 'folder', { allowEncodedSlash: true }), 'folderProjects%2F2026');
assert.throws(() => pathSegment('../secret', 'folder'), /tidak valid/);
assert.throws(() => pathSegment('folder%2e%2e%2fsecret', 'folder', { allowEncodedSlash: true }), /tidak valid/);
assert.throws(() => pathSegment('folder%3fadmin', 'folder', { allowEncodedSlash: true }), /tidak valid/);
assert.throws(() => pathSegment('draft%2Fsend', 'draftId'), /tidak valid/);
assert.throws(() => pathSegment('folder%2F..%2Fsecret', 'folder', { allowEncodedSlash: true }), /tidak valid/);

console.log('pathSegment assertions passed');
