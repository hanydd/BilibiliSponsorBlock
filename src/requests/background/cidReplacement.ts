import Config from "../../config";
import { getEffectiveServers } from "../../config/serverPreferences";
import { CidReplacementCandidate, validCandidate } from "../../utils/cidReplacement";
import { getHash } from "../../utils/hash";
import { callAPI } from "../background-request-proxy";
import { FetchResponse } from "../type/requestType";

const STORAGE_KEY = "bsb_cache_cid_replacement_v1";
const MINUTE = 60000;
const DAY = 24 * 60 * MINUTE;
interface ReportState {
    scope: string;
    nextRequestAt: number;
    forbidden: boolean;
    pairs: Record<string, number>;
}
interface ReportResult { migrated: boolean }
const skipped: ReportResult = { migrated: false };
let flight: { key: string; promise: Promise<ReportResult> } | null = null;

function readState(): Promise<ReportState | undefined> {
    return new Promise((resolve, reject) => chrome.storage.local.get(STORAGE_KEY, items => {
        if (chrome.runtime.lastError) reject(new Error("CID cooldown storage unavailable"));
        else resolve(items?.[STORAGE_KEY] as ReportState | undefined);
    }));
}
function writeState(state: ReportState): Promise<void> {
    return new Promise((resolve, reject) => chrome.storage.local.set({ [STORAGE_KEY]: state }, () => {
        if (chrome.runtime.lastError) reject(new Error("CID cooldown storage unavailable"));
        else resolve();
    }));
}
function pairKey(candidate: CidReplacementCandidate): string {
    return `${candidate.videoID}:${candidate.oldCid}:${candidate.newCid}`;
}
function resultBody(response: FetchResponse, candidate: CidReplacementCandidate): { status: string; retryAfter?: number } | null {
    if (!response.ok || response.status !== 200) return null;
    try {
        const body = JSON.parse(response.responseText);
        return body.videoID === candidate.videoID && body.oldCid === candidate.oldCid && body.newCid === candidate.newCid
            && ["migrated", "rejected", "inconclusive"].includes(body.status) ? body : null;
    } catch { return null; }
}
function retryAt(response: FetchResponse, now: number): number {
    const value = response.retryAfter;
    if (!value) return 0;
    const seconds = Number(value);
    const time = Number.isFinite(seconds) ? now + Math.max(0, seconds) * 1000 : Date.parse(value);
    return Number.isFinite(time) ? time : 0;
}

/** One verification at a time across tabs. Persist before POST so worker restarts do not repeat it. */
export function reportCidReplacement(candidates: CidReplacementCandidate[]): Promise<ReportResult> {
    if (!Array.isArray(candidates) || !candidates.length || candidates.length > 100
        || !candidates.every(validCandidate)) return Promise.resolve(skipped);
    const first = candidates[0];
    if (candidates.some(c => c.videoID !== first.videoID || c.newCid !== first.newCid)) return Promise.resolve(skipped);
    const key = `${first.videoID}:${first.newCid}`;
    if (flight) return flight.key === key ? flight.promise : Promise.resolve(skipped);
    // MV3 can stop an idle worker before the synchronous verification responds.
    // Keep it active only for this bounded operation, never as a permanent background task.
    const heartbeat = chrome.runtime.getManifest?.().manifest_version === 3
        ? setInterval(() => chrome.runtime.getPlatformInfo(() => { void chrome.runtime.lastError; }), 20000)
        : null;
    const deadline = heartbeat === null ? null : setTimeout(() => clearInterval(heartbeat), 120000);
    const promise = runReport(candidates).catch(() => skipped).finally(() => {
        if (heartbeat !== null) clearInterval(heartbeat);
        if (deadline !== null) clearTimeout(deadline);
        flight = null;
    });
    flight = { key, promise };
    return promise;
}

async function runReport(candidates: CidReplacementCandidate[]): Promise<ReportResult> {
    await Config.ready;
    const userID = Config.config.userID;
    if (!Config.config.isVip || typeof userID !== "string" || !userID.trim()) return skipped;
    // Store no private ID. Account/server changes permit a new permission check.
    const scope = await getHash(JSON.stringify([await getHash(userID), getEffectiveServers(), Config.config.testingServer]), 1);
    const saved = await readState();
    const state: ReportState = saved?.scope === scope && saved.pairs && typeof saved.pairs === "object"
        ? saved : { scope, nextRequestAt: 0, forbidden: false, pairs: {} };
    const now = Date.now();
    if (state.forbidden || state.nextRequestAt > now) return skipped;
    const candidate = candidates.find(c => !(state.pairs[pairKey(c)] > now));
    if (!candidate) return skipped;
    const key = pairKey(candidate);
    state.pairs = Object.fromEntries(Object.entries(state.pairs).filter(([, until]) => Number.isFinite(until) && until > now)
        .sort((a, b) => b[1] - a[1]).slice(0, 199));
    state.pairs[key] = now + 10 * MINUTE;
    // At most 20 automatic POSTs/hour per browser, even for different videos.
    state.nextRequestAt = now + 3 * MINUTE;
    await writeState(state);
    if (!Config.config.isVip || Config.config.userID !== userID) return skipped;

    const options = { retry: false, httpsOnly: true, recordFailure: false, timeoutMs: 90000, maxResponseBytes: 1024 * 1024 };
    const response = await callAPI("POST", "/api/cidReplacement", { ...candidate, userID }, false, {}, options);
    let body = resultBody(response, candidate);
    let statusResponse = response;
    // A lost response does not mean the transaction failed. One read, never a POST retry or poll loop.
    if (response.status === -1 || response.status >= 500) {
        if (Config.config.isVip && Config.config.userID === userID) {
            statusResponse = await callAPI("GET", "/api/cidReplacement", { ...candidate }, false,
                { Authorization: `Bearer ${userID}` }, { ...options, timeoutMs: 15000 });
            body = resultBody(statusResponse, candidate);
        }
    }
    const finished = Date.now();
    state.forbidden = response.status === 403 || statusResponse.status === 403;
    const terminal = body?.status === "migrated" || body?.status === "rejected"
        || [400, 404, 405, 409, 422].includes(response.status);
    state.pairs[key] = Math.max(finished + (terminal ? DAY : 10 * MINUTE),
        Number.isFinite(body?.retryAfter) ? body.retryAfter : 0, retryAt(response, finished), retryAt(statusResponse, finished));
    if ([429, 503].includes(response.status) || body?.status === "inconclusive") {
        state.nextRequestAt = Math.max(state.nextRequestAt, finished + 10 * MINUTE,
            Number.isFinite(body?.retryAfter) ? body.retryAfter : 0, retryAt(response, finished), retryAt(statusResponse, finished));
    }
    // The pre-POST cooldown remains if this final storage write fails.
    await writeState(state).catch(() => undefined);
    return { migrated: body?.status === "migrated" };
}
