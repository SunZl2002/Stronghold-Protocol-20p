// 每次更新后自动公告本次更新内容 (the owner's request of 2026-10-15): a container that is rebuilt and restarted should
// show players what changed, without anyone remembering to run a command.
//
// WHAT IT READS: the FIRST `## ` section of the repository's CHANGELOG.md. That is the section the project writes new
// work into, and it is titled 未发布 until a release is cut — so this does not depend on the version number moving,
// which matters here because APP_VERSION has stayed at 0.2.6 across a large batch of work (see todo I011).
//
// IDENTITY IS THE CONTENT, not the version: the announcement id is a hash of the body it publishes. That gives the
// behaviour the owner asked for and keeps it from becoming noise —
//   * the same update text never publishes twice, so a container that merely RESTARTS does not re-announce;
//   * editing the section produces a new id, and the announcement system's own rule (「下次不再显示」 lasts until a new
//     announcement is published) then makes it surface again, which is the point;
//   * no coordination is needed: the id is the same on every machine that publishes the same text.
//
// The announcement directory lives under runtime/, which the Docker image does not persist. Losing it on recreate is
// therefore EXPECTED, and it is harmless: the first boot of the new container republishes the current section once.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

/** Player-facing sections, in the order the CHANGELOG writes them. Anything else is dropped — see EXCLUDED below. */
/**
 * Sections a PLAYER announcement must not carry: `工具与开发` talks about `tools/*.mjs` and npm scripts. Kept as an
 * explicit exclusion list rather than an allow-list, so a section added to the CHANGELOG later is announced by default
 * instead of being silently swallowed.
 */
const EXCLUDED_SECTIONS = ['工具与开发', '开发', '内部']; // i18n-ignore: CHANGELOG heading names, matched as data

/** The announcement title. The section's own heading supplies the version when there is one. */
const TITLE_PREFIX = '本次更新'; // i18n-ignore: the announcement body is the CHANGELOG's own Chinese text

/**
 * Split a CHANGELOG into `## ` sections, preserving their body verbatim.
 * @param {string} text
 * @returns {Array<{ heading: string, body: string }>}
 */
export function splitChangelog(text) {
  const out = [];
  let current = null;
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const m = /^##\s+(.+?)\s*$/.exec(line);
    if (m) {
      if (current) out.push(current);
      current = { heading: m[1], body: '' };
      continue;
    }
    if (current) current.body += `${line}\n`;
  }
  if (current) out.push(current);
  return out;
}

/**
 * Keep the player-facing part of one section's body: drop the EXCLUDED_SECTIONS (and their bullets), keep everything
 * else verbatim so the announcement renders exactly what the CHANGELOG says.
 * @param {string} body
 */
export function playerFacing(body) {
  const out = [];
  let dropping = false;
  for (const line of String(body ?? '').split(/\r?\n/)) {
    const h = /^###\s+(.+?)\s*$/.exec(line);
    if (h) { dropping = EXCLUDED_SECTIONS.includes(h[1]); continue; }
    if (dropping) continue;
    out.push(line);
  }
  return out.join('\n').trim();
}

/**
 * The markdown to announce for the newest entry of a CHANGELOG, or null when there is nothing worth publishing.
 * @param {string} text CHANGELOG.md contents
 * @returns {{ id: string, title: string, markdown: string, heading: string } | null}
 */
export function changelogAnnouncement(text) {
  const first = splitChangelog(text)[0];
  if (!first) return null;
  const body = playerFacing(first.body);
  if (!body) return null;
  // 未发布 is a placeholder, not a version: an announcement headed by it would read as if it had no release. Date it
  // instead, which is what a player cares about anyway.
  const version = /^未发布/.test(first.heading) ? null : first.heading;
  const title = (version ? `${TITLE_PREFIX} · ${version}` : TITLE_PREFIX).slice(0, 120);
  const markdown = `${body}\n`;
  // The id IS the content (see the header): 1–64 lowercase letters, digits, underscores and dashes.
  const id = `changelog-${createHash('sha256').update(markdown, 'utf8').digest('hex').slice(0, 32)}`;
  return { id, title, markdown, heading: first.heading };
}

/**
 * Publish the newest CHANGELOG entry as an announcement, unless it is already published.
 *
 * Never throws: a missing CHANGELOG (a build that did not copy it), an unreadable store or a rejected write must not
 * stop the server from starting. Every outcome is logged so an operator can see which one happened.
 * @param {{ store: import('./announcements.js').AnnouncementStore, root?: string, log?: any,
 *           readFile?: (file: string) => string }} opts
 * @returns {{ state: 'published'|'present'|'empty'|'missing'|'failed', id?: string, title?: string, error?: string }}
 */
export function publishChangelogAnnouncement({ store, root, log, readFile = (f) => fs.readFileSync(f, 'utf8') } = {}) {
  const say = (msg) => { try { log?.info?.(msg); } catch { /* a logging failure must not matter here */ } };
  if (!store) return { state: 'failed', error: 'no announcement store' };
  let text;
  try {
    text = readFile(path.join(root, 'CHANGELOG.md'));
  } catch {
    // Expected for a package that does not ship the CHANGELOG; nothing to announce, and not an error worth failing on.
    return { state: 'missing' };
  }
  let entry = null;
  try {
    entry = changelogAnnouncement(text);
  } catch (e) {
    return { state: 'failed', error: String(e?.message || e) };
  }
  if (!entry) return { state: 'empty' };
  try {
    // `list()` answers { revision, pinnedId, items } — public metadata only, and a missing directory is an empty list.
    const already = store.list();
    if (Array.isArray(already?.items) && already.items.some((item) => item.id === entry.id)) {
      return { state: 'present', id: entry.id };
    }
  } catch (e) {
    return { state: 'failed', error: String(e?.message || e) };
  }
  try {
    // Pinned on purpose: the update note is what a returning player should see first, ahead of older notices.
    store.publish({ id: entry.id, title: entry.title, markdown: entry.markdown, pin: true });
  } catch (e) {
    return { state: 'failed', id: entry.id, error: String(e?.message || e) };
  }
  say(`[announcements] ${entry.title} (${entry.id}) — 来自 CHANGELOG 的「${entry.heading}」`); // i18n-ignore: server log line
  return { state: 'published', id: entry.id, title: entry.title };
}
