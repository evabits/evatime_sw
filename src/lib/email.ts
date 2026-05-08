import { MailtrapClient } from "mailtrap";
import { formatCurrency } from "@/lib/utils";

const client = new MailtrapClient({ token: process.env.MAILTRAP_API_TOKEN! });

function fmt(date: string) {
  return new Date(date).toLocaleDateString("nl-NL");
}

function invoiceHtml(invoice: any, settings: any, appUrl: string): string {
  const linesHtml = invoice.lines
    .map(
      (l: any) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;">${l.description}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;text-align:right;">${Number(l.quantity).toFixed(2)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;text-align:right;">${formatCurrency(Number(l.unitPrice))}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;text-align:right;">${formatCurrency(Number(l.total))}</td>
    </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;color:#111;background:#fff;margin:0;padding:0;">
<div style="max-width:640px;margin:0 auto;padding:40px 24px;">
  <p style="font-size:20px;font-weight:700;margin:0 0 4px;">${settings?.name ?? ""}</p>
  <p style="color:#666;margin:0 0 32px;">${settings?.email ?? ""}</p>

  <p style="margin:0 0 8px;">Geachte ${invoice.customer.name},</p>
  <p style="margin:0 0 24px;">Hierbij ontvangt u factuur <strong>${invoice.invoiceNumber}</strong>${invoice.subject ? ` — ${invoice.subject}` : ""}.</p>

  <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
    <thead>
      <tr style="background:#f8f9fa;">
        <th style="padding:8px 12px;text-align:left;font-size:12px;text-transform:uppercase;color:#888;">Omschrijving</th>
        <th style="padding:8px 12px;text-align:right;font-size:12px;text-transform:uppercase;color:#888;">Aantal</th>
        <th style="padding:8px 12px;text-align:right;font-size:12px;text-transform:uppercase;color:#888;">Prijs</th>
        <th style="padding:8px 12px;text-align:right;font-size:12px;text-transform:uppercase;color:#888;">Totaal</th>
      </tr>
    </thead>
    <tbody>${linesHtml}</tbody>
  </table>

  <table style="margin-left:auto;width:240px;">
    <tr><td style="padding:4px 0;">Subtotaal</td><td style="padding:4px 0;text-align:right;">${formatCurrency(Number(invoice.subtotal))}</td></tr>
    <tr><td style="padding:4px 0;">BTW (${Number(invoice.vatRate).toFixed(0)}%)</td><td style="padding:4px 0;text-align:right;">${formatCurrency(Number(invoice.vatAmount))}</td></tr>
    <tr style="font-weight:700;font-size:16px;border-top:2px solid #111;">
      <td style="padding:8px 0 4px;">Totaal</td>
      <td style="padding:8px 0 4px;text-align:right;">${formatCurrency(Number(invoice.total))}</td>
    </tr>
  </table>

  <p style="margin:24px 0 8px;color:#666;font-size:13px;">Factuurdatum: ${fmt(invoice.issueDate)} &nbsp;·&nbsp; Vervaldatum: ${fmt(invoice.dueDate)}</p>
  ${invoice.notes ? `<p style="margin:0 0 24px;color:#444;font-size:13px;white-space:pre-wrap;">${invoice.notes}</p>` : ""}

  <a href="${appUrl}/invoices/${invoice.id}/print" style="display:inline-block;margin-top:16px;padding:10px 20px;background:#397d3a;color:#fff;border-radius:6px;text-decoration:none;font-weight:500;">Factuur bekijken / afdrukken</a>

  <p style="margin-top:40px;color:#888;font-size:12px;">
    ${settings?.name ?? ""} &nbsp;·&nbsp; ${settings?.email ?? ""}<br>
    ${settings?.iban ? `IBAN: ${settings.iban}` : ""}
    ${settings?.vatNumber ? ` &nbsp;·&nbsp; BTW: ${settings.vatNumber}` : ""}
    ${settings?.kvkNumber ? ` &nbsp;·&nbsp; KvK: ${settings.kvkNumber}` : ""}
  </p>
</div>
</body>
</html>`;
}

export async function sendInvoiceEmail(invoice: any, settings: any): Promise<void> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const from = { email: settings?.email ?? "noreply@evabits.com", name: settings?.name ?? "EVAbits" };
  const to = [{ email: invoice.customer.email }];

  const attachmentFetches = (invoice.attachments ?? []).map(async (a: any) => {
    const res = await fetch(a.url, {
      headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
    });
    const buf = await res.arrayBuffer();
    return {
      filename: a.filename,
      content: Buffer.from(buf).toString("base64"),
      type: "application/octet-stream",
      disposition: "attachment" as const,
    };
  });
  const attachments = await Promise.all(attachmentFetches);

  await client.send({
    from,
    to,
    subject: `Factuur ${invoice.invoiceNumber}${invoice.subject ? ` — ${invoice.subject}` : ""}`,
    html: invoiceHtml(invoice, settings, appUrl),
    attachments,
  });
}

export async function sendReminderEmail(invoice: any, settings: any): Promise<void> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const from = { email: settings?.email ?? "noreply@evabits.com", name: settings?.name ?? "EVAbits" };
  const to = [{ email: invoice.customer.email }];

  const html = `<!DOCTYPE html>
<html>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;color:#111;background:#fff;margin:0;padding:0;">
<div style="max-width:640px;margin:0 auto;padding:40px 24px;">
  <p style="font-size:20px;font-weight:700;margin:0 0 32px;">${settings?.name ?? ""}</p>

  <p style="margin:0 0 8px;">Geachte ${invoice.customer.name},</p>
  <p style="margin:0 0 16px;">Wij constateren dat factuur <strong>${invoice.invoiceNumber}</strong> van <strong>${fmt(invoice.issueDate)}</strong> met vervaldatum <strong>${fmt(invoice.dueDate)}</strong> nog niet is voldaan.</p>
  <p style="margin:0 0 16px;">Het openstaande bedrag is <strong>${formatCurrency(Number(invoice.total))}</strong>.</p>
  <p style="margin:0 0 24px;">Graag verzoeken wij u dit bedrag zo spoedig mogelijk over te maken onder vermelding van het factuurnummer.</p>

  <a href="${appUrl}/invoices/${invoice.id}/print" style="display:inline-block;margin-top:8px;padding:10px 20px;background:#397d3a;color:#fff;border-radius:6px;text-decoration:none;font-weight:500;">Factuur bekijken</a>

  <p style="margin-top:40px;color:#888;font-size:12px;">
    ${settings?.name ?? ""} &nbsp;·&nbsp; ${settings?.email ?? ""}<br>
    ${settings?.iban ? `IBAN: ${settings.iban}` : ""}
    ${settings?.vatNumber ? ` &nbsp;·&nbsp; BTW: ${settings.vatNumber}` : ""}
  </p>
</div>
</body>
</html>`;

  await client.send({
    from,
    to,
    subject: `Herinnering: openstaande factuur ${invoice.invoiceNumber}`,
    html,
  });
}
