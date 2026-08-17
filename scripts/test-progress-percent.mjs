#!/usr/bin/env node
/**
 * Test progressPercent() — guard pembagian nol (0/0 → 0, bukan NaN).
 */
import { progressPercent } from '../src/lib/progressPercent.js';

let pass = 0;
let fail = 0;
const results = [];

function check(name, actual, expected) {
  const ok = Object.is(actual, expected);
  ok ? pass++ : fail++;
  results.push(`${ok ? 'PASS' : 'FAIL'} ${name}: got ${actual}, want ${expected}`);
}

// 0/0 (storage mock default) → 0, bukan NaN
check('0/0 → 0', progressPercent(0, 0), 0);
check('0/100 → 0', progressPercent(0, 100), 0);
check('50/100 → 50', progressPercent(50, 100), 50);
check('100/100 → 100', progressPercent(100, 100), 100);
check('150/100 → clamp 100', progressPercent(150, 100), 100);
check('-10/100 → clamp 0', progressPercent(-10, 100), 0);
check('max negative → 0', progressPercent(10, -1), 0);
check('max undefined → 0', progressPercent(10, undefined), 0);
check('value undefined → 0', progressPercent(undefined, 100), 0);
check('value NaN → 0', progressPercent(NaN, 100), 0);
check('finite guard 1/3 → 33', progressPercent(1, 3), 33);
check('rounding 1/8 → 13', progressPercent(1, 8), 13);

console.log(results.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
