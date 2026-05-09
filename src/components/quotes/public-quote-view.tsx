"use client";
import { useState } from "react";
import { formatCurrency } from "@/lib/utils";

function fmt(date: string) {
  return new Date(date).toLocaleDateString("nl-NL");
}

export function PublicQuoteView({ quote, settings }: { quote: any; settings: any }) {
  const [status, setStatus] = useState(quote.status);
  const [approvedAt, setApprovedAt] = useState(quote.approvedAt);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState("");

  async function approve() {
    setApproving(true);
    setError("");
    const res = await fetch(`/api/quotes/${quote.id}/approve?token=${quote.viewToken}`, { method: "POST" });
    setApproving(false);
    if (res.ok) {
      const data = await res.json();
      setStatus(data.status);
      setApprovedAt(data.approvedAt);
    } else {
      setError("Er is een fout opgetreden. Probeer het opnieuw.");
    }
  }

  const isApproved = status === "APPROVED";

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #111; background: #f8f9fa; }
        .page { max-width: 794px; margin: 0 auto; padding: 48px 48px 64px; background: white; min-height: 100vh; }
        .top-header { display: flex; justify-content: space-between; margin-bottom: 36px; gap: 32px; }
        .address-block { font-size: 12px; line-height: 1.7; }
        .company-block { text-align: right; font-size: 12px; line-height: 1.7; }
        .logo { max-height: 64px; max-width: 180px; object-fit: contain; display: block; margin-left: auto; margin-bottom: 8px; }
        .heading { font-size: 26px; font-weight: 700; margin-bottom: 12px; }
        .meta-section { display: flex; justify-content: space-between; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid #ddd; }
        .meta-label { color: #444; margin-right: 8px; }
        table.lines { width: 100%; border-collapse: collapse; margin-bottom: 0; }
        table.lines th { text-align: left; padding: 7px 8px; font-size: 11px; font-weight: 700; border-bottom: 1px solid #333; border-top: 1px solid #333; }
        table.lines th.right, table.lines td.right { text-align: right; }
        table.lines td { padding: 7px 8px; font-size: 12px; border-bottom: 1px solid #eee; }
        .totals-wrap { display: flex; justify-content: flex-end; margin-top: 8px; }
        .totals { width: 280px; }
        .total-row { display: flex; justify-content: space-between; padding: 5px 8px; font-size: 12px; border-bottom: 1px solid #eee; }
        .total-row.grand { border-bottom: none; border-top: 1px solid #333; padding-top: 7px; font-weight: 700; font-size: 13px; }
        .notes { margin-top: 32px; font-size: 12px; line-height: 1.6; color: #333; }
        .approve-section { margin-top: 40px; padding: 24px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; text-align: center; }
        .approved-section { margin-top: 40px; padding: 24px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; text-align: center; }
        .approve-btn { display: inline-block; padding: 14px 32px; background: #397d3a; color: white; border: none; border-radius: 8px; font-size: 16px; font-weight: 700; cursor: pointer; }
        .approve-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .approved-icon { font-size: 48px; margin-bottom: 8px; }
      `}</style>

      <div className="page">
        <div className="top-header">
          <div className="address-block">
            <div>{quote.customer.name}</div>
            {quote.customer.address && <div>{quote.customer.address}</div>}
            {quote.customer.postalCode && <div>{quote.customer.postalCode} {quote.customer.city}</div>}
            {quote.customer.country && <div>{quote.customer.country}</div>}
          </div>
          <div className="company-block">
            {settings?.logoUrl && <img src={settings.logoUrl} alt="Logo" className="logo" />}
            <div style={{ fontWeight: 700 }}>{settings?.name ?? ""}</div>
            {settings?.address && <div>{settings.address}</div>}
            {settings?.postalCode && <div>{settings.postalCode}{settings?.city ? ` ${settings.city}` : ""}</div>}
            {settings?.email && <><div style={{ height: 8 }} /><div>{settings.email}</div></>}
          </div>
        </div>

        <div className="heading">OFFERTE</div>

        <div className="meta-section">
          <div>
            <div><span className="meta-label">Offertenummer:</span>{quote.quoteNumber}</div>
            {quote.reference && <div><span className="meta-label">Kenmerk:</span>{quote.reference}</div>}
          </div>
          <div style={{ textAlign: "right" }}>
            <div><span className="meta-label">Datum:</span>{fmt(quote.issueDate)}</div>
            <div><span className="meta-label">Geldig tot:</span>{fmt(quote.validUntil)}</div>
          </div>
        </div>

        {quote.subject && <div style={{ marginBottom: 20, fontSize: 12 }}>{quote.subject}</div>}

        <table className="lines">
          <thead>
            <tr>
              <th style={{ width: "60%" }}>Omschrijving</th>
              <th className="right" style={{ width: "13%" }}>Aantal</th>
              <th className="right" style={{ width: "13%" }}>Prijs</th>
              <th className="right" style={{ width: "14%" }}>Totaal</th>
            </tr>
          </thead>
          <tbody>
            {quote.lines.map((line: any, i: number) => (
              <tr key={line.id ?? i}>
                <td>{line.description}</td>
                <td className="right">{Number(line.quantity).toFixed(2)}</td>
                <td className="right">{formatCurrency(Number(line.unitPrice))}</td>
                <td className="right">{formatCurrency(Number(line.total))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="totals-wrap">
          <div className="totals">
            <div className="total-row"><span>Subtotaal</span><span>{formatCurrency(Number(quote.subtotal))}</span></div>
            <div className="total-row"><span>BTW {Number(quote.vatRate).toFixed(0)}%</span><span>{formatCurrency(Number(quote.vatAmount))}</span></div>
            <div className="total-row grand"><span>Totaal</span><span>{formatCurrency(Number(quote.total))}</span></div>
          </div>
        </div>

        {quote.notes && <div className="notes">{quote.notes}</div>}

        {isApproved ? (
          <div className="approved-section">
            <div className="approved-icon">✅</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Offerte goedgekeurd</div>
            {approvedAt && (
              <div style={{ fontSize: 13, color: "#555" }}>
                Goedgekeurd op {new Date(approvedAt).toLocaleDateString("nl-NL")}
              </div>
            )}
          </div>
        ) : status === "SENT" ? (
          <div className="approve-section">
            <div style={{ fontSize: 14, marginBottom: 16, color: "#444" }}>
              Gaat u akkoord met deze offerte? Klik dan op de knop hieronder.
            </div>
            {error && <div style={{ color: "#dc2626", marginBottom: 12, fontSize: 13 }}>{error}</div>}
            <button className="approve-btn" onClick={approve} disabled={approving}>
              {approving ? "Bezig..." : "Offerte goedkeuren"}
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}
