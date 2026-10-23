export const clinicBagKey = 'rad-clinic-bag';
const changedEvent = 'rad-clinic-bag-changed';
let memoryBag: unknown = [];

export function readClinicBag(): unknown {
  try { return JSON.parse(window.localStorage.getItem(clinicBagKey) || '[]'); }
  catch { return memoryBag; }
}

export function writeClinicBag(items: {price: string; quantity: number}[]) {
  memoryBag = items;
  try { window.localStorage.setItem(clinicBagKey, JSON.stringify(items)); } catch {}
  window.dispatchEvent(new Event(changedEvent));
}

export function getClinicBagCount(): number {
  const bag = readClinicBag();
  if (!Array.isArray(bag)) return 0;
  const seen = new Set<string>();
  return bag.slice(0, 20).reduce((count, item) => {
    if (!item || typeof item.price !== 'string' || !item.price || seen.has(item.price) ||
      !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 10) return count;
    seen.add(item.price);
    return count + item.quantity;
  }, 0);
}

export function subscribeClinicBag(listener: () => void) {
  const storage = (event: StorageEvent) => {
    if (event.key === clinicBagKey || event.key === null) listener();
  };
  window.addEventListener(changedEvent, listener);
  window.addEventListener('storage', storage);
  return () => {
    window.removeEventListener(changedEvent, listener);
    window.removeEventListener('storage', storage);
  };
}
