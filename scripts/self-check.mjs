import assert from 'node:assert/strict';
import { validateSavePayload, validateStoreShape, validateWeekData } from '../api/data.js';

const validWeek = {
    Majo: { 0: 'office', 1: 'home' },
    Tessa: {},
};

assert.deepEqual(validateWeekData(validWeek), validWeek);

assert.throws(
    () => validateWeekData({ Invitado: { 0: 'office' } }),
    /Persona no válida/
);

assert.throws(
    () => validateWeekData({ Majo: { 5: 'office' } }),
    /Día no válido/
);

assert.throws(
    () => validateWeekData({ Majo: { 0: 'moon' } }),
    /Estado no válido/
);

assert.deepEqual(
    validateSavePayload({
        weekKey: '2026-06-15',
        weekData: validWeek,
        etag: 'abc123',
    }),
    {
        weekKey: '2026-06-15',
        weekData: validWeek,
        etag: 'abc123',
    }
);

assert.deepEqual(
    validateStoreShape({
        '2026-06-15': validWeek,
    }),
    {
        '2026-06-15': validWeek,
    }
);

console.log('self-check ok');
