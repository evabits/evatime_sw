import { describe, it, expect } from "vitest";
import { receiptAttachments, receiptFilename } from "./receipt-attachments";

const BLOB = "https://aizq7opp0qqqowlg.private.blob.vercel-storage.com/expenses/cms7i2/invoice-18268810.pdf";

describe("receiptFilename", () => {
  it("takes the last part of the path", () => {
    expect(receiptFilename(BLOB)).toBe("invoice-18268810.pdf");
  });

  it("leaves the query string out of the name", () => {
    expect(receiptFilename(`${BLOB}?download=1`)).toBe("invoice-18268810.pdf");
  });

  it("turns the url encoding back into readable characters", () => {
    expect(receiptFilename("https://x.blob/expenses/e1/bon%20juli.pdf")).toBe("bon juli.pdf");
  });

  it("keeps the raw name when the encoding is broken", () => {
    // Een losse % laat decodeURIComponent struikelen; de kale naam is dan beter
    // dan geen naam.
    expect(receiptFilename("https://x.blob/expenses/e1/100%korting.pdf")).toBe("100%korting.pdf");
  });

  it("falls back when the url has no filename at all", () => {
    expect(receiptFilename("https://x.blob/")).toBe("bon.pdf");
  });
});

describe("receiptAttachments", () => {
  it("makes one attachment per receipt", () => {
    expect(receiptAttachments([{ receiptUrl: BLOB }])).toEqual([
      { filename: "invoice-18268810.pdf", url: BLOB },
    ]);
  });

  it("skips an expense without a receipt", () => {
    expect(receiptAttachments([{ receiptUrl: null }, { receiptUrl: "  " }, {}])).toEqual([]);
  });

  it("attaches the same file only once", () => {
    // Twee uitgaven kunnen naar dezelfde bon wijzen; die twee keer meesturen
    // levert de klant een dubbele bijlage op.
    expect(receiptAttachments([{ receiptUrl: BLOB }, { receiptUrl: BLOB }])).toHaveLength(1);
  });

  it("gives nothing for an empty list", () => {
    expect(receiptAttachments([])).toEqual([]);
  });
});
