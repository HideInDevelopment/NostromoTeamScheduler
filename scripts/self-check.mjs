import assert from 'node:assert/strict';
import { validateSavePayload, validateStoreShape, validateWeekData } from '../api/data.js';
import {
    EXTRA_DEFAULT_NAME,
    STATUS_OPTIONS,
    TEAM,
    createEmptyExtraWeekData,
    createEmptyTeamWeekData,
    createSeedWeekData,
} from '../shared/config.js';

const validWeek = {
    team: {
        ...createEmptyTeamWeekData(),
        Majo: { 0: 'office', 1: 'home' },
    },
    extra: {
        enabled: true,
        name: 'Refuerzo',
        days: { 2: 'mandatory' },
    },
};

assert.deepEqual(validateWeekData(validWeek), validWeek);

assert.deepEqual(
    validateWeekData({
        Majo: { 0: 'office', 1: 'home' },
        Tessa: {},
    }),
    {
        team: {
            ...createEmptyTeamWeekData(),
            Majo: { 0: 'office', 1: 'home' },
            Tessa: {},
        },
        extra: createEmptyExtraWeekData(),
    }
);

assert.throws(
    () => validateWeekData({ team: { Invitado: { 0: 'office' } } }),
    /Persona no válida/
);

assert.throws(
    () => validateWeekData({ team: { Majo: { 5: 'office' } } }),
    /Día no válido/
);

assert.throws(
    () => validateWeekData({ team: { Majo: { 0: 'moon' } } }),
    /Estado no válido/
);

assert.throws(
    () => validateWeekData({ extra: { enabled: 'si' } }),
    /Estado de integrante extra no válido/
);

assert.throws(
    () => validateWeekData({ extra: { name: 123 } }),
    /Nombre de integrante extra no válido/
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

const seededWeek = createSeedWeekData();
assert.deepEqual(Object.keys(seededWeek.team), TEAM);
assert.deepEqual(seededWeek.team.Majo, {});
assert.deepEqual(seededWeek.extra, createEmptyExtraWeekData());
assert.equal(seededWeek.extra.name, EXTRA_DEFAULT_NAME);
assert.equal(STATUS_OPTIONS.some(option => option.key === 'mandatory'), true);

console.log('self-check ok');
