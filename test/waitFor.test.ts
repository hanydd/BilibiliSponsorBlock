import { waitFor } from "../src/utils/";

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
});

test("checks immediately and releases the timeout when already ready", async () => {
    const value = { ready: true };
    const condition = jest.fn(() => value);
    const waiting = waitFor(condition);

    expect(condition).toHaveBeenCalledTimes(1);
    await expect(waiting).resolves.toBe(value);
    expect(jest.getTimerCount()).toBe(0);
    jest.advanceTimersByTime(5000);
    expect(condition).toHaveBeenCalledTimes(1);
});

test("stops checking after a delayed success with a day-long timeout", async () => {
    let ready = false;
    const condition = jest.fn(() => ready);
    const waiting = waitFor(condition, 24 * 60 * 60 * 1000, 100);

    jest.advanceTimersByTime(99);
    expect(condition).toHaveBeenCalledTimes(1);
    ready = true;
    jest.advanceTimersByTime(1);
    await expect(waiting).resolves.toBe(true);
    expect(jest.getTimerCount()).toBe(0);
    jest.advanceTimersByTime(24 * 60 * 60 * 1000);
    expect(condition).toHaveBeenCalledTimes(2);
});

test("uses the predicate even when the condition returns a truthy snapshot", async () => {
    let ready = false;
    const condition = jest.fn(() => ({ ready }));
    const waiting = waitFor(condition, 1000, 100, (snapshot) => snapshot.ready);

    jest.advanceTimersByTime(100);
    expect(condition).toHaveBeenCalledTimes(2);
    ready = true;
    jest.advanceTimersByTime(100);
    await expect(waiting).resolves.toEqual({ ready: true });
    expect(jest.getTimerCount()).toBe(0);
});

test("allows a predicate to accept a falsy result", async () => {
    await expect(waitFor(() => 0, undefined, undefined, (value) => value === 0)).resolves.toBe(0);
    expect(jest.getTimerCount()).toBe(0);
});

test("preserves the default timeout and rejection format and stops polling on timeout", async () => {
    const condition = jest.fn(() => null);
    const waiting = waitFor(condition);
    const rejection = expect(waiting).rejects.toMatch(/^TIMEOUT waiting for /);

    jest.advanceTimersByTime(4999);
    expect(condition).toHaveBeenCalledTimes(50);
    jest.advanceTimersByTime(1);
    await rejection;
    expect(jest.getTimerCount()).toBe(0);
    jest.advanceTimersByTime(5000);
    expect(condition).toHaveBeenCalledTimes(50);
});

test("preserves timeout priority when the next poll falls exactly on the deadline", async () => {
    let ready = false;
    const condition = jest.fn(() => ready);
    const waiting = waitFor(condition, 100, 100);
    const rejection = expect(waiting).rejects.toMatch(/^TIMEOUT waiting for /);

    ready = true;
    jest.advanceTimersByTime(100);
    await rejection;
    expect(condition).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
});

test("keeps concurrent waits independent when one succeeds and another times out", async () => {
    let ready = false;
    const first = waitFor(() => ready, 1000, 50);
    const second = waitFor(() => null, 200, 50);
    const rejection = expect(second).rejects.toMatch(/^TIMEOUT waiting for /);

    ready = true;
    jest.advanceTimersByTime(50);
    await expect(first).resolves.toBe(true);
    jest.advanceTimersByTime(150);
    await rejection;
    expect(jest.getTimerCount()).toBe(0);
});

test("releases all timers after a batch of delayed thumbnail waits", async () => {
    let ready = false;
    const conditions = Array.from({ length: 200 }, () => jest.fn(() => ready));
    const waiting = Promise.all(conditions.map((condition) => waitFor(condition, 10000, 100)));

    ready = true;
    jest.advanceTimersByTime(100);
    await waiting;
    expect(jest.getTimerCount()).toBe(0);
    jest.advanceTimersByTime(10000);
    for (const condition of conditions) expect(condition).toHaveBeenCalledTimes(2);
});
