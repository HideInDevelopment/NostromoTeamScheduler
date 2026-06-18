import { BlobNotFoundError, get, head, list, put } from '@vercel/blob';

const TEAM = ['Majo', 'Duván', 'Dani', 'Vega', 'Salva', 'Manu', 'Javi', 'Tessa'];
const VALID_STATUSES = new Set([
    'home',
    'office',
    'mandatory',
    'travel',
    'holiday',
    'vacation',
    'illness',
    'training',
]);
const WEEKS_PREFIX = 'weeks/';
const LEGACY_PATH = 'teamschedule.json';

const INITIAL = {
    Majo: { 0: 'office', 1: 'office', 2: 'mandatory', 3: 'home', 4: 'home' },
    'Duván': { 0: 'office', 1: 'office', 2: 'mandatory', 3: 'home', 4: 'home' },
    Dani: { 0: 'office', 1: 'home', 2: 'mandatory', 3: 'home', 4: 'office' },
    Vega: { 0: 'home', 1: 'office', 2: 'mandatory', 3: 'home', 4: 'home' },
    Salva: { 0: 'home', 1: 'office', 2: 'mandatory', 3: 'home', 4: 'home' },
    Manu: { 0: 'home', 1: 'office', 2: 'mandatory', 3: 'home', 4: 'office' },
    Javi: { 0: 'office', 1: 'home', 2: 'mandatory', 3: 'home', 4: 'office' },
    Tessa: {},
};

function getMonday(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
}

function weekKey(monday) {
    return monday.toISOString().slice(0, 10);
}

function isWeekKey(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function weekPath(week) {
    return `${WEEKS_PREFIX}${week}.json`;
}

function buildSeed() {
    const key = weekKey(getMonday(new Date()));
    return {
        [key]: TEAM.reduce((acc, person) => {
            acc[person] = INITIAL[person] ? { ...INITIAL[person] } : {};
            return acc;
        }, {}),
    };
}

function toVersion(blob) {
    return {
        etag: blob.etag,
        updatedAt: new Date(blob.uploadedAt).toISOString(),
    };
}

async function readJsonBlob(pathname) {
    const result = await get(pathname, { access: 'private', useCache: false });
    if (!result || result.statusCode !== 200) return null;
    const text = await new Response(result.stream).text();
    return { json: JSON.parse(text), blob: result.blob };
}

async function listAllWeekBlobs() {
    const blobs = [];
    let cursor;

    do {
        const page = await list({ prefix: WEEKS_PREFIX, cursor, limit: 1000 });
        blobs.push(...page.blobs.filter(blob => blob.pathname.endsWith('.json')));
        cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);

    return blobs.sort((a, b) => a.pathname.localeCompare(b.pathname));
}

export function validateWeekData(weekData) {
    if (!weekData || typeof weekData !== 'object' || Array.isArray(weekData)) {
        throw new Error('Formato de semana no válido');
    }

    const normalized = {};

    for (const [person, days] of Object.entries(weekData)) {
        if (!TEAM.includes(person)) {
            throw new Error(`Persona no válida: ${person}`);
        }
        if (!days || typeof days !== 'object' || Array.isArray(days)) {
            throw new Error(`Formato de días no válido para ${person}`);
        }

        const normalizedDays = {};
        for (const [dayKey, statusKey] of Object.entries(days)) {
            if (!/^[0-4]$/.test(dayKey)) {
                throw new Error(`Día no válido para ${person}: ${dayKey}`);
            }
            if (!VALID_STATUSES.has(statusKey)) {
                throw new Error(`Estado no válido para ${person}: ${statusKey}`);
            }
            normalizedDays[dayKey] = statusKey;
        }

        normalized[person] = normalizedDays;
    }

    return normalized;
}

export function validateStoreShape(store) {
    if (!store || typeof store !== 'object' || Array.isArray(store)) {
        throw new Error('Formato de calendario no válido');
    }

    const normalized = {};
    for (const [week, weekData] of Object.entries(store)) {
        if (!isWeekKey(week)) {
            throw new Error(`Semana no válida: ${week}`);
        }
        normalized[week] = validateWeekData(weekData);
    }
    return normalized;
}

export function validateSavePayload(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new Error('Payload no válido');
    }
    if (!isWeekKey(payload.weekKey)) {
        throw new Error('Semana no válida');
    }
    if (payload.etag !== null && payload.etag !== undefined && typeof payload.etag !== 'string') {
        throw new Error('ETag no válido');
    }

    return {
        weekKey: payload.weekKey,
        etag: payload.etag ?? null,
        weekData: validateWeekData(payload.weekData ?? {}),
    };
}

async function writeWeek(week, weekData) {
    await put(weekPath(week), JSON.stringify(weekData), {
        access: 'private',
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: 'application/json',
    });

    const blob = await head(weekPath(week));
    return {
        weekKey: week,
        weekData,
        version: toVersion(blob),
    };
}

async function readWeekStore() {
    const blobs = await listAllWeekBlobs();
    if (blobs.length === 0) return null;

    const data = {};
    const versions = {};

    for (const blob of blobs) {
        const week = blob.pathname.slice(WEEKS_PREFIX.length, -'.json'.length);
        if (!isWeekKey(week)) continue;
        const result = await readJsonBlob(blob.pathname);
        if (!result) continue;
        data[week] = validateWeekData(result.json);
        versions[week] = toVersion(blob);
    }

    return { data, versions };
}

async function migrateLegacyStore() {
    const legacy = await readJsonBlob(LEGACY_PATH);
    if (!legacy) return null;

    const normalized = validateStoreShape(legacy.json);
    const versions = {};

    for (const [week, weekData] of Object.entries(normalized)) {
        const saved = await writeWeek(week, weekData);
        versions[week] = saved.version;
    }

    return { data: normalized, versions };
}

async function ensureStore() {
    const weeks = await readWeekStore();
    if (weeks) return weeks;

    const migrated = await migrateLegacyStore();
    if (migrated) return migrated;

    const seeded = buildSeed();
    const versions = {};

    for (const [week, weekData] of Object.entries(seeded)) {
        const saved = await writeWeek(week, weekData);
        versions[week] = saved.version;
    }

    return { data: seeded, versions };
}

async function getCurrentVersion(week) {
    try {
        const blob = await head(weekPath(week));
        return toVersion(blob);
    } catch (error) {
        if (error instanceof BlobNotFoundError) return null;
        throw error;
    }
}

export default async function handler(req, res) {
    if (req.method === 'GET') {
        try {
            const store = await ensureStore();
            return res.status(200).json(store);
        } catch (error) {
            console.error('GET /api/data failed', error);
            return res.status(500).json({ error: 'No se pudo cargar el calendario' });
        }
    }

    if (req.method === 'POST') {
        try {
            const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
            const payload = validateSavePayload(body);
            const currentVersion = await getCurrentVersion(payload.weekKey);

            const currentEtag = currentVersion?.etag ?? null;
            if (currentEtag !== (payload.etag ?? null)) {
                return res.status(409).json({
                    error: 'La semana ha cambiado en remoto',
                    currentVersion,
                });
            }

            const saved = await writeWeek(payload.weekKey, payload.weekData);
            return res.status(200).json({ ok: true, ...saved });
        } catch (error) {
            if (error instanceof SyntaxError) {
                return res.status(400).json({ error: 'JSON no válido' });
            }

            if (error.message?.includes('no válido')) {
                return res.status(400).json({ error: error.message });
            }

            console.error('POST /api/data failed', error);
            return res.status(500).json({ error: 'No se pudo guardar la semana' });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
