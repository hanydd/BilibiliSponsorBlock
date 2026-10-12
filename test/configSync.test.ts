import { ProtoConfig, StorageChangesObject } from '../src/config/config';

jest.mock('../src/utils/', () => ({ isFirefox: () => false }));

type Settings = { invidiousInstances: string[]; categories: string[]; duration: number };
async function setup() {
    jest.useFakeTimers();
    const persisted: Settings = { invidiousInstances: [], categories: [], duration: 4 };
    let onChanged: (changes: StorageChangesObject, area: string) => void;
    const writes: Array<{ values: Partial<Settings>; done: () => void }> = [];
    global.chrome = {
        runtime: {},
        storage: {
            onChanged: { addListener: listener => { onChanged = listener; } },
            sync: {
                get: (_keys, done) => done(JSON.parse(JSON.stringify(persisted))),
                set: (values, done = () => undefined) => { writes.push({ values: JSON.parse(JSON.stringify(values)), done }); return Promise.resolve(); },
                remove: key => { delete persisted[key]; onChanged({ [key]: { newValue: undefined } }, 'sync'); },
            },
            local: { get: (_keys, done) => done({ navigationApiAvailable: false }) },
        },
    } as unknown as typeof chrome;
    const config = new ProtoConfig<Settings, { navigationApiAvailable: boolean }>(persisted, { navigationApiAvailable: false }, () => undefined);
    await config.ready;
    const finish = () => {
        const write = writes.shift()!;
        const changes = Object.fromEntries(Object.entries(write.values).map(([key, newValue]) => [key, { oldValue: persisted[key], newValue }]));
        Object.assign(persisted, write.values);
        onChanged(changes, 'sync');
        write.done();
    };
    return { config, writes, finish, persisted, external: (values: Partial<Settings>) => {
        Object.assign(persisted, values);
        onChanged(Object.fromEntries(Object.entries(values).map(([key, newValue]) => [key, { newValue }])), 'sync');
    } };
}

afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

test('an earlier storage echo cannot erase queued category edits or later edits based on them', async () => {
    const { config, writes, finish, persisted } = await setup();
    const observed = jest.fn();
    config.configSyncListeners.push(observed);
    config.config.categories = ['A'];
    config.config.categories = [...config.config.categories, 'B'];
    finish(); // A's delayed echo arrives while A+B is waiting to be written.
    expect(config.config.categories).toEqual(['A', 'B']);
    expect(observed).not.toHaveBeenCalled();
    config.config.categories = [...config.config.categories, 'C'];
    jest.advanceTimersByTime(20);
    expect(writes[0].values.categories).toEqual(['A', 'B', 'C']);
    finish();
    expect(persisted.categories).toEqual(['A', 'B', 'C']);
    expect(observed).toHaveBeenCalledTimes(1);
});

test('older acknowledgements do not release newer writes already in flight', async () => {
    const { config, finish, external } = await setup();
    config.config.duration = 1;
    config.config.duration = 12;
    jest.advanceTimersByTime(20);
    finish();
    expect(config.config.duration).toBe(12);
    finish();
    external({ duration: 6 });
    expect(config.config.duration).toBe(6);
});

test('different pending keys survive independently and external changes still arrive', async () => {
    const { config, finish, external } = await setup();
    config.config.categories = ['A'];
    config.config.duration = 12;
    finish();
    external({ categories: ['remote'] });
    expect(config.config.categories).toEqual(['remote']);
    expect(config.config.duration).toBe(12);
    jest.advanceTimersByTime(20); finish();
    expect(config.config.duration).toBe(12);
});

test('forced updates of mutable settings use the same write protection', async () => {
    const { config, finish, persisted } = await setup();
    config.config.categories.push('A'); config.forceSyncUpdate('categories');
    config.config.categories.push('B'); config.forceSyncUpdate('categories');
    finish();
    expect(config.config.categories).toEqual(['A', 'B']);
    jest.advanceTimersByTime(20); finish();
    expect(persisted.categories).toEqual(['A', 'B']);
});

test('an unchanged-value write releases its guard even without a storage event', async () => {
    const { config, writes, external } = await setup();
    config.config.duration = 4;
    writes.shift()!.done();
    external({ duration: 8 });
    expect(config.config.duration).toBe(8);
});

test('a rejected write releases its guard so external settings can still be received', async () => {
    const { config, writes, external } = await setup();
    const log = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    config.config.duration = 12;
    Object.assign(chrome.runtime, { lastError: { message: 'quota exceeded' } });
    writes.shift()!.done();
    Reflect.deleteProperty(chrome.runtime, 'lastError');
    external({ duration: 8 });
    expect(config.config.duration).toBe(8);
    expect(log).toHaveBeenCalled();
    log.mockRestore();
});

test('deleting a queued setting does not resurrect it when the batch timer fires', async () => {
    const { config, writes, finish, persisted } = await setup();
    config.config.duration = 1;
    config.config.duration = 12;
    finish();
    delete config.config.duration;
    jest.advanceTimersByTime(20);
    expect(writes).toHaveLength(0);
    expect(persisted.duration).toBeUndefined();
    expect(config.config.duration).toBeUndefined();
});

test('a delayed batch cannot overwrite a newer immediate write to the same key', async () => {
    const { config, writes, finish, persisted } = await setup();
    config.config.duration = 1;
    config.config.duration = 12;
    jest.setSystemTime(Date.now() + 200); // Advance wall time without dispatching the batch timer.
    config.config.duration = 123;
    finish(); finish();
    jest.advanceTimersByTime(20);
    expect(writes).toHaveLength(0);
    expect(persisted.duration).toBe(123);
});

test('changing a setting back does not let a matching older acknowledgement release it', async () => {
    const { config, finish, persisted } = await setup();
    config.config.duration = 1;
    config.config.duration = 2;
    jest.advanceTimersByTime(20);
    config.config.duration = 1;
    finish(); finish();
    expect(config.config.duration).toBe(1);
    jest.advanceTimersByTime(20); finish();
    expect(persisted.duration).toBe(1);
});
