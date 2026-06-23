export const TEAM = ['Majo', 'Duván', 'Dani', 'Vega', 'Salva', 'Manu', 'Javi', 'Tessa'];
export const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
export const EXTRA_DEFAULT_NAME = 'Integrante extra';
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

export function createEmptyTeamWeekData() {
    return TEAM.reduce((acc, person) => {
        acc[person] = {};
        return acc;
    }, {});
}

export function createEmptyExtraWeekData() {
    return {
        enabled: false,
        dismissed: false,
        name: EXTRA_DEFAULT_NAME,
        days: {},
    };
}

export function createSeedWeekData() {
    return {
        team: createEmptyTeamWeekData(),
        extra: createEmptyExtraWeekData(),
    };
}
