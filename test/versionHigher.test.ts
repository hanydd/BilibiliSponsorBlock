import { versionHigher } from '../src/versionHigher';

test('versionHigher', () => {
    expect(versionHigher('1.0.0', '1.0.0')).toBe(false);
    expect(versionHigher('1.0.0', '1.0.1')).toBe(false);
    expect(versionHigher('1.0.0', '1.1.0')).toBe(false);
    expect(versionHigher('1.0.0', '2.0.0')).toBe(false);
    expect(versionHigher('1.0.1', '1.0.0')).toBe(true);
    expect(versionHigher('1.1.0', '1.0.0')).toBe(true);
    expect(versionHigher('2.0.0', '1.0.0')).toBe(true);
    expect(versionHigher('0.6.3', '1.0.0')).toBe(false);
});