import {
    DAYS,
    EXTRA_DEFAULT_NAME,
    STATUS_OPTIONS,
    TEAM,
    createEmptyExtraWeekData,
    createSeedWeekData,
} from '../shared/config.js';

// ---- Constants ----
const CLEAR_OPTION = { key: null, emoji: '✕', label: 'Limpiar' };
const PICKER_OPTIONS = [...STATUS_OPTIONS, CLEAR_OPTION];
const AUTOSAVE_DELAY_MS = 1200;
const SAVE_BUTTON_LABEL = '💾 Guardar';
const SAVING_BUTTON_LABEL = '⏳ Guardando...';
const EXTRA_ROW_ID = '__extra__';

// ---- State ----
let currentMonday = getMonday(new Date());
let data = {};
let versions = {};
let savedSnapshot = {};
let savedVersions = {};
let dirty = false;
let pollingTimer = null;
let autosaveTimer = null;
let saveInFlight = false;
let queuedSave = false;
let localChangeToken = 0;

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
    if (!data[key]) data[key] = createSeedWeekData();
    return data[key];
}

function getTeamWeekData(monday) {
    return getWeekData(monday).team;
}

function getExtraWeekData(monday) {
    const weekData = getWeekData(monday);
    if (!weekData.extra) weekData.extra = createEmptyExtraWeekData();
    return weekData.extra;
}

function getExtraName(monday) {
    return getExtraWeekData(monday).name || EXTRA_DEFAULT_NAME;
}

function isExtraEnabled(monday) {
    return getExtraWeekData(monday).enabled === true;
}

function getStatus(monday, person, dayIdx) {
    if (person === EXTRA_ROW_ID) {
        return getExtraWeekData(monday).days?.[dayIdx] ?? null;
    }
    return getTeamWeekData(monday)[person]?.[dayIdx] ?? null;
}

function setStatus(monday, person, dayIdx, statusKey) {
    if (person === EXTRA_ROW_ID) {
        const extra = getExtraWeekData(monday);
        if (statusKey === null) delete extra.days[dayIdx];
        else extra.days[dayIdx] = statusKey;
    } else {
        const teamWeekData = getTeamWeekData(monday);
        if (!teamWeekData[person]) teamWeekData[person] = {};
        if (statusKey === null) delete teamWeekData[person][dayIdx];
        else teamWeekData[person][dayIdx] = statusKey;
    }
    markDirty();
}

function setExtraEnabled(monday, enabled) {
    const extra = getExtraWeekData(monday);
    extra.enabled = enabled;
    if (enabled && !extra.name) {
        extra.name = EXTRA_DEFAULT_NAME;
    }
    markDirty();
}

function setExtraName(monday, name) {
    const extra = getExtraWeekData(monday);
    extra.name = name.trim() || EXTRA_DEFAULT_NAME;
    markDirty();
}

function markDirty() {
    localChangeToken += 1;
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

async function readErrorMessage(res, fallback) {
    try {
        const payload = await res.json();
        return payload.error || fallback;
    } catch (error) {
        console.error('No se pudo leer la respuesta de error', error);
        return fallback;
    }
}

// ---- API ----
async function fetchData() {
    showSpinner();
    try {
        const res = await fetch('/api/data');
        if (!res.ok) throw new Error(await readErrorMessage(res, 'Error al cargar datos'));
        const payload = await res.json();
        applyServerState(payload);
        render();
    } catch (e) {
        console.error('Error cargando datos', e);
        data = {};
        versions = {};
        savedSnapshot = {};
        savedVersions = {};
        render();
        showToast(e.message || 'Error al cargar datos');
    } finally {
        hideSpinner();
        updateSaveButton();
    }
}

async function guardar({ automatic = false } = {}) {
    if (saveInFlight) {
        queuedSave = true;
        updateSaveButton();
        return false;
    }

    const key = weekKey(currentMonday);
    const currentWeekData = clone(getWeekData(currentMonday));
    const saveToken = localChangeToken;
    const currentEtag = versions[key]?.etag ?? null;

    clearAutosaveTimer();
    saveInFlight = true;
    queuedSave = false;
    updateSaveButton();

    try {
        const res = await fetch('/api/data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                weekKey: key,
                weekData: currentWeekData,
                etag: currentEtag,
            }),
        });

        if (res.status === 409) {
            const conflict = await res.json();
            if (conflict.currentVersion) {
                versions[key] = conflict.currentVersion;
            }
            console.warn('Conflicto al guardar semana', key, conflict);
            showToast('Hay cambios remotos. Recarga antes de guardar');
            return false;
        }

        if (!res.ok) {
            showToast(await readErrorMessage(res, 'Error al guardar'));
            return false;
        }

        const payload = await res.json();
        versions[payload.weekKey] = payload.version;
        savedSnapshot[payload.weekKey] = payload.weekData;
        savedVersions[payload.weekKey] = payload.version;

        if (localChangeToken === saveToken) {
            dirty = false;
        } else {
            queuedSave = true;
            dirty = true;
        }

        if (!automatic) {
            showToast('Semana guardada');
        }
        updateSaveButton();
        return true;
    } catch (e) {
        console.error('Error guardando semana', key, e);
        showToast(e.message || 'Error al guardar');
        return false;
    } finally {
        saveInFlight = false;
        updateSaveButton();

        if (queuedSave && dirty) {
            queuedSave = false;
            guardar({ automatic: true });
        }
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
                patchTable(savedSnapshot[key] ?? createSeedWeekData(), newData[key] ?? createSeedWeekData());
            }

            data = newData;
            versions = newVersions;
            savedSnapshot = clone(newData);
            savedVersions = clone(newVersions);
        } catch (e) {
            console.error('Error refrescando calendario', e);
        }
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

    TEAM.forEach(person => {
        const tr = document.createElement('tr');

        const nameTd = document.createElement('td');
        nameTd.textContent = person;
        tr.appendChild(nameTd);

        for (let i = 0; i < 5; i++) {
            tr.appendChild(createStatusCell(monday, person, person, i));
        }

        tbody.appendChild(tr);
    });

    if (isExtraEnabled(monday)) {
        const tr = document.createElement('tr');
        tr.className = 'extra-row';

        const nameTd = document.createElement('td');
        nameTd.className = 'extra-name-cell';

        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'extra-name-input';
        nameInput.value = getExtraName(monday);
        nameInput.maxLength = 40;
        nameInput.placeholder = EXTRA_DEFAULT_NAME;
        nameInput.setAttribute('aria-label', 'Nombre del integrante extra');
        nameInput.addEventListener('change', () => {
            setExtraName(monday, nameInput.value);
            render();
        });
        nameInput.addEventListener('blur', () => {
            const normalizedName = getExtraName(monday);
            if (nameInput.value !== normalizedName) {
                nameInput.value = normalizedName;
            }
        });

        nameTd.appendChild(nameInput);
        tr.appendChild(nameTd);

        for (let i = 0; i < 5; i++) {
            tr.appendChild(createStatusCell(monday, EXTRA_ROW_ID, getExtraName(monday), i));
        }

        tbody.appendChild(tr);
    }

    renderStats();
    renderExtraToggle();
}

function createStatusCell(monday, personId, label, dayIdx) {
    const td = document.createElement('td');
    const key = getStatus(monday, personId, dayIdx);
    const emoji = emojiFor(key);

    const inner = document.createElement('div');
    inner.className = 'cell-inner';

    const btn = document.createElement('button');
    btn.className = 'status-btn' + (key ? ' active' : '');
    btn.textContent = emoji || '·';
    btn.title = key ? STATUS_OPTIONS.find(option => option.key === key)?.label : 'Sin estado';
    btn.dataset.person = personId;
    btn.dataset.day = dayIdx;
    btn.addEventListener('click', event => openPicker(event, label, dayIdx, btn, personId));

    inner.appendChild(btn);
    td.appendChild(inner);
    return td;
}

function renderStats() {
    const teamWeekData = getTeamWeekData(currentMonday);
    const extra = getExtraWeekData(currentMonday);
    let homeCount = 0;
    let officeCount = 0;
    let total = 0;
    let slots = TEAM.length * 5;

    TEAM.forEach(person => {
        for (let i = 0; i < 5; i++) {
            const status = teamWeekData[person]?.[i];
            if (status) total++;
            if (status === 'home') homeCount++;
            if (status === 'office' || status === 'mandatory') officeCount++;
        }
    });

    if (extra.enabled) {
        slots += 5;
        for (let i = 0; i < 5; i++) {
            const status = extra.days?.[i];
            if (status) total++;
            if (status === 'home') homeCount++;
            if (status === 'office' || status === 'mandatory') officeCount++;
        }
    }

    const bar = document.getElementById('statsBar');
    bar.innerHTML = `
    <div class="stat-pill">🏠 Home office <strong>${homeCount}</strong></div>
    <div class="stat-pill">🏢 Oficina <strong>${officeCount}</strong></div>
    <div class="stat-pill">📊 Registrados <strong>${total}/${slots}</strong></div>
  `;
}

function patchTable(oldWeekData, newWeekData) {
    let changed = false;
    const key = weekKey(currentMonday);
    const oldExtraEnabled = oldWeekData.extra?.enabled ?? false;
    const newExtraEnabled = newWeekData.extra?.enabled ?? false;
    const oldExtraName = oldWeekData.extra?.name ?? EXTRA_DEFAULT_NAME;
    const newExtraName = newWeekData.extra?.name ?? EXTRA_DEFAULT_NAME;

    if (oldExtraEnabled !== newExtraEnabled || oldExtraName !== newExtraName) {
        data[key] = clone(newWeekData);
        render();
        return;
    }

    TEAM.forEach(person => {
        for (let i = 0; i < 5; i++) {
            const oldKey = oldWeekData.team?.[person]?.[i] ?? null;
            const newKey = newWeekData.team?.[person]?.[i] ?? null;
            if (oldKey !== newKey) {
                changed = true;
                if (!data[key]) data[key] = createSeedWeekData();
                if (!data[key].team[person]) data[key].team[person] = {};
                if (newKey === null) delete data[key].team[person][i];
                else data[key].team[person][i] = newKey;

                patchButton(person, i, newKey);
            }
        }
    });

    if (newExtraEnabled) {
        for (let i = 0; i < 5; i++) {
            const oldKey = oldWeekData.extra?.days?.[i] ?? null;
            const newKey = newWeekData.extra?.days?.[i] ?? null;
            if (oldKey !== newKey) {
                changed = true;
                if (!data[key]) data[key] = createSeedWeekData();
                if (!data[key].extra) data[key].extra = createEmptyExtraWeekData();
                if (newKey === null) delete data[key].extra.days[i];
                else data[key].extra.days[i] = newKey;

                patchButton(EXTRA_ROW_ID, i, newKey);
            }
        }
    }

    if (changed) renderStats();
}

function patchButton(person, dayIdx, statusKey) {
    const btn = document.querySelector(`button.status-btn[data-person="${person}"][data-day="${dayIdx}"]`);
    if (!btn) return;

    btn.textContent = statusKey ? emojiFor(statusKey) : '·';
    btn.className = 'status-btn' + (statusKey ? ' active' : '');
    btn.title = statusKey
        ? STATUS_OPTIONS.find(option => option.key === statusKey)?.label
        : 'Sin estado';
}

// ---- Picker ----
let activePicker = { person: null, day: null, btn: null };

function openPicker(e, label, dayIdx, btn, person = label) {
    e.stopPropagation();
    const picker = document.getElementById('picker');
    const overlay = document.getElementById('overlay');

    activePicker = { person, day: dayIdx, btn };
    document.getElementById('pickerTitle').textContent = `${label} — ${DAYS[dayIdx]}`;

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
            showToast(`${label}: ${option.label}`);
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

function renderExtraToggle() {
    const button = document.getElementById('btnExtra');
    if (!button) return;
    const enabled = isExtraEnabled(currentMonday);
    button.classList.toggle('active', enabled);
    button.textContent = enabled ? '− Integrante extra' : '+ Integrante extra';
}

// ---- Save Button ----
function updateSaveButton() {
    const button = document.getElementById('btnGuardar');
    button.classList.toggle('hidden', !dirty && !saveInFlight);
    button.disabled = saveInFlight;
    button.textContent = saveInFlight ? SAVING_BUTTON_LABEL : SAVE_BUTTON_LABEL;
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
document.getElementById('btnExtra').addEventListener('click', () => {
    setExtraEnabled(currentMonday, !isExtraEnabled(currentMonday));
    render();
});
document.getElementById('prevWeek').addEventListener('click', () => {
    navigateTo(addDays(currentMonday, -7));
});
document.getElementById('nextWeek').addEventListener('click', () => {
    navigateTo(addDays(currentMonday, 7));
});

// ---- Init ----
fetchData();
startPolling();
