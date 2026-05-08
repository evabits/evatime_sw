"use client";
import { useEffect } from "react";
import { formatCurrency } from "@/lib/utils";

const statusLabel: Record<string, string> = {
  DRAFT: "Concept",
  SENT: "Verzonden",
  PAID: "Betaald",
  CANCELLED: "Geannuleerd",
};

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
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 13px; color: #111; background: white; }
        .page { max-width: 800px; margin: 0 auto; padding: 48px 48px 64px; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; gap: 24px; }
        .logo { max-height: 80px; max-width: 200px; object-fit: contain; }
        .company { font-size: 13px; line-height: 1.6; }
        .company-name { font-size: 16px; font-weight: 700; margin-bottom: 4px; }
        .invoice-title { font-size: 28px; font-weight: 700; color: #111; }
        .invoice-meta { margin-top: 4px; font-size: 13px; color: #555; }
        .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-bottom: 32px; padding: 24px; background: #f8f9fa; border-radius: 8px; }
        .party-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #888; margin-bottom: 6px; font-weight: 600; }
        .party-name { font-weight: 700; font-size: 14px; margin-bottom: 2px; }
        .party-detail { color: #444; line-height: 1.5; }
        .meta-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 32px; padding: 16px 0; border-top: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; }
        .meta-item label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #888; font-weight: 600; display: block; margin-bottom: 3px; }
        .meta-item span { font-size: 14px; font-weight: 600; }
        .status-badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; background: #f3f4f6; color: #374151; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 0; }
        th { text-align: left; padding: 10px 12px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #888; font-weight: 600; border-bottom: 2px solid #e5e7eb; }
        th:last-child, td:last-child { text-align: right; }
        td { padding: 12px 12px; border-bottom: 1px solid #f3f4f6; font-size: 13px; vertical-align: top; }
        .totals { margin-left: auto; width: 280px; }
        .total-row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 13px; border-bottom: 1px solid #f3f4f6; }
        .total-row.grand { border-bottom: none; border-top: 2px solid #111; padding-top: 12px; font-size: 16px; font-weight: 700; }
        .notes { margin-top: 40px; padding: 16px; border: 1px solid #e5e7eb; border-radius: 6px; }
        .notes-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #888; font-weight: 600; margin-bottom: 6px; }
        .notes-text { font-size: 13px; color: #444; white-space: pre-wrap; line-height: 1.6; }
        .print-btn { position: fixed; bottom: 24px; right: 24px; display: flex; gap: 8px; }
        .btn { padding: 10px 20px; border-radius: 6px; font-size: 14px; font-weight: 500; cursor: pointer; border: none; }
        .btn-primary { background: #2563eb; color: white; }
        .btn-secondary { background: #f3f4f6; color: #374151; }
        @media print {
          .print-btn { display: none !important; }
          body { background: white; }
          .page { padding: 24px; max-width: 100%; }
        }
      `}</style>

      <div className="page">
        {/* Header */}
        <div className="header">
          <div>
            {settings?.logoUrl ? (
              <img src={settings.logoUrl} alt="Logo" className="logo" />
            ) : (
              <div className="company">
                <div className="company-name">{settings?.name ?? ""}</div>
                {settings?.address && <div className="party-detail">{settings.address}</div>}
                {settings?.city && <div className="party-detail">{settings.postalCode} {settings.city}</div>}
                {settings?.phone && <div className="party-detail">{settings.phone}</div>}
                {settings?.email && <div className="party-detail">{settings.email}</div>}
                {settings?.vatNumber && <div className="party-detail">BTW: {settings.vatNumber}</div>}
              </div>
            )}
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="invoice-title">FACTUUR</div>
            <div className="invoice-meta">{invoice.invoiceNumber}</div>
          </div>
        </div>

        {/* If logo, show company details separately */}
        {settings?.logoUrl && (
          <div style={{ marginBottom: 24, fontSize: 13, lineHeight: 1.6, color: "#444" }}>
            <div style={{ fontWeight: 700, marginBottom: 2 }}>{settings.name}</div>
            {settings?.address && <div>{settings.address}</div>}
            {settings?.city && <div>{settings.postalCode} {settings.city}</div>}
            {settings?.phone && <div>{settings.phone}</div>}
            {settings?.email && <div>{settings.email}</div>}
            {settings?.vatNumber && <div>BTW: {settings.vatNumber}</div>}
          </div>
        )}

        {/* Parties */}
        <div className="parties">
          <div>
            <div className="party-label">Factuuradres</div>
            <div className="party-name">{invoice.customer.name}</div>
            <div className="party-detail">
              {invoice.customer.address && <div>{invoice.customer.address}</div>}
              {invoice.customer.city && <div>{invoice.customer.postalCode} {invoice.customer.city}</div>}
              {invoice.customer.country && <div>{invoice.customer.country}</div>}
              {invoice.customer.vatNumber && <div>BTW: {invoice.customer.vatNumber}</div>}
            </div>
          </div>
          <div>
            <div className="party-label">Betaalgegevens</div>
            {settings?.iban && <div className="party-detail"><strong>IBAN:</strong> {settings.iban}</div>}
            {settings?.vatNumber && <div className="party-detail"><strong>BTW:</strong> {settings.vatNumber}</div>}
          </div>
        </div>

        {/* Meta */}
        <div className="meta-row">
          <div className="meta-item">
            <label>Factuurnummer</label>
            <span>{invoice.invoiceNumber}</span>
          </div>
          <div className="meta-item">
            <label>Factuurdatum</label>
            <span>{fmt(invoice.issueDate)}</span>
          </div>
          <div className="meta-item">
            <label>Vervaldatum</label>
            <span>{fmt(invoice.dueDate)}</span>
          </div>
        </div>

        {/* Lines */}
        <table>
          <thead>
            <tr>
              <th style={{ width: "50%" }}>Omschrijving</th>
              <th style={{ textAlign: "right" }}>Aantal</th>
              <th style={{ textAlign: "right" }}>Prijs</th>
              <th style={{ textAlign: "right" }}>Totaal</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((line: any) => (
              <tr key={line.id}>
                <td>{line.description}</td>
                <td style={{ textAlign: "right" }}>{Number(line.quantity).toFixed(2)}</td>
                <td style={{ textAlign: "right" }}>{formatCurrency(Number(line.unitPrice))}</td>
                <td style={{ textAlign: "right" }}>{formatCurrency(Number(line.total))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
          <div className="totals">
            <div className="total-row">
              <span>Subtotaal</span>
              <span>{formatCurrency(Number(invoice.subtotal))}</span>
            </div>
            <div className="total-row">
              <span>BTW ({Number(invoice.vatRate).toFixed(0)}%)</span>
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
          <div className="notes">
            <div className="notes-label">Opmerkingen</div>
            <div className="notes-text">{invoice.notes}</div>
          </div>
        )}
      </div>

      {/* Print button (hidden when printing) */}
      <div className="print-btn">
        <button className="btn btn-secondary" onClick={() => window.close()}>Sluiten</button>
        <button className="btn btn-primary" onClick={() => window.print()}>Afdrukken / PDF</button>
      </div>
    </>
  );
}
