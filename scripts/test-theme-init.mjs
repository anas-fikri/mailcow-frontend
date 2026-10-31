import fs from 'node:fs';

const html = fs.readFileSync('index.html', 'utf8');
const main = fs.readFileSync('src/main.jsx', 'utf8');
const theme = fs.readFileSync('src/themeInit.js', 'utf8');

const assertions = [
  [!html.includes('theme-init.js'), 'index.html must not load the public classic theme-init script'],
  [main.includes("import './themeInit.js'"), 'main.jsx must import the bundled theme initializer'],
  [theme.includes("localStorage.getItem('pcp-auth')"), 'theme initializer must read persisted auth theme'],
  [theme.includes("matchMedia('(prefers-color-scheme: dark)')"), 'theme initializer must support system preference'],
  [theme.includes("root.setAttribute('data-theme'"), 'theme initializer must set data-theme'],
  [theme.includes('catch (_)'), 'theme initializer must fail open'],
];

for (const [ok, message] of assertions) {
  if (!ok) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
}
console.log(`Theme initializer: ${assertions.length}/${assertions.length} assertions PASS`);
