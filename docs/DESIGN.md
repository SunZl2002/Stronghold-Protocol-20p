# 閸楊偅鍨楅崡蹇氼唴閿涙氨娲樼痪?閳?Web Remake 璺?Architecture & Contracts (DESIGN.md)

This is the **single source of truth** for every implementer. Research lives in `docs/research/` (start with `00-INDEX.md`; where a research file's body and its "Addendum (critic)" disagree, the addendum wins). When this document and research disagree, **this document wins**; when this document is silent, follow research; when both are silent, choose the simplest faithful behaviour and write it down in the module's header comment.

Language: player-facing text is **Simplified Chinese** by default, with an English switch since 0.2.0 (鎼?5.2, docs/I18N.md: UI strings through `t('娑擃厽鏋?)`, game texts from the official Chinese data or the official EN client's). Code, comments and identifiers are English.

Capacity branch: the upstream sections below document the original four-player scope. This branch's room capacity,
grouped pools, manual-player draft priority, multiple 閼辨棃妲?waves / votes, per-room spectator seats and sidebar rules
are in [PLAYER_CAPACITY.md](PLAYER_CAPACITY.md). Leader HP uses the 0.2.1 per-player baseline up to 20 players and
additionally rescales on departure while preserving the current percentage;
[D009](development/DECISIONS.md#d009) supersedes this branch's earlier alive / 4 rule. Maintenance evidence is in
[development/README.md](development/README.md).

Versions: the first public release was **0.1.0** (2026-10-02, the state of 鎼?閳ユ拃?0.15); the releases after it add the player feedback and GitHub reports 閳?0.1.1 鎼?1, 0.1.2 鎼?2, 0.1.3 鎼?3, 0.1.4 鎼?4 閳?and **0.2.0** (2026-10-07; `CHANGELOG.md`) the maintainability refactor, two languages, 鐞涖儰缍? 閼奉亪鈧绱梼?and their fidelity work 閳?鎼?5 閳?**0.2.1** (2026-10-07) the 閼辨棃妲?battlefield restored, full potential and the GitHub fixes after it 閳?鎼?6 閳?and **0.2.2** (2026-10-09) per-operator 濞兼粏鍏?/ 缂佸啫瀹? Japanese voices, the statistics page, 婢惰精銆€, whole-frame attack timing and the GitHub fixes after 0.2.1 閳?鎼?7. **0.2.3** (2026-10-10; `package.json`, `shared/constants.js APP_VERSION`) 閸忓骞堥梻銊ㄥ笅 and new modules, community fixes, text size, per-operator voices, installation, the opening reroll and local match recovery 閳?鎼?8. **0.2.4** (2026-10-11) the official shared card pool and item stock, Raid revival and #475, and the community fixes after 0.2.3 閳?鎼?9. **0.2.5** (2026-10-12) fixed gifts and already displayed operator offers under the shared stock, random boss pairing, the official battlefield scenes on the 3D board (optional local art: the full bundle includes them when extracted, a missing scene keeps the metal board; 鎼?5, 鎼?0.21), the official damage-number option, the 妞诡厽顫張顖氱瑎 / hit-tile / bot ports and the community fixes after 0.2.4 閳?鎼?0; its rules supersede the corresponding 0.2.4 ones. **0.2.6** (2026-10-13) the host-bandwidth layers 0 and 1 (no BGM download while the music is silent, WebSocket compression, content-hashed asset URLs with long caching, brotli, WebP guide pages), the official scene light gains, the impostor bounds, the deploy-animation replays, the optional ammo count and the community fixes after 0.2.5 閳?鎼?1, the state described by this document; its rules supersede the corresponding 0.2.5 ones. The labels v1 / v2 / v2.1閳ユ悧2.5.2 in 鎼?, 鎼?4閳ユ拃?0 and in the BALANCE / SIM comparisons name the design generations and the private playtest builds that came before it; they are kept as history.

---

## Where each section lives

Section numbers are global and never change: code, tests and the other documents cite them as "DESIGN 鎼侼". The
current rules by area are in `docs/design/`, the per-release revisions (the evidence behind each rule) in
`docs/history/`. When a revision changes a rule, the rule in `docs/design/` is rewritten too (the revision lists the
normative lines it rewrote).

| sections | file | content |
|---|---|---|
| 鎼?, 鎼?, 鎼?, 鎼?1, 鎼?2 | [design/overview.md](design/overview.md) | Scope, stack, repository layout, quality bar |
| 鎼?, 鎼? | [design/geometry-time.md](design/geometry-time.md) | Coordinates, fields, geometry and time |
| 鎼?, 鎼? | [design/engine.md](design/engine.md) | The battle engine (server/sim) and content modules |
| 鎼?, 鎼?6 | [design/match.md](design/match.md) | The match and meta engine (server/match), operator loadouts |
| 鎼?, 鎼?4 | [design/network.md](design/network.md) | The network protocol and client-side combat |
| 鎼?, 鎼?0, 鎼?3, 鎼?5 | [design/client.md](design/client.md) | Rendering, UI, local-client art, the 3D board |
| 鎼?7 | [history/v2.2-playtest3.md](history/v2.2-playtest3.md) | User playtest #3 (v2.2) |
| 鎼?8 | [history/v2.3-playtest4.md](history/v2.3-playtest4.md) | User playtest #4 (v2.3) |
| 鎼?9 | [history/v2.4-playtest5.md](history/v2.4-playtest5.md) | User playtest #5 (v2.4) |
| 鎼?0 | [history/v2.5-playtest6.md](history/v2.5-playtest6.md) | User playtest #6 (v2.5) and its follow-ups, up to 0.1.0 |
| 鎼?1 | [history/0.1.1.md](history/0.1.1.md) | 0.1.1 閳?player feedback after 0.1.0 |
| 鎼?2 | [history/0.1.2.md](history/0.1.2.md) | 0.1.2 閳?GitHub issues after 0.1.1 |
| 鎼?3 | [history/0.1.3.md](history/0.1.3.md) | 0.1.3 閳?community reports after 0.1.2 |
| 鎼?4 | [history/0.1.4.md](history/0.1.4.md) | 0.1.4 閳?community reports after 0.1.3 |
| 鎼?5 | [history/0.2.0.md](history/0.2.0.md) | 0.2.0 |
| 鎼?6 | [history/0.2.1.md](history/0.2.1.md) | 0.2.1 閳?after the 0.2.0 release |
| 鎼?7 | [history/0.2.2.md](history/0.2.2.md) | 0.2.2 閳?after the 0.2.1 release (2026-10-09) |
| 鎼?8 | [history/0.2.3.md](history/0.2.3.md) | 0.2.3 閳?after the 0.2.2 release (2026-10-10) |
| 鎼?9 | [history/0.2.4.md](history/0.2.4.md) | 0.2.4 閳?after the 0.2.3 release (2026-10-11) |
| 鎼?0 | [history/0.2.5.md](history/0.2.5.md) | 0.2.5 閳?after the 0.2.4 release (2026-10-12) |
| 鎼?1 | [history/0.2.6.md](history/0.2.6.md) | 0.2.6 閳?after the 0.2.5 release (2026-10-13) |
