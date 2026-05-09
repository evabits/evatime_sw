"use client";
import { useEffect } from "react";
import { formatCurrency } from "@/lib/utils";

function fmt(date: string) {
  return new Date(date).toLocaleDateString("nl-NL");
}

interface Props {
  quote: any;
  settings: any;
  autoPrint?: boolean;
}

export function PrintQuote({ quote, settings, autoPrint = true }: Props) {
  useEffect(() => {
    if (autoPrint) {
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
  }, [autoPrint]);

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #111; background: white; }
        .page { max-width: 794px; margin: 0 auto; padding: 48px 48px 64px; }
        .top-header { display: flex; justify-content: space-between; margin-bottom: 36px; gap: 32px; }
        .address-block { font-size: 12px; line-height: 1.7; }
        .company-block { text-align: right; font-size: 12px; line-height: 1.7; }
        .logo { max-height: 64px; max-width: 180px; object-fit: contain; display: block; margin-left: auto; margin-bottom: 8px; }
        .heading { font-size: 26px; font-weight: 700; margin-bottom: 12px; letter-spacing: 0.02em; }
        .meta-section { display: flex; justify-content: space-between; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid #ddd; gap: 32px; }
        .meta-left table, .meta-right table { border-collapse: collapse; }
        .meta-left td, .meta-right td { padding: 1px 12px 1px 0; font-size: 12px; }
        .meta-label { color: #444; white-space: nowrap; }
        .subject-line { font-size: 12px; margin-bottom: 20px; }
        table.lines { width: 100%; border-collapse: collapse; margin-bottom: 0; }
        table.lines th { text-align: left; padding: 7px 8px; font-size: 11px; font-weight: 700; border-bottom: 1px solid #333; border-top: 1px solid #333; }
        table.lines th.right, table.lines td.right { text-align: right; }
        table.lines td { padding: 7px 8px; font-size: 12px; border-bottom: 1px solid #eee; vertical-align: top; }
        .totals-wrap { display: flex; justify-content: flex-end; margin-top: 8px; }
        .totals { width: 280px; }
        .total-row { display: flex; justify-content: space-between; padding: 5px 8px; font-size: 12px; border-bottom: 1px solid #eee; }
        .total-row.grand { border-bottom: none; border-top: 1px solid #333; padding-top: 7px; font-weight: 700; font-size: 13px; }
        .notes { margin-top: 32px; font-size: 12px; line-height: 1.6; color: #333; }
        .print-btn { position: fixed; bottom: 24px; right: 24px; display: flex; gap: 8px; }
        .btn { padding: 10px 20px; border-radius: 6px; font-size: 14px; font-weight: 500; cursor: pointer; border: none; }
        .btn-primary { background: #397d3a; color: white; }
        .btn-secondary { background: #f3f4f6; color: #374151; }
        @media print {
          .print-btn { display: none !important; }
          .page { padding: 24px; max-width: 100%; }
        }
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
            {!settings?.logoUrl && <div style={{ fontWeight: 700 }}>{settings?.name ?? ""}</div>}
            {settings?.logoUrl && <div style={{ fontWeight: 700 }}>{settings?.name ?? ""}</div>}
            {settings?.address && <div>{settings.address}</div>}
            {settings?.postalCode && <div>{settings.postalCode}{settings?.city ? ` ${settings.city}` : ""}</div>}
            {settings?.email && <><div style={{ height: 8 }} /><div>{settings.email}</div></>}
            {(settings?.kvkNumber || settings?.vatNumber) && <div style={{ height: 8 }} />}
            {settings?.kvkNumber && <div>KvK: {settings.kvkNumber}</div>}
            {settings?.vatNumber && <div>Btw: {settings.vatNumber}</div>}
          </div>
        </div>

        <div className="heading">OFFERTE</div>

        <div className="meta-section">
          <div className="meta-left">
            <table>
              <tbody>
                <tr>
                  <td className="meta-label">Offertenummer:</td>
                  <td>{quote.quoteNumber}</td>
                </tr>
                {quote.reference && (
                  <tr>
                    <td className="meta-label">Kenmerk:</td>
                    <td>{quote.reference}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="meta-right">
            <table>
              <tbody>
                <tr>
                  <td className="meta-label">Datum:</td>
                  <td>{fmt(quote.issueDate)}</td>
                </tr>
                <tr>
                  <td className="meta-label">Geldig tot:</td>
                  <td>{fmt(quote.validUntil)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {quote.subject && <div className="subject-line">{quote.subject}</div>}

        <table className="lines">
          <thead>
            <tr>
              <th style={{ width: "60%" }}>Omschrijving</th>
              <th className="right" style={{ width: "12%" }}>Aantal</th>
              <th className="right" style={{ width: "14%" }}>Prijs</th>
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
            <div className="total-row">
              <span>Subtotaal</span>
              <span>{formatCurrency(Number(quote.subtotal))}</span>
            </div>
            <div className="total-row">
              <span>BTW {Number(quote.vatRate).toFixed(0)}%</span>
              <span>{formatCurrency(Number(quote.vatAmount))}</span>
            </div>
            <div className="total-row grand">
              <span>Totaal</span>
              <span>{formatCurrency(Number(quote.total))}</span>
            </div>
          </div>
        </div>

        {quote.notes && <div className="notes">{quote.notes}</div>}
      </div>

      <div className="print-btn">
        <button className="btn btn-secondary" onClick={() => window.close()}>Sluiten</button>
        <button className="btn btn-primary" onClick={() => window.print()}>Afdrukken</button>
      </div>
    </>
  );
}
