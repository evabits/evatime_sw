import { describe, it, expect } from "vitest";
import { isQuarter, hoursBetween } from "./quarter-hours";

describe("isQuarter", () => {
  it("accepts whole hours", () => {
    expect(isQuarter(8)).toBe(true);
  });

  it("accepts every quarter within an hour", () => {
    expect(isQuarter(0.25)).toBe(true);
    expect(isQuarter(0.5)).toBe(true);
    expect(isQuarter(0.75)).toBe(true);
  });

  it("accepts a large value that is still a quarter", () => {
    expect(isQuarter(416.25)).toBe(true);
  });

  it("rejects a tenth of an hour", () => {
    expect(isQuarter(1.3)).toBe(false);
  });

  it("rejects the values an even split used to produce", () => {
    // 10 uur over 3 dagen leverde vroeger 3.33 en 3.34 op.
    expect(isQuarter(3.33)).toBe(false);
    expect(isQuarter(3.34)).toBe(false);
  });

  it("accepts zero, so a pattern day of nought is not a validation error", () => {
    expect(isQuarter(0)).toBe(true);
  });

  it("rejects values that are not finite", () => {
    expect(isQuarter(NaN)).toBe(false);
    expect(isQuarter(Infinity)).toBe(false);
  });

  it("does not trip over floating-point noise", () => {
    // 0.1 + 0.2 is 0.30000000000000004 en hoort gewoon geweigerd te worden,
    // maar een som van kwartieren die net naast de waarde landt niet.
    expect(isQuarter(0.1 + 0.2)).toBe(false);
    expect(isQuarter(2.75 + 2.75 + 2.5)).toBe(true);
  });
});

describe("hoursBetween", () => {
  it("counts a quarter of an hour", () => {
    expect(hoursBetween("09:00", "09:15")).toBe(0.25);
  });

  it("counts a morning", () => {
    expect(hoursBetween("09:00", "12:15")).toBe(3.25);
  });

  it("counts a whole working day", () => {
    expect(hoursBetween("09:00", "17:00")).toBe(8);
  });

  it("refuses an end time before the start", () => {
    expect(hoursBetween("17:00", "09:00")).toBe(null);
  });

  it("refuses an end time equal to the start", () => {
    expect(hoursBetween("09:00", "09:00")).toBe(null);
  });

  it("refuses a missing or malformed time", () => {
    expect(hoursBetween("", "17:00")).toBe(null);
    expect(hoursBetween("09:00", "")).toBe(null);
    expect(hoursBetween("9:00", "17:00")).toBe(null);
    expect(hoursBetween("25:00", "26:00")).toBe(null);
    expect(hoursBetween("09:60", "10:00")).toBe(null);
  });

  it("rounds to two decimals so the value fits the hours column", () => {
    // Tien over negen tot twaalf uur is 170 minuten: 2.8333... uur. Dat is geen
    // kwartier en wordt verderop geweigerd, maar het veld moet er niet
    // 2.8333333333333335 in zetten.
    expect(hoursBetween("09:10", "12:00")).toBe(2.83);
  });
});

describe("hoursBetween met pauze", () => {
  it("trekt de pauze van het tijdvak af", () => {
    // Het geval waarvoor dit gebouwd is: negen tot vijf met een half uur pauze.
    expect(hoursBetween("09:00", "17:00", 30)).toBe(7.5);
  });

  it("rekent zonder pauze hetzelfde als voorheen", () => {
    expect(hoursBetween("09:00", "17:00", 0)).toBe(8);
    expect(hoursBetween("09:00", "17:00")).toBe(hoursBetween("09:00", "17:00", 0));
  });

  it("weigert een pauze die het tijdvak precies opeet", () => {
    // Nul uur boeken heeft geen betekenis, dus dit is een typefout en geen
    // lege dag.
    expect(hoursBetween("09:00", "09:30", 30)).toBe(null);
  });

  it("weigert een pauze die langer is dan het tijdvak", () => {
    expect(hoursBetween("09:00", "09:30", 60)).toBe(null);
  });

  it("weigert een negatieve pauze, want die zou uren bijtellen", () => {
    expect(hoursBetween("09:00", "17:00", -30)).toBe(null);
  });

  it("weigert een pauze die geen getal is", () => {
    // Een leeg of onleesbaar invoerveld levert NaN op via Number().
    expect(hoursBetween("09:00", "17:00", NaN)).toBe(null);
    expect(hoursBetween("09:00", "17:00", Infinity)).toBe(null);
  });

  it("laat een pauze die geen kwartier is gewoon doorrekenen", () => {
    // Deze functie oordeelt niet over de stap, net zomin als over het tijdvak.
    // De aanroeper weigert dit met isQuarter en zet de melding bij het
    // pauze-veld, waar de fout zit.
    const uren = hoursBetween("09:00", "17:00", 20);
    expect(uren).toBe(7.67);
    expect(isQuarter(uren!)).toBe(false);
  });
});
