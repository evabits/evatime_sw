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

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("nl-NL").format(d);
}

export function formatHours(hours: number | string | null | undefined): string {
  if (hours === null || hours === undefined) return "0:00";
  const num = typeof hours === "string" ? parseFloat(hours) : hours;
  const h = Math.floor(num);
  const m = Math.round((num - h) * 60);
  return `${h}:${m.toString().padStart(2, "0")}`;
}
