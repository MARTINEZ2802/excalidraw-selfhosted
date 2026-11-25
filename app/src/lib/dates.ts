// Fechas como días enteros (UTC) para evitar problemas de zona horaria.
const DAY = 86_400_000;

export const toDay = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY);
};
export const fromDay = (n: number) => new Date(n * DAY).toISOString().slice(0, 10);
export const todayDay = () => {
  const n = new Date();
  return Math.round(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()) / DAY);
};
export const todayIso = () => fromDay(todayDay());
export const dayDate = (n: number) => new Date(n * DAY); // usar getUTC*

export const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
