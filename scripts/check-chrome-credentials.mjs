import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

class CheckError extends Error {}

async function requestJson(fetchImpl, stage, url, options) {
    let response;
    try {
        response = await fetchImpl(url, {
            ...options,
            redirect: 'error',
            signal: AbortSignal.timeout(30_000)
        });
    } catch {
        throw new CheckError(`${stage}: network request failed or timed out. Retry the check.`);
    }

    let data;
    try {
        data = await response.json();
    } catch {
        throw new CheckError(`${stage}: HTTP ${response.status}, invalid JSON response. Retry the check.`);
    }

    if (!response.ok) {
        // Never log response bodies: they can contain credentials or other private data.
        let advice = 'Check the API availability and configuration.';
        if (stage === 'OAuth refresh' && data?.error === 'invalid_grant') {
            advice = 'invalid_grant: reauthorize in Google OAuth Playground and replace CHROME_REFRESH_TOKEN in browser-stores.';
        } else if (stage === 'OAuth refresh' && data?.error === 'invalid_client') {
            advice = 'invalid_client: check CHROME_CLIENT_ID and CHROME_CLIENT_SECRET in browser-stores.';
        } else if (response.status === 401 || response.status === 403) {
            advice = 'Check the OAuth scope, developer account access, and publisher/item IDs.';
        } else if (response.status === 429 || response.status >= 500) {
            advice = 'The service is rate limited or unavailable. Retry the check.';
        }
        throw new CheckError(`${stage}: HTTP ${response.status}. ${advice}`);
    }
    return data;
}

export async function checkCredentials(env = process.env, fetchImpl = fetch) {
    const required = ['CHROME_PUBLISHER_ID', 'CHROME_ITEM_ID', 'CHROME_CLIENT_ID',
        'CHROME_CLIENT_SECRET', 'CHROME_REFRESH_TOKEN'];
    const missing = required.filter(name => !env[name]?.trim());
    if (missing.length) {
        throw new CheckError(`Missing browser-stores configuration: ${missing.join(', ')}.`);
    }

    const token = await requestJson(fetchImpl, 'OAuth refresh', 'https://oauth2.googleapis.com/token', {
        method: 'POST',
        body: new URLSearchParams({
            client_id: env.CHROME_CLIENT_ID,
            client_secret: env.CHROME_CLIENT_SECRET,
            refresh_token: env.CHROME_REFRESH_TOKEN,
            grant_type: 'refresh_token'
        })
    });
    if (typeof token?.access_token !== 'string' || !token.access_token.trim()) {
        throw new CheckError('OAuth refresh: response did not contain an access token.');
    }

    const name = `publishers/${encodeURIComponent(env.CHROME_PUBLISHER_ID)}/items/${encodeURIComponent(env.CHROME_ITEM_ID)}`;
    const status = await requestJson(fetchImpl, 'Chrome store query',
        `https://chromewebstore.googleapis.com/v2/${name}:fetchStatus`, {
            method: 'GET',
            headers: { Authorization: `Bearer ${token.access_token}` }
        });
    if (status?.itemId !== env.CHROME_ITEM_ID) {
        throw new CheckError('Chrome store query: response did not identify the configured extension.');
    }
    return 'Chrome credentials are valid: OAuth refresh and read-only store status query succeeded.';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    let message;
    try {
        message = await checkCredentials();
        console.log(message);
    } catch (error) {
        message = error instanceof CheckError ? error.message : 'Credential check failed unexpectedly.';
        console.error(`::error::${message}`);
        process.exitCode = 1;
    }
    if (process.env.GITHUB_STEP_SUMMARY) {
        appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${message}\n`);
    }
}
