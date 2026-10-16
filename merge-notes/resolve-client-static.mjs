// Throwaway: test/client-static.test.js — 0.3.0 moved the boot fallback out of index.html and asserts `devices.css` is
// the LAST stylesheet. This fork cannot hold that: it links its own feature sheets around and after it (measured:
// devices.css at 18, match-chat.css at 19). So the merged assertion is "nothing but a branch feature sheet follows
// devices.css" AND upstream's boot assertions — both sides kept.
import fs from 'node:fs';

const file = `${process.argv[2]}/test/client-static.test.js`;
let text = fs.readFileSync(file, 'utf8');
const before = text;

const merged = [
  '    // Local /css/ sheets only, and one link per line: the Google Fonts <link> spans two lines, so a greedy .* would',
  '    // run from its href to the next href and invent entries.',
  '    const sheets = [...index.matchAll(/^\\s*<link rel="stylesheet"[^>]*href="(\\/css\\/[^"]+)"/gm)].map((x) => x[1]);',
  '    // devices.css carries the media-query overrides and sits after every screen sheet. 0.3.0 asserts it is the LAST',
  '    // stylesheet, which this fork cannot: its own feature sheets (announcements / asset-cache / match-chat) are linked',
  '    // around it, and match-chat.css legitimately comes after. What must hold either way is that nothing OTHER than a',
  '    // branch feature sheet follows it.',
  "    const devicesAt = sheets.indexOf('/css/devices.css');",
  "    assert.ok(devicesAt >= 0, 'devices.css is linked');",
  '    assert.ok(sheets.length >= 15, `only ${sheets.length} local stylesheets found`);',
  '    for (const s of BRANCH_SHEETS) assert.ok(sheets.includes(s), `${s} is linked`);',
  '    for (const s of sheets.slice(devicesAt + 1)) assert.ok(BRANCH_SHEETS.includes(s), `${s} follows devices.css and is not a branch feature sheet`);',
  '    // 0.3.0 moved the boot fallback out of index.html: an external script under its CSP, and no inline handler',
  '    assert.match(index, /<script nomodule src="\\/js\\/bootLegacy\\.js">/, \'a browser without ES modules gets the external fallback\');',
  "    const boot = readFileSync(path.join(PUBLIC, 'js/boot.js'), 'utf8');",
  "    const legacy = readFileSync(path.join(PUBLIC, 'js/bootLegacy.js'), 'utf8');",
  "    assert.match(legacy, /__spBootFail\\('old'\\)/);",
  "    assert.match(boot, /addEventListener\\('error'/, 'module loading errors are caught under CSP');",
  "    assert.match(boot, /__spBootFail\\('load'\\)/);",
  "    assert.ok(!/\\sonerror=/.test(index), 'no inline event handler under CSP');",
].join('\n');

// replace the whole conflict block (its OURS side already contains the branch assertions)
const re = /^<{7} [^\n]*\n[\s\S]*?^={7}[^\n]*\n[\s\S]*?^>{7} [^\n]*$/m;
if (!re.test(text)) throw new Error('client-static.test.js 的冲突块未找到');
text = text.replace(re, merged);

if (text === before) console.log('  ⚠️ 未改变');
else fs.writeFileSync(file, text, 'utf8');
console.log(`  client-static.test.js 残留标记 ${(text.match(/^(<{7}|>{7})/gm) || []).length}`);
