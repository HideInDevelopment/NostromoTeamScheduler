// ---- Constants ----
const TEAM = ['Majo', 'Duván', 'Dani', 'Vega', 'Salva', 'Manu', 'Javi'];
const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
const STATUS_OPTIONS = [
    { key: 'home',     emoji: '🏠', label: 'Home office' },
    { key: 'office',   emoji: '🏢', label: 'Oficina' },
    { key: 'mandatory',emoji: '💀', label: 'Oficina obligatoria' },
    { key: 'travel',   emoji: '✈️', label: 'Viaje' },
    { key: 'holiday',  emoji: '✳️', label: 'Festivo' },
    { key: 'vacation', emoji: '😎', label: 'Vacaciones' },
    { key: 'illness',  emoji: '🤒', label: 'Baja' },
    { key: 'training', emoji: '🧑‍💻', label: 'Formación' },
    { key: null,       emoji: '✕',  label: 'Limpiar' },
];

// ---- State ----
let currentMonday = getMonday(new Date());
let data = {};
let prevDataStr = '';
let pollingTimer = null;
let saveTimeout = null;

// ---- Helpers ----
function weekKey(monday) {
    return monday.toISOString().slice(0, 10);
}

function getMonday(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = (day === 0) ? -6 : 1 - day;
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
    return STATUS_OPTIONS.find(o => o.key === key)?.emoji ?? '';
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
    saveToApi();
}

// ---- API ----
async function fetchData() {
    showSpinner();
    try {
        const res = await fetch('/api/data');
        if (!res.ok) throw new Error('Network error');
        const newData = await res.json();
        data = newData;
        prevDataStr = JSON.stringify(data);
        render();
    } catch (e) {
        data = {};
        prevDataStr = '{}';
        render();
        showToast('Error al cargar datos');
    } finally {
        hideSpinner();
    }
}

function saveToApi() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
        try {
            const res = await fetch('/api/data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            if (res.ok) prevDataStr = JSON.stringify(data);
        } catch (e) {
            // Silently fail — next save will retry
        }
    }, 200);
}

// ---- Polling ----
function startPolling() {
    stopPolling();
    pollingTimer = setInterval(async () => {
        try {
            const res = await fetch('/api/data');
            if (!res.ok) return;
            const newData = await res.json();
            const newStr = JSON.stringify(newData);
            if (newStr !== prevDataStr) {
                const key = weekKey(currentMonday);
                const oldWeekData = data[key] ?? {};
                const newWeekData = newData[key] ?? {};
                patchTable(oldWeekData, newWeekData);
                data = newData;
                prevDataStr = newStr;
            }
        } catch (e) {
            // Silently fail polling
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
    const wd = getWeekData(monday);

    TEAM.forEach(person => {
        const tr = document.createElement('tr');

        const nameTd = document.createElement('td');
        nameTd.textContent = person;
        tr.appendChild(nameTd);

        for (let i = 0; i < 5; i++) {
            const td = document.createElement('td');
            const key = wd[person]?.[i] ?? null;
            const emoji = emojiFor(key);

            const inner = document.createElement('div');
            inner.className = 'cell-inner';

            const btn = document.createElement('button');
            btn.className = 'status-btn' + (key ? ' active' : '');
            btn.textContent = emoji || '·';
            btn.title = key ? STATUS_OPTIONS.find(o => o.key === key)?.label : 'Sin estado';
            btn.dataset.person = person;
            btn.dataset.day = i;
            btn.addEventListener('click', (e) => openPicker(e, person, i, btn));

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
    let homeCount = 0, officeCount = 0, total = 0;
    TEAM.forEach(p => {
        for (let i = 0; i < 5; i++) {
            const k = wd[p]?.[i];
            if (k) total++;
            if (k === 'home') homeCount++;
            if (k === 'office' || k === 'mandatory') officeCount++;
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

    TEAM.forEach(person => {
        for (let i = 0; i < 5; i++) {
            const oldKey = oldWeekData[person]?.[i] ?? null;
            const newKey = newWeekData[person]?.[i] ?? null;
            if (oldKey !== newKey) {
                changed = true;
                const btn = document.querySelector(
                    `button.status-btn[data-person="${person}"][data-day="${i}"]`
                );
                if (btn) {
                    btn.textContent = newKey ? emojiFor(newKey) : '·';
                    btn.className = 'status-btn' + (newKey ? ' active' : '');
                    btn.title = newKey
                        ? STATUS_OPTIONS.find(o => o.key === newKey)?.label
                        : 'Sin estado';
                }
            }
        }
    });

    if (changed) {
        renderStats();
    }
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

    STATUS_OPTIONS.forEach(opt => {
        const btn2 = document.createElement('button');
        btn2.className = 'picker-option';
        btn2.innerHTML = `<span class="opt-emoji">${opt.emoji}</span> ${opt.label}`;
        btn2.addEventListener('click', () => {
            setStatus(currentMonday, person, dayIdx, opt.key);
            closePicker();
            render();
            showToast(`${person}: ${opt.label}`);
        });
        picker.appendChild(btn2);
    });

    const rect = btn.getBoundingClientRect();
    const pw = 220;
    let left = rect.left + window.scrollX;
    let top = rect.bottom + window.scrollY + 6;
    if (left + pw > window.innerWidth - 10) left = window.innerWidth - pw - 10;

    picker.style.left = left + 'px';
    picker.style.top = top + 'px';
    picker.classList.add('visible');
    overlay.classList.add('visible');
}

function closePicker() {
    document.getElementById('picker').classList.remove('visible');
    document.getElementById('overlay').classList.remove('visible');
    activePicker = { person: null, day: null, btn: null };
}

// ---- Toast ----
let toastTimer;
function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2000);
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

document.getElementById('prevWeek').addEventListener('click', () => {
    currentMonday = addDays(currentMonday, -7);
    render();
});

document.getElementById('nextWeek').addEventListener('click', () => {
    currentMonday = addDays(currentMonday, 7);
    render();
});

// ---- Init ----
fetchData();
startPolling();
