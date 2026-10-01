import { describe, expect, it } from 'vitest';
import { parseClientJson, ProtocolError, sanitizeCallsign, sanitizeRoomName } from './protocol.ts';

describe('protocol', () => {
  it('reads a hello and cleans its room and callsign', () => {
    const m = parseClientJson(JSON.stringify({ type: 'hello', version: 1, room: ' Friday Night!! ', callsign: '<b>Ace</b>', aircraftId: 'kestrel', mode: 'strike' }));
    expect(m).toMatchObject({ type: 'hello', version: 1, room: 'friday-night', callsign: 'bAceb', aircraftId: 'kestrel', mode: 'strike' });
  });

  it('reads the map, weather, clock and start of a hello, with safe defaults (M4)', () => {
    const m = parseClientJson(
      JSON.stringify({ type: 'hello', version: 3, aircraftId: 'kestrel', map: 'test-range', environment: { weather: 'rain', startHour: 23, clockRunning: true }, start: 'runway' }),
    );
    expect(m).toMatchObject({ map: 'test-range', environment: { weather: 'rain', startHour: 23, clockRunning: true }, start: 'runway' });
    const odd = parseClientJson(JSON.stringify({ type: 'hello', version: 3, aircraftId: 'kestrel', map: 'mars', environment: { weather: 'hail', startHour: 30 }, start: 'moon' }));
    expect(odd).toMatchObject({ map: 'lechovia', environment: { weather: 'clear', startHour: 6, clockRunning: false }, start: 'air' });
  });

  it('defaults an unknown mode to Dogfight and an empty room to the public room', () => {
    const m = parseClientJson(JSON.stringify({ type: 'hello', version: 1, aircraftId: 'kestrel', mode: 'chess' }));
    expect(m).toMatchObject({ room: 'public', callsign: 'Pilot', mode: 'team-deathmatch' });
  });

  it('rejects malformed, oversized or unknown messages with a ProtocolError', () => {
    for (const text of ['nope', '[]', '{"type":"hello"}', '{"type":"ping","t":"x"}', '{"type":"chat","index":99}', '{"type":"teleport"}', 'x'.repeat(3000)]) {
      expect(() => parseClientJson(text), text.slice(0, 20)).toThrow(ProtocolError);
    }
  });

  it('reads the M5 messages: a jet choice, Free Flight weather and clock, and fly-from-here', () => {
    expect(parseClientJson('{"type":"jet","aircraftId":"condor"}')).toEqual({ type: 'jet', aircraftId: 'condor' });
    expect(parseClientJson('{"type":"world","weather":"broken","hour":25,"clockRunning":true}')).toEqual({ type: 'world', weather: 'broken', hour: 1, clockRunning: true });
    expect(parseClientJson('{"type":"flyFrom","x":10,"z":-20}')).toEqual({ type: 'flyFrom', x: 10, z: -20 });
    expect(parseClientJson(JSON.stringify({ type: 'hello', version: 4, aircraftId: 'kestrel', mode: 'team-objective' }))).toMatchObject({ mode: 'team-objective' });
    for (const text of ['{"type":"jet"}', '{"type":"world","weather":"hail","hour":3}', '{"type":"world","weather":"rain","hour":"x"}', '{"type":"flyFrom","x":1}']) {
      expect(() => parseClientJson(text), text).toThrow(ProtocolError);
    }
  });

  it('keeps room names and callsigns short and plain', () => {
    expect(sanitizeRoomName('a'.repeat(40))).toHaveLength(24);
    expect(sanitizeRoomName('---')).toBe('public');
    expect(sanitizeCallsign(42)).toBe('Pilot');
  });
});
