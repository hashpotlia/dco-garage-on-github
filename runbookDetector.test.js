import { runbookDetector } from './runbookDetector.js';

describe('runbookDetector.extractInfo', () => {
  test('extracts host type and hardware ID', () => {
    const text = '[EC2X1] SNX.12345';
    const info = runbookDetector.extractInfo(text);
    expect(info.hostType).toBe('EC2X1');
    expect(info.hardwareId).toBe('SNX.12345');
    expect(info.vendor).toBeUndefined();
  });
});
