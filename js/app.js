import { DAYS, STATUS_OPTIONS, TEAM } from '../shared/config.js';

// ---- Constants ----
const CLEAR_OPTION = { key: null, emoji: '✕', label: 'Limpiar' };
const PICKER_OPTIONS = [...STATUS_OPTIONS, CLEAR_OPTION];
const AUTOSAVE_DELAY_MS = 1200;

// ---- State ----
let currentMonday = getMonday(new Date());
let data = {};
let versions = {};
let savedSnapshot = {};
let savedVersions = {};
let dirty = false;
let pollingTimer = null;
let autosaveTimer = null;

// ---- Helpers ----
function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function weekKey(monday) {
    return monday.toISOString().slice(0, 10);
}

function getMonday(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
}

function addDays(d, n) {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r;
}

function formatDate(d) {
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
}

function formatWeekLabel(monday) {
    const friday = addDays(monday, 4);
    return `${formatDate(monday)} — ${formatDate(friday)}`;
}

function emojiFor(key) {
    if (!key) return '';
    return STATUS_OPTIONS.find(option => option.key === key)?.emoji ?? '';
}

function getWeekData(monday) {
    const key = weekKey(monday);
    if (!data[key]) data[key] = {};
    return data[key];
}

function getStatus(monday, person, dayIdx) {
    return getWeekData(monday)[person]?.[dayIdx] ?? null;
}

function setStatus(monday, person, dayIdx, statusKey) {
    const wd = getWeekData(monday);
    if (!wd[person]) wd[person] = {};
    if (statusKey === null) delete wd[person][dayIdx];
    else wd[person][dayIdx] = statusKey;
    dirty = true;
    updateSaveButton();
    scheduleAutosave();
}

function applyServerState(payload) {
    data = payload.data ?? {};
    versions = payload.versions ?? {};
    savedSnapshot = clone(data);
    savedVersions = clone(versions);
}

// ---- API ----
async function fetchData() {
    showSpinner();
    try {
        const res = await fetch('/api/data');
        if (!res.ok) throw new Error('Network error');
        const payload = await res.json();
        applyServerState(payload);
        render();
    } catch (e) {
        data = {};
        versions = {};
        savedSnapshot = {};
        savedVersions = {};
        render();
        showToast('Error al cargar datos');
    } finally {
        hideSpinner();
        updateSaveButton();
    }
}

async function guardar({ automatic = false } = {}) {
    const key = weekKey(currentMonday);
    const currentWeekData = clone(getWeekData(currentMonday));
    clearAutosaveTimer();

    try {
        const res = await fetch('/api/data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                weekKey: key,
                weekData: currentWeekData,
                etag: versions[key]?.etag ?? null,
            }),
        });

        if (res.status === 409) {
            const conflict = await res.json();
            if (conflict.currentVersion) {
                versions[key] = conflict.currentVersion;
            }
            showToast('Hay cambios remotos. Recarga antes de guardar');
            return false;
        }

        if (!res.ok) {
            showToast('Error al guardar');
            return false;
        }

        const payload = await res.json();
        data[payload.weekKey] = payload.weekData;
        versions[payload.weekKey] = payload.version;
        savedSnapshot = clone(data);
        savedVersions = clone(versions);
        dirty = false;
        updateSaveButton();
        showToast(automatic ? 'Guardado automático' : 'Guardado correctamente');
        return true;
    } catch (e) {
        showToast('Error al guardar');
        return false;
    }
}

function clearAutosaveTimer() {
    clearTimeout(autosaveTimer);
    autosaveTimer = null;
}

function scheduleAutosave() {
    clearAutosaveTimer();
    autosaveTimer = setTimeout(() => {
        if (!dirty) return;
        guardar({ automatic: true });
    }, AUTOSAVE_DELAY_MS);
}

// ---- Polling ----
function startPolling() {
    stopPolling();
    pollingTimer = setInterval(async () => {
        if (dirty) return;
        try {
            const res = await fetch('/api/data');
            if (!res.ok) return;
            const payload = await res.json();
            const newData = payload.data ?? {};
            const newVersions = payload.versions ?? {};
            const key = weekKey(currentMonday);

            if (newVersions[key]?.etag !== savedVersions[key]?.etag) {
                patchTable(savedSnapshot[key] ?? {}, newData[key] ?? {});
            }

            data = newData;
            versions = newVersions;
            savedSnapshot = clone(newData);
            savedVersions = clone(newVersions);
        } catch (e) {}
    }, 30000);
}

function stopPolling() {
    clearInterval(pollingTimer);
    pollingTimer = null;
}

// ---- Render ----
function render() {
    const monday = currentMonday;
    document.getElementById('weekLabel').textContent = formatWeekLabel(monday);

    const headerRow = document.getElementById('headerRow');
    headerRow.innerHTML = '<th>Persona</th>';
    for (let i = 0; i < 5; i++) {
        const d = addDays(monday, i);
        const th = document.createElement('th');
        th.className = 'day-th';
        th.innerHTML = `<div class="day-name">${DAYS[i]}</div><div class="day-date">${formatDate(d)}</div>`;
        headerRow.appendChild(th);
    }

    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = '';
    const wd = getWeekData(monday);

    TEAM.forEach(person => {
        const tr = document.createElement('tr');

        const nameTd = document.createElement('td');
        nameTd.textContent = person;
        tr.appendChild(nameTd);

        for (let i = 0; i < 5; i++) {
            const td = document.createElement('td');
            const key = getStatus(monday, person, i);
            const emoji = emojiFor(key);

            const inner = document.createElement('div');
            inner.className = 'cell-inner';

            const btn = document.createElement('button');
            btn.className = 'status-btn' + (key ? ' active' : '');
            btn.textContent = emoji || '·';
            btn.title = key ? STATUS_OPTIONS.find(option => option.key === key)?.label : 'Sin estado';
            btn.dataset.person = person;
            btn.dataset.day = i;
            btn.addEventListener('click', event => openPicker(event, person, i, btn));

            inner.appendChild(btn);
            td.appendChild(inner);
            tr.appendChild(td);
        }

        tbody.appendChild(tr);
    });

    renderStats();
}

function renderStats() {
    const wd = getWeekData(currentMonday);
    let homeCount = 0;
    let officeCount = 0;
    let total = 0;

    TEAM.forEach(person => {
        for (let i = 0; i < 5; i++) {
            const status = wd[person]?.[i];
            if (status) total++;
            if (status === 'home') homeCount++;
            if (status === 'office' || status === 'mandatory') officeCount++;
        }
    });

    const bar = document.getElementById('statsBar');
    bar.innerHTML = `
    <div class="stat-pill">🏠 Home office <strong>${homeCount}</strong></div>
    <div class="stat-pill">🏢 Oficina <strong>${officeCount}</strong></div>
    <div class="stat-pill">📊 Registrados <strong>${total}/${TEAM.length * 5}</strong></div>
  `;
}

function patchTable(oldWeekData, newWeekData) {
    let changed = false;
    const key = weekKey(currentMonday);

    TEAM.forEach(person => {
        for (let i = 0; i < 5; i++) {
            const oldKey = oldWeekData[person]?.[i] ?? null;
            const newKey = newWeekData[person]?.[i] ?? null;
            if (oldKey !== newKey) {
                changed = true;
                if (!data[key]) data[key] = {};
                if (!data[key][person]) data[key][person] = {};
                if (newKey === null) delete data[key][person][i];
                else data[key][person][i] = newKey;

                const btn = document.querySelector(
                    `button.status-btn[data-person="${person}"][data-day="${i}"]`
                );
                if (btn) {
                    btn.textContent = newKey ? emojiFor(newKey) : '·';
                    btn.className = 'status-btn' + (newKey ? ' active' : '');
                    btn.title = newKey
                        ? STATUS_OPTIONS.find(option => option.key === newKey)?.label
                        : 'Sin estado';
                }
            }
        }
    });

    if (changed) renderStats();
}

// ---- Picker ----
let activePicker = { person: null, day: null, btn: null };

function openPicker(e, person, dayIdx, btn) {
    e.stopPropagation();
    const picker = document.getElementById('picker');
    const overlay = document.getElementById('overlay');

    activePicker = { person, day: dayIdx, btn };
    document.getElementById('pickerTitle').textContent = `${person} — ${DAYS[dayIdx]}`;

    const existing = picker.querySelectorAll('.picker-option');
    existing.forEach(el => el.remove());

    PICKER_OPTIONS.forEach(option => {
        const optionButton = document.createElement('button');
        optionButton.className = 'picker-option';
        optionButton.innerHTML = `<span class="opt-emoji">${option.emoji}</span> ${option.label}`;
        optionButton.addEventListener('click', () => {
            setStatus(currentMonday, person, dayIdx, option.key);
            closePicker();
            render();
            showToast(`${person}: ${option.label}`);
        });
        picker.appendChild(optionButton);
    });

    const rect = btn.getBoundingClientRect();
    const pickerWidth = 220;
    let left = rect.left + window.scrollX;
    let top = rect.bottom + window.scrollY + 6;
    if (left + pickerWidth > window.innerWidth - 10) left = window.innerWidth - pickerWidth - 10;

    picker.style.left = `${left}px`;
    picker.style.top = `${top}px`;
    picker.classList.add('visible');
    overlay.classList.add('visible');
}

function closePicker() {
    document.getElementById('picker').classList.remove('visible');
    document.getElementById('overlay').classList.remove('visible');
    activePicker = { person: null, day: null, btn: null };
}

// ---- Save Button ----
function updateSaveButton() {
    document.getElementById('btnGuardar').classList.toggle('hidden', !dirty);
}

async function navigateTo(newMonday) {
    if (dirty) {
        if (confirm('Tienes cambios sin guardar. ¿Guardar antes de navegar?')) {
            const saved = await guardar();
            if (!saved) return;
        } else {
            clearAutosaveTimer();
            data = clone(savedSnapshot);
            versions = clone(savedVersions);
            dirty = false;
            updateSaveButton();
        }
    }
    currentMonday = newMonday;
    render();
}

// ---- Toast ----
let toastTimer;
function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2000);
}

// ---- Spinner ----
function showSpinner() {
    document.getElementById('spinner').classList.remove('spinner-hidden');
}

function hideSpinner() {
    document.getElementById('spinner').classList.add('spinner-hidden');
}

// ---- Event Listeners ----
document.getElementById('overlay').addEventListener('click', closePicker);
document.getElementById('btnGuardar').addEventListener('click', guardar);
document.getElementById('prevWeek').addEventListener('click', () => {
    navigateTo(addDays(currentMonday, -7));
});
document.getElementById('nextWeek').addEventListener('click', () => {
    navigateTo(addDays(currentMonday, 7));
});

// ---- Init ----
fetchData();
startPolling();
