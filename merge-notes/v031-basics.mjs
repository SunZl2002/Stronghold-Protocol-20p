// v0.3.1 merge, step 11: server/match/player/basics.js — taking upstream's side (its skin block is the model this fork
// adopted) silently dropped THIS FORK's per-player pool accessor, and every shop roll reads `this.pool`: without it a match
// throws on its first `_rollChessSlot` (`Cannot read properties of undefined (reading 'roll')`) and never leaves
// ROUND_START — which is exactly the shape the first gate run showed (every scenario stuck at ROUND_START R1).
import fs from 'node:fs';

const cwd = process.argv[2];
const file = `${cwd}/server/match/player/basics.js`;
const text = fs.readFileSync(file, 'utf8');

const GETTER = "  get pool() { return this.m.poolFor(this); }";
if (text.includes(GETTER)) { console.log('  -- get pool() 已在'); process.exit(0); }

const anchor = '  get isHumanActive() { return !this.isBot && !this.left; }';
if (!text.includes(anchor)) throw new Error('锚点 get isHumanActive 没找到');
const out = text.replace(anchor, [
  anchor,
  "  /** This fork's 20-player pool: the GROUP pool this seat draws from, never the match's first one. */",
  GETTER,
].join('\n'));
fs.writeFileSync(file, out, 'utf8');
console.log('  ok get pool() 已补回');
