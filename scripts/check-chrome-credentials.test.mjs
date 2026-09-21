import assert from 'node:assert/strict';
import test from 'node:test';
import { checkCredentials } from './check-chrome-credentials.mjs';

const env = {
    CHROME_PUBLISHER_ID: 'publisher',
    CHROME_ITEM_ID: 'extension',
    CHROME_CLIENT_ID: 'client',
    CHROME_CLIENT_SECRET: 'fake-client-secret',
    CHROME_REFRESH_TOKEN: 'fake-refresh-token'
};

test('refreshes access token and only reads store status', async () => {
    const calls = [];
    const message = await checkCredentials(env, async (url, options) => {
        calls.push({ url, ...options });
        return Response.json(calls.length === 1
            ? { access_token: 'fake-access-token' }
            : { itemId: env.CHROME_ITEM_ID });
    });
    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, 'https://oauth2.googleapis.com/token');
    assert.equal(calls[0].method, 'POST');
    assert.deepEqual(Object.fromEntries(calls[0].body), {
        client_id: env.CHROME_CLIENT_ID, client_secret: env.CHROME_CLIENT_SECRET,
        refresh_token: env.CHROME_REFRESH_TOKEN, grant_type: 'refresh_token'
    });
    assert.equal(calls[1].url, 'https://chromewebstore.googleapis.com/v2/publishers/publisher/items/extension:fetchStatus');
    assert.equal(calls[1].method, 'GET');
    assert.equal(calls[1].body, undefined);
    assert.equal(calls[1].headers.Authorization, 'Bearer fake-access-token');
    assert.ok(calls.every(call => call.redirect === 'error' && call.signal instanceof AbortSignal));
    assert.match(message, /succeeded/);
    assert.doesNotMatch(message, /fake-/);
});

test('missing configuration fails before any request', async () => {
    await assert.rejects(checkCredentials({ ...env, CHROME_REFRESH_TOKEN: '' }, () => {
        assert.fail('must not make a request');
    }), /Missing browser-stores configuration: CHROME_REFRESH_TOKEN/);
});

test('invalid grant stops before querying store and never echoes response details', async () => {
    let requests = 0;
    await assert.rejects(checkCredentials(env, async () => {
        requests++;
        return Response.json({ error: 'invalid_grant', error_description: env.CHROME_REFRESH_TOKEN }, { status: 400 });
    }), error => {
        assert.match(error.message, /invalid_grant.*reauthorize/);
        assert.doesNotMatch(error.message, /fake-/);
        return true;
    });
    assert.equal(requests, 1);
});

test('store permission failures fail the check without echoing private response', async () => {
    let requests = 0;
    await assert.rejects(checkCredentials(env, async () => ++requests === 1
        ? Response.json({ access_token: 'fake-access-token' })
        : Response.json({ error: { message: 'fake-access-token' } }, { status: 403 })),
    /Chrome store query: HTTP 403\. Check the OAuth scope/);
});

test('malformed success responses fail rather than reporting healthy credentials', async () => {
    await assert.rejects(checkCredentials(env, async () => Response.json({})), /did not contain an access token/);
    await assert.rejects(checkCredentials(env, async () => new Response('fake-private-response')), /invalid JSON/);
    let requests = 0;
    await assert.rejects(checkCredentials(env, async () => Response.json(++requests === 1
        ? { access_token: 'fake-access-token' } : { itemId: 'wrong-extension' })), /configured extension/);
});

test('network errors do not leak request details', async () => {
    await assert.rejects(checkCredentials(env, async () => {
        throw new Error(`request failed: ${env.CHROME_CLIENT_SECRET}`);
    }), error => {
        assert.match(error.message, /network request failed or timed out/);
        assert.doesNotMatch(error.message, /fake-/);
        return true;
    });
});
