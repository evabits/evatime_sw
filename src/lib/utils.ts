import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data));
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined) return "€0,00";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(num);
}

// Geëxporteerd zodat de tijdas van de planningstijdlijn dezelfde maandnamen
// toont als formatDate, in plaats van een eigen lijst te dupliceren.
export const MAANDEN = ["JAN", "FEB", "MRT", "APR", "MEI", "JUN", "JUL", "AUG", "SEP", "OKT", "NOV", "DEC"];

/**
 * De enige datumweergave in deze app: `01-JAN-2026`.
 *
 * Een afgekorte maandnaam kan niet met een dag verward worden, en daar was het
 * om begonnen — 07-01 leest de een als 7 januari en de ander als 1 juli.
 *
 * Er wordt in de lokale tijdzone gelezen, net als voorheen. Een datum uit de
 * database staat op middernacht UTC en komt in Amsterdam op dezelfde dag uit;
 * een tijdstip als "verzonden op" hoort juist in lokale tijd te staan.
 */
export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
  return `${String(d.getDate()).padStart(2, "0")}-${MAANDEN[d.getMonth()]}-${d.getFullYear()}`;
}

/**
 * De weekdag bij een datum: `maandag`, of `ma` wanneer hij kort moet. Staat los
 * van `formatDate`, want de weekdag hoort er lang niet overal bij.
 */
export function formatWeekday(date: Date | string | null | undefined, kort = false): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("nl-NL", { weekday: kort ? "short" : "long" });
}

/** Dezelfde datum met de klok erbij: `01-JAN-2026 14:30`. */
export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
  const tijd = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${formatDate(d)} ${tijd}`;
}

/**
 * Uren als decimaal getal in Nederlandse notatie: `1,5` in plaats van `1:30`.
 *
 * Voor de loonverwerking, waar de getallen overgetypt worden in een
 * salarissysteem dat met decimalen rekent — daar is `1:30` een uitnodiging tot
 * een rekenfout. De urenschermen houden `formatHours`: bij het invullen van je
 * dag denk je in uren en minuten.
 *
 * Nullen achter de komma vallen weg, dus `8` blijft `8` en `177,14` blijft
 * `177,14`.
 */
export function formatHoursDecimal(hours: number | string | null | undefined): string {
  if (hours === null || hours === undefined) return "0";
  const num = typeof hours === "string" ? parseFloat(hours) : hours;
  if (Number.isNaN(num)) return "0";
  return num.toLocaleString("nl-NL", { maximumFractionDigits: 2 });
}

export function formatHours(hours: number | string | null | undefined): string {
  if (hours === null || hours === undefined) return "0:00";
  const num = typeof hours === "string" ? parseFloat(hours) : hours;
  const h = Math.floor(num);
  const m = Math.round((num - h) * 60);
  return `${h}:${m.toString().padStart(2, "0")}`;
}
