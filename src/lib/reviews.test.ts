import { describe, it, expect } from "vitest";
import { currentQuarter, questionKeys, sanitizeAnswers, REVIEW_TEMPLATE_SEED } from "./reviews";

const def = {
  sections: [
    { title: "S", questions: [
      { key: "a", label: "A", respondent: "SELF" as const },
      { key: "b", label: "B", respondent: "MANAGER" as const },
    ] },
  ],
};

describe("currentQuarter", () => {
  it("maps months to quarters", () => {
    expect(currentQuarter(new Date(Date.UTC(2026, 0, 15)))).toBe("2026-Q1");
    expect(currentQuarter(new Date(Date.UTC(2026, 3, 15)))).toBe("2026-Q2");
    expect(currentQuarter(new Date(Date.UTC(2026, 11, 31)))).toBe("2026-Q4");
  });
});

describe("questionKeys", () => {
  it("filters by respondent", () => {
    expect(questionKeys(def, "SELF")).toEqual(["a"]);
    expect(questionKeys(def, "MANAGER")).toEqual(["b"]);
  });
});

describe("sanitizeAnswers", () => {
  it("keeps only allowed string keys for the respondent", () => {
    expect(sanitizeAnswers(def, "SELF", { a: "x", b: "y", z: "q" })).toEqual({ a: "x" });
  });
  it("drops non-string values", () => {
    expect(sanitizeAnswers(def, "SELF", { a: 5 as any })).toEqual({});
  });
});

describe("REVIEW_TEMPLATE_SEED", () => {
  it("has self and manager questions with unique keys", () => {
    const keys = REVIEW_TEMPLATE_SEED.sections.flatMap((s) => s.questions.map((q) => q.key));
    expect(new Set(keys).size).toBe(keys.length);
    expect(questionKeys(REVIEW_TEMPLATE_SEED, "SELF").length).toBeGreaterThan(0);
    expect(questionKeys(REVIEW_TEMPLATE_SEED, "MANAGER").length).toBeGreaterThan(0);
  });
});
