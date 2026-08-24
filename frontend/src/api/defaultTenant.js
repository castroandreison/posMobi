const STORAGE_KEY = 'posvenda.defaultTenantPk';

export const getStoredTenantPk = () => {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};

export const setStoredTenantPk = (pk) => {
  try {
    if (pk == null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, String(pk));
  } catch {
    /* ignore */
  }
};

const intelbrasScore = (t) => {
  const name = (t.name || '').toLowerCase();
  const alias = (t.alias || '').toLowerCase();
  if (!name.includes('intelbras') && !alias.includes('intelbras')) return 0;
  if (name === 'intelbras' || alias === 'intelbras') return 3;
  if (name.startsWith('intelbras') || alias.startsWith('intelbras')) return 2;
  if (name.includes('artur') || alias.includes('artur')) return 0;
  return 1;
};

export const resolveDefaultTenant = (list) => {
  if (!list || !list.length) return null;
  const storedPk = getStoredTenantPk();
  if (storedPk != null) {
    const found = list.find((t) => String(t.pk) === String(storedPk));
    if (found) return found;
  }
  return [...list].sort((a, b) => intelbrasScore(b) - intelbrasScore(a))[0];
};
