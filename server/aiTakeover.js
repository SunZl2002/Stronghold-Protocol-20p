// Game-owned spectator-to-AI handover. No monitor or administrator API dependency.
//
// [20p] The handover is DIRECT: a connected spectator takes an AI seat while the match waits in PREP, and the only gate is
// the room option 「允许观战者接替 AI」 (room.setAiTakeover, default ON for a co-op room, which the host may still switch
// off before the start). The earlier election — one replaceable vote per online, non-autoplay human teammate, a strict
// majority, a 30-second expiry and an electorate that cancelled the request whenever it changed — is gone: a spectator who
// wants an AI seat takes it. Everything the handover itself guarantees is unchanged: the seat keeps its inventory, board,
// gold and results, the applicant's identity (reconnect token) moves onto that seat, the inherited seat is flagged with
// `aiTakeoverRound` so its records never count as the newcomer's personal statistics, and the connection's state-delta
// negotiation restarts against the new seat.
import { ERR, PROTOCOL_VERSION } from '../shared/constants.js';
import { DEFAULT_VERSION } from '../shared/versions.js';
import { resetStateDelta, stateDeltaVersion } from './stateTransport.js';

const fail = (detail) => ({ error: ERR.BAD_TARGET, detail });

/** No request is ever pending now; kept so the room lifecycle (dispose, AI changes) needs no special case. */
export function resetAiTakeover(room) {
  room.aiTakeoverVotes = [];
}

/** Nothing to reconcile: `room.aiRequest` performs the handover itself (kept for the lobby's broadcast paths). */
export function reconcileAiTakeover() {
  return false;
}

/**
 * Hand one AI seat to a spectator. Every refusal lives here, so the message handler stays a straight call.
 * @param {any} lobby @param {any} room @param {string} applicantId @param {string} botId
 */
export function transferAiSeat(lobby, room, applicantId, botId) {
  const m = room.match, session = lobby.registry.byId(applicantId), spectator = room.spectatorOf(applicantId);
  const ps = m?.players?.get(botId), seat = room.seatOf(botId);
  if (room.aiTakeoverEnabled !== true || room.mode !== 'coop' || room.version !== DEFAULT_VERSION) return fail('AI handover is disabled');
  if (!session?.connected || !session.ws || !spectator || !ps?.isBot || ps.left || !ps.alive || !seat || m.phase !== 'PREP' || m.ended || m.disposed || m.emergencyFrozen) return fail('AI handover unavailable');
  if (room.modded || m.hosted) return fail('AI handover is unavailable in isolated plugin matches');
  if (lobby.registry.byId(botId)) return fail('AI seat already has a session');
  const conn = lobby.network?.conns.get(session.ws);
  if (!conn || conn.closing) return fail('connection unavailable');
  lobby.removeMember(room, applicantId); lobby.clearResync(applicantId);
  lobby.registry.byPlayerId.delete(applicantId); session.playerId = botId; lobby.registry.byPlayerId.set(botId, session);
  session.roomCode = room.code; session.notice = null; session.pendingResult = null; session.resyncAt = -Infinity;
  ps._botPrepToken = (ps._botPrepToken || 0) + 1;
  m.cancelSeatRehearsal(botId);
  Object.assign(ps, { isBot: false, autoplay: false, connected: true, ready: false, name: session.name });
  Object.assign(seat, { isBot: false, connected: true, left: false, ready: false, name: session.name });
  m.loneHuman = m.order.filter(p => !p.isBot && !p.left).length === 1;
  ps.aiTakeoverRound = m.round;
  session.aiTakeoverFrom = applicantId; m.markPublic(); ps.dirty();
  resetStateDelta(conn.ws);
  lobby.network.onHelloMsg(conn, { t: 'hello', version: PROTOCOL_VERSION, delta: stateDeltaVersion(conn.ws), name: session.name, token: session.token }, lobby.now());
  lobby.broadcastState(room);
  return { ok: true };
}

/**
 * `room.aiRequest { botId }`: the spectator behind this session takes that AI seat now.
 * @param {any} lobby @param {any} session @param {{ t: string, botId?: string }} msg
 */
export function aiTakeover(lobby, session, msg) {
  const room = lobby.roomOf(session);
  if (!room) return fail('not in a room');
  if (msg.t !== 'room.aiRequest') return fail('unknown AI handover message');
  return transferAiSeat(lobby, room, session.playerId, msg.botId);
}
