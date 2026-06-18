export const TEAM = ['Majo', 'Duván', 'Dani', 'Vega', 'Salva', 'Manu', 'Javi', 'Tessa'];
export const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
export const STATUS_OPTIONS = [
    { key: 'home', emoji: '🏠', label: 'Home office' },
    { key: 'office', emoji: '🏢', label: 'Oficina' },
    { key: 'mandatory', emoji: '💀', label: 'Oficina obligatoria' },
    { key: 'travel', emoji: '✈️', label: 'Viaje' },
    { key: 'holiday', emoji: '✳️', label: 'Festivo' },
    { key: 'vacation', emoji: '😎', label: 'Vacaciones' },
    { key: 'illness', emoji: '🤒', label: 'Baja' },
    { key: 'training', emoji: '🧑‍💻', label: 'Formación' },
];
export const VALID_STATUSES = new Set(STATUS_OPTIONS.map(option => option.key));

// ponytail: one shared seed template; replace with all-empty week when the bootstrap snapshot stops being useful
export const INITIAL_WEEK_TEMPLATE = {
    Majo: { 0: 'office', 1: 'office', 2: 'mandatory', 3: 'home', 4: 'home' },
    'Duván': { 0: 'office', 1: 'office', 2: 'mandatory', 3: 'home', 4: 'home' },
    Dani: { 0: 'office', 1: 'home', 2: 'mandatory', 3: 'home', 4: 'office' },
    Vega: { 0: 'home', 1: 'office', 2: 'mandatory', 3: 'home', 4: 'home' },
    Salva: { 0: 'home', 1: 'office', 2: 'mandatory', 3: 'home', 4: 'home' },
    Manu: { 0: 'home', 1: 'office', 2: 'mandatory', 3: 'home', 4: 'office' },
    Javi: { 0: 'office', 1: 'home', 2: 'mandatory', 3: 'home', 4: 'office' },
};

export function createSeedWeekData(template = INITIAL_WEEK_TEMPLATE) {
    return TEAM.reduce((acc, person) => {
        acc[person] = template[person] ? { ...template[person] } : {};
        return acc;
    }, {});
}
