"use client";
import { useEffect } from "react";
import { formatCurrency, formatDate as fmt } from "@/lib/utils";
import { customerAddressLines } from "@/lib/customer-address";
import { docCopy } from "@/lib/document-copy";

interface Props {
  quote: any;
  settings: any;
  autoPrint?: boolean;
}

export function PrintQuote({ quote, settings, autoPrint = true }: Props) {
  const taal = quote.language ?? "NL";
  const t = docCopy(taal);

  useEffect(() => {
    if (autoPrint) {
      const timer = setTimeout(() => window.print(), 400);
      return () => clearTimeout(timer);
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
        .logo-row { display: flex; justify-content: flex-end; margin-bottom: 10px; }
        .logo { max-height: 64px; max-width: 180px; object-fit: contain; display: block; }
        .address-block .customer-name { font-weight: 700; }
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
        {settings?.logoUrl && (
          <div className="logo-row">
            <img src={settings.logoUrl} alt="Logo" className="logo" />
          </div>
        )}
        <div className="top-header">
          <div className="address-block">
            {customerAddressLines(quote.customer, quote.attention, taal).map((regel, i) => (
              <div key={i} className={i === 0 ? "customer-name" : undefined}>{regel}</div>
            ))}
          </div>
          <div className="company-block">
            <div style={{ fontWeight: 700 }}>{settings?.name ?? ""}</div>
            {settings?.address && <div>{settings.address}</div>}
            {settings?.postalCode && <div>{settings.postalCode}{settings?.city ? ` ${settings.city}` : ""}</div>}
            {settings?.email && <><div style={{ height: 8 }} /><div>{settings.email}</div></>}
            {(settings?.kvkNumber || settings?.vatNumber) && <div style={{ height: 8 }} />}
            {settings?.kvkNumber && <div>KvK: {settings.kvkNumber}</div>}
            {settings?.vatNumber && <div>{t.labelBtwNummer}: {settings.vatNumber}</div>}
          </div>
        </div>

        <div className="heading">{t.offerte}</div>

        <div className="meta-section">
          <div className="meta-left">
            <table>
              <tbody>
                <tr>
                  <td className="meta-label">{t.offertenummer}:</td>
                  <td>{quote.quoteNumber}</td>
                </tr>
                {quote.reference && (
                  <tr>
                    <td className="meta-label">{t.kenmerk}:</td>
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
                  <td className="meta-label">{t.datum}:</td>
                  <td>{fmt(quote.issueDate, taal)}</td>
                </tr>
                <tr>
                  <td className="meta-label">{t.geldigTot}:</td>
                  <td>{fmt(quote.validUntil, taal)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {quote.subject && <div className="subject-line">{quote.subject}</div>}

        <table className="lines">
          <thead>
            <tr>
              <th style={{ width: "60%" }}>{t.omschrijving}</th>
              <th className="right" style={{ width: "12%" }}>{t.aantal}</th>
              <th className="right" style={{ width: "14%" }}>{t.prijs}</th>
              <th className="right" style={{ width: "14%" }}>{t.totaal}</th>
            </tr>
          </thead>
          <tbody>
            {quote.lines.map((line: any, i: number) => (
              <tr key={line.id ?? i}>
                <td>{line.description}</td>
                <td className="right">{Number(line.quantity).toFixed(2)}</td>
                <td className="right">{formatCurrency(Number(line.unitPrice), taal)}</td>
                <td className="right">{formatCurrency(Number(line.total), taal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="totals-wrap">
          <div className="totals">
            <div className="total-row">
              <span>{t.subtotaal}</span>
              <span>{formatCurrency(Number(quote.subtotal), taal)}</span>
            </div>
            <div className="total-row">
              <span>{t.btwMet(Number(quote.vatRate).toFixed(0))}</span>
              <span>{formatCurrency(Number(quote.vatAmount), taal)}</span>
            </div>
            <div className="total-row grand">
              <span>{t.totaal}</span>
              <span>{formatCurrency(Number(quote.total), taal)}</span>
            </div>
          </div>
        </div>

        {quote.notes && <div className="notes">{quote.notes}</div>}
      </div>

      <div className="print-btn">
        <button className="btn btn-secondary" onClick={() => window.close()}>{t.sluiten}</button>
        <button className="btn btn-primary" onClick={() => window.print()}>{t.afdrukken}</button>
      </div>
    </>
  );
}
