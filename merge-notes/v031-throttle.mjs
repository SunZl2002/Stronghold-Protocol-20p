// v0.3.1 merge, step 26: the m.public cadence.
//
// Upstream's realtime test states the client contract in so many words — "normal updates have a 200 ms minimum gap" — and
// asserts it. This fork's throttle was 125 ms (8 Hz), chosen when the public view was smaller. With the 0.3.1 view (per-group
// stock, offers, the richer draft facade) two changes inside one 125 ms window are ordinary, so the observed gap came out
// 134-136 ms and the test failed. Upstream's own 100 ms constant only passes that assertion because their view happens not
// to change twice in 200 ms.
//
// The floor is now 200, which is the contract the test names. This fork's connection test asserted the frame after a 150 ms
// advance; it now derives the wait from the constant, so the two files cannot disagree again.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const cwd = process.argv[2];

// 1. the constant
{
  const file = `${cwd}/server/match/match/common.js`;
  let text = fs.readFileSync(file, 'utf8');
  if (text.includes('PUBLIC_THROTTLE: 200')) console.log('  -- 已是 200');
  else if (text.includes('PUBLIC_THROTTLE: 125')) {
    text = text.replace('PUBLIC_THROTTLE: 125', 'PUBLIC_THROTTLE: 200');
    fs.writeFileSync(file, text, 'utf8');
    console.log('  ok PUBLIC_THROTTLE 125 → 200（测试写明的 200 ms 下限）');
  } else throw new Error('PUBLIC_THROTTLE 行没找到');
}

// 2. our connection test derives its wait from the constant
{
  const rel = 'test/match/connection.test.js';
  const file = `${cwd}/${rel}`;
  let text = fs.readFileSync(file, 'utf8');
  const from = '  h.sched.advance(150);';
  const to = '  h.sched.advance(DELAYS.PUBLIC_THROTTLE + 50);';
  if (text.includes(to)) console.log(`  -- ${rel} 已推导`);
  else if (text.includes(from)) {
    text = text.replace(from, to);
    if (!/import \{[^}]*DELAYS[^}]*\}/.test(text)) {
      console.log('  !! DELAYS 未导入，需要手工补');
    }
    fs.writeFileSync(file, text, 'utf8');
    console.log(`  ok ${rel}: 等待改为 DELAYS.PUBLIC_THROTTLE + 50`);
  } else console.log(`  -- ${rel}: 锚点未找到`);
}
