import { put, get } from '@vercel/blob';

const TEAM = ['Majo', 'Duván', 'Dani', 'Vega', 'Salva', 'Manu', 'Javi', 'Tessa'];

const INITIAL = {
    'Majo':  { 0:'office', 1:'office', 2:'mandatory', 3:'home', 4:'home' },
    'Duván': { 0:'office', 1:'office', 2:'mandatory', 3:'home', 4:'home' },
    'Dani':  { 0:'office', 1:'home',   2:'mandatory', 3:'home', 4:'office' },
    'Vega':  { 0:'home',   1:'office', 2:'mandatory', 3:'home', 4:'home' },
    'Salva': { 0:'home',   1:'office', 2:'mandatory', 3:'home', 4:'home' },
    'Manu':  { 0:'home',   1:'office', 2:'mandatory', 3:'home', 4:'office' },
    'Javi':  { 0:'office', 1:'home',   2:'mandatory', 3:'home', 4:'office' },
    'Tessa': {},
};

function getMonday(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = (day === 0) ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
}

function weekKey(monday) {
    return monday.toISOString().slice(0, 10);
}

function buildSeed() {
    const key = weekKey(getMonday(new Date()));
    const stored = {};
    stored[key] = {};
    TEAM.forEach(p => {
        stored[key][p] = INITIAL[p] ? { ...INITIAL[p] } : {};
    });
    return stored;
}

export default async function handler(req, res) {
    if (req.method === 'GET') {
        try {
            const { stream } = await get('teamschedule.json', { access: 'private' });
            const text = await new Response(stream).text();
            return res.status(200).json(JSON.parse(text));
        } catch {
            const seeded = buildSeed();
            await put('teamschedule.json', JSON.stringify(seeded), {
                access: 'private',
                addRandomSuffix: false,
                contentType: 'application/json',
                allowOverwrite: true,
            });
            return res.status(200).json(seeded);
        }
    }

    if (req.method === 'POST') {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        await put('teamschedule.json', JSON.stringify(body), {
            access: 'private',
            addRandomSuffix: false,
            contentType: 'application/json',
            allowOverwrite: true,
        });
        return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
