"use client";
import { useEffect } from "react";
import { formatCurrency } from "@/lib/utils";

function fmt(date: string) {
  return new Date(date).toLocaleDateString("nl-NL");
}

interface Props {
  invoice: any;
  settings: any;
  autoPrint?: boolean;
}

export function PrintInvoice({ invoice, settings, autoPrint = true }: Props) {
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

        /* Top header: customer left, company right */
        .top-header { display: flex; justify-content: space-between; margin-bottom: 36px; gap: 32px; }
        .address-block { font-size: 12px; line-height: 1.7; }
        .address-block .attn { color: #444; }
        .company-block { text-align: right; font-size: 12px; line-height: 1.7; }
        .logo { max-height: 64px; max-width: 180px; object-fit: contain; display: block; margin-left: auto; margin-bottom: 8px; }
        .company-name-text { font-weight: 700; font-size: 13px; }
        .company-spacer { height: 10px; }

        /* FACTUUR heading */
        .factuur-heading { font-size: 26px; font-weight: 700; margin-bottom: 12px; letter-spacing: 0.02em; }

        /* Meta row: two columns */
        .meta-section { display: flex; justify-content: space-between; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid #ddd; gap: 32px; }
        .meta-left table, .meta-right table { border-collapse: collapse; }
        .meta-left td, .meta-right td { padding: 1px 12px 1px 0; font-size: 12px; vertical-align: top; }
        .meta-label { color: #444; white-space: nowrap; }
        .meta-value { font-weight: normal; }

        /* Subject line */
        .subject-line { font-size: 12px; margin-bottom: 20px; }

        /* Lines table */
        table.lines { width: 100%; border-collapse: collapse; margin-bottom: 0; }
        table.lines th { text-align: left; padding: 7px 8px; font-size: 11px; font-weight: 700; border-bottom: 1px solid #333; border-top: 1px solid #333; background: #fff; }
        table.lines th.right, table.lines td.right { text-align: right; }
        table.lines td { padding: 7px 8px; font-size: 12px; border-bottom: 1px solid #eee; vertical-align: top; }
        .section-header td { font-weight: 700; padding-top: 12px; padding-bottom: 2px; border-bottom: none; font-size: 12px; }

        /* Totals */
        .totals-wrap { display: flex; justify-content: flex-end; margin-top: 8px; }
        .totals { width: 300px; }
        .total-row { display: flex; justify-content: space-between; padding: 5px 8px; font-size: 12px; border-bottom: 1px solid #eee; }
        .total-row.grand { border-bottom: none; border-top: 1px solid #333; padding-top: 7px; font-weight: 700; font-size: 13px; }

        /* Notes */
        .notes { margin-top: 32px; font-size: 12px; line-height: 1.6; color: #333; }

        /* Print controls */
        .print-btn { position: fixed; bottom: 24px; right: 24px; display: flex; gap: 8px; }
        .btn { padding: 10px 20px; border-radius: 6px; font-size: 14px; font-weight: 500; cursor: pointer; border: none; }
        .btn-primary { background: #397d3a; color: white; }
        .btn-secondary { background: #f3f4f6; color: #374151; }
        @media print {
          .print-btn { display: none !important; }
          body { background: white; }
          .page { padding: 24px; max-width: 100%; }
        }
      `}</style>

      <div className="page">
        {/* Top: customer left, company right */}
        <div className="top-header">
          <div className="address-block">
            <div>{invoice.customer.name}</div>
            {invoice.customer.address && <div className="attn">T.a.v. {invoice.customer.address}</div>}
            {invoice.customer.postalCode && <div>{invoice.customer.postalCode} {invoice.customer.city}</div>}
            {invoice.customer.country && <div>{invoice.customer.country}</div>}
          </div>
          <div className="company-block">
            {settings?.logoUrl && <img src={settings.logoUrl} alt="Logo" className="logo" />}
            {!settings?.logoUrl && <div className="company-name-text">{settings?.name ?? ""}</div>}
            {settings?.logoUrl && <div className="company-name-text">{settings?.name ?? ""}</div>}
            {settings?.address && <div>{settings.address}</div>}
            {settings?.postalCode && <div>{settings.postalCode}{settings?.city ? ` ${settings.city}` : ""}</div>}
            {settings?.country && <div>{settings.country}</div>}
            {settings?.email && <><div className="company-spacer" /><div>{settings.email}</div></>}
            {(settings?.kvkNumber || settings?.vatNumber || settings?.iban) && <div className="company-spacer" />}
            {settings?.kvkNumber && <div>KvK: {settings.kvkNumber}</div>}
            {settings?.vatNumber && <div>Btw: {settings.vatNumber}</div>}
            {settings?.iban && <div>IBAN: {settings.iban}</div>}
          </div>
        </div>

        {/* FACTUUR */}
        <div className="factuur-heading">FACTUUR</div>

        {/* Meta */}
        <div className="meta-section">
          <div className="meta-left">
            <table>
              <tbody>
                <tr>
                  <td className="meta-label">Factuurnummer:</td>
                  <td className="meta-value">{invoice.invoiceNumber}</td>
                </tr>
                {invoice.reference && (
                  <tr>
                    <td className="meta-label">Kenmerk:</td>
                    <td className="meta-value">{invoice.reference}</td>
                  </tr>
                )}
                <tr>
                  <td className="meta-label">Klantnummer:</td>
                  <td className="meta-value">{invoice.customerId.slice(-6)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="meta-right">
            <table>
              <tbody>
                <tr>
                  <td className="meta-label">Factuurdatum:</td>
                  <td className="meta-value">{fmt(invoice.issueDate)}</td>
                </tr>
                <tr>
                  <td className="meta-label">Vervaldatum:</td>
                  <td className="meta-value">{fmt(invoice.dueDate)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Subject */}
        {invoice.subject && <div className="subject-line">{invoice.subject}</div>}

        {/* Lines */}
        <table className="lines">
          <thead>
            <tr>
              <th style={{ width: "52%" }}>Omschrijving</th>
              <th className="right" style={{ width: "10%" }}>Aantal</th>
              <th className="right" style={{ width: "13%" }}>Prijs</th>
              <th className="right" style={{ width: "13%" }}>Totaal</th>
              <th className="right" style={{ width: "12%" }}>Btw</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((line: any, i: number) => (
              <tr key={line.id ?? i}>
                <td>{line.description}</td>
                <td className="right">{Number(line.quantity).toFixed(2)}</td>
                <td className="right">{formatCurrency(Number(line.unitPrice))}</td>
                <td className="right">{formatCurrency(Number(line.total))}</td>
                <td className="right">{Number(invoice.vatRate).toFixed(0)}%</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="totals-wrap">
          <div className="totals">
            <div className="total-row">
              <span>Subtotaal</span>
              <span>{formatCurrency(Number(invoice.subtotal))}</span>
            </div>
            <div className="total-row">
              <span>BTW {Number(invoice.vatRate).toFixed(0)}%</span>
              <span>{formatCurrency(Number(invoice.vatAmount))}</span>
            </div>
            <div className="total-row grand">
              <span>Totaal</span>
              <span>{formatCurrency(Number(invoice.total))}</span>
            </div>
          </div>
        </div>

        {/* Notes */}
        {invoice.notes && (
          <div className="notes">{invoice.notes}</div>
        )}
      </div>

      {/* Print controls */}
      <div className="print-btn">
        <button className="btn btn-secondary" onClick={() => window.close()}>Sluiten</button>
        <button className="btn btn-primary" onClick={() => window.print()}>Afdrukken / PDF</button>
      </div>
    </>
  );
}
