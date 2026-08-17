import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import { groupLinesByType } from "@/lib/invoice-lines";
import { customerAddressLines } from "@/lib/customer-address";
import { formatDate as fmt } from "@/lib/utils";

const s = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 10, color: "#111", padding: "40px 48px 64px" },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 32 },
  addressBlock: { fontSize: 10, lineHeight: 1.6 },
  // alignItems en niet textAlign: react-pdf erft textAlign niet van een View
  // door naar de Text eronder, waardoor elke regel links bleef staan en het
  // logo boven een rafelige kolom hing.
  companyBlock: { fontSize: 10, lineHeight: 1.6, alignItems: "flex-end", textAlign: "right" },
  logoRow: { flexDirection: "row", justifyContent: "flex-end", marginBottom: 10 },
  // objectPositionX houdt het beeld tegen de rechterrand van zijn kader.
  // Zonder dat staat een breed-en-laag logo gecentreerd in dat kader en
  // lijkt het niet uitgelijnd, ook al zit het kader wel goed.
  logo: { width: 180, height: 64, objectFit: "contain", objectPositionX: "right" },
  heading: { fontSize: 22, fontFamily: "Helvetica-Bold", marginBottom: 10 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderBottomWidth: 1, borderColor: "#ddd", paddingVertical: 8, marginBottom: 20 },
  metaLabel: { color: "#555", marginRight: 4 },
  metaBold: { fontFamily: "Helvetica-Bold" },
  subject: { fontSize: 10, marginBottom: 16, color: "#333" },
  intro: { fontSize: 10, marginBottom: 16, color: "#333", lineHeight: 1.5 },
  tableHeader: { flexDirection: "row", borderBottomWidth: 1, borderColor: "#333", paddingBottom: 4, marginBottom: 2 },
  tableRow: { flexDirection: "row", borderBottomWidth: 1, borderColor: "#eee", paddingVertical: 5 },
  colDesc: { flex: 3, paddingRight: 8 },
  colNum: { width: 48, textAlign: "right", paddingRight: 8 },
  colPrice: { width: 56, textAlign: "right", paddingRight: 8 },
  colTotal: { width: 56, textAlign: "right", paddingRight: 8 },
  colBtw: { width: 36, textAlign: "right" },
  headerText: { fontFamily: "Helvetica-Bold", fontSize: 9, color: "#666" },
  totalsWrap: { flexDirection: "row", justifyContent: "flex-end", marginTop: 8 },
  totals: { width: 200 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3, borderBottomWidth: 1, borderColor: "#eee" },
  totalGrand: { flexDirection: "row", justifyContent: "space-between", paddingTop: 5, borderTopWidth: 1, borderColor: "#333" },
  totalGrandText: { fontFamily: "Helvetica-Bold", fontSize: 11 },
  notes: { marginTop: 24, fontSize: 10, color: "#444", lineHeight: 1.5 },
  groupHeading: { marginTop: 10, marginBottom: 2, fontSize: 10, fontFamily: "Helvetica-Bold", color: "#111" },
  bold: { fontFamily: "Helvetica-Bold" },
});

function fmtCurrency(n: number) {
  return `€ ${n.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function InvoicePdf({ invoice, settings }: { invoice: any; settings: any }) {
  const vatRate = Number(invoice.vatRate);

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Logo op een eigen regel, zodat de klantnaam hieronder op dezelfde
            hoogte begint als de bedrijfsnaam — een logo is niet altijd even
            hoog en zou de twee kolommen anders uit de pas laten lopen. */}
        {settings?.logoUrl && (
          <View style={s.logoRow}>
            <Image src={settings.logoUrl} style={s.logo} />
          </View>
        )}

        {/* Klant links, bedrijf rechts */}
        <View style={s.row}>
          <View style={s.addressBlock}>
            {customerAddressLines(invoice.customer).map((regel, i) => (
              <Text key={i} style={i === 0 ? s.bold : undefined}>{regel}</Text>
            ))}
          </View>
          <View style={s.companyBlock}>
            <Text style={s.bold}>{settings?.name ?? ""}</Text>
            {settings?.address && <Text>{settings.address}</Text>}
            {settings?.postalCode && <Text>{settings.postalCode}{settings?.city ? ` ${settings.city}` : ""}</Text>}
            {settings?.email && <><Text>{"\n"}</Text><Text>{settings.email}</Text></>}
            {(settings?.kvkNumber || settings?.vatNumber || settings?.iban) && <Text>{"\n"}</Text>}
            {settings?.kvkNumber && <Text>KvK: {settings.kvkNumber}</Text>}
            {settings?.vatNumber && <Text>Btw: {settings.vatNumber}</Text>}
            {settings?.iban && <Text>IBAN: {settings.iban}</Text>}
          </View>
        </View>

        {/* FACTUUR */}
        <Text style={s.heading}>FACTUUR</Text>

        {/* Meta */}
        <View style={s.metaRow}>
          <View>
            <View style={{ flexDirection: "row", marginBottom: 2 }}>
              <Text style={s.metaLabel}>Factuurnummer:</Text>
              <Text>{invoice.invoiceNumber}</Text>
            </View>
            {invoice.reference && (
              <View style={{ flexDirection: "row", marginBottom: 2 }}>
                <Text style={s.metaLabel}>Kenmerk:</Text>
                <Text>{invoice.reference}</Text>
              </View>
            )}
            {invoice.customer?.customerNumber && (
              <View style={{ flexDirection: "row" }}>
                <Text style={s.metaLabel}>Klantnummer:</Text>
                <Text>{invoice.customer.customerNumber}</Text>
              </View>
            )}
          </View>
          <View style={{ textAlign: "right" }}>
            <View style={{ flexDirection: "row", marginBottom: 2, justifyContent: "flex-end" }}>
              <Text style={s.metaLabel}>Factuurdatum:</Text>
              <Text>{fmt(invoice.issueDate)}</Text>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
              <Text style={s.metaLabel}>Vervaldatum:</Text>
              <Text>{fmt(invoice.dueDate)}</Text>
            </View>
          </View>
        </View>

        {/* Subject */}
        {invoice.subject && <Text style={s.subject}>{invoice.subject}</Text>}

        {/* Inleiding */}
        {invoice.intro && <Text style={s.intro}>{invoice.intro}</Text>}

        {/* Table header */}
        <View style={s.tableHeader}>
          <Text style={[s.headerText, s.colDesc]}>Omschrijving</Text>
          <Text style={[s.headerText, s.colNum]}>Aantal</Text>
          <Text style={[s.headerText, s.colPrice]}>Prijs</Text>
          <Text style={[s.headerText, s.colTotal]}>Totaal</Text>
          <Text style={[s.headerText, s.colBtw]}>Btw</Text>
        </View>

        {/* Lines, per soort met een kopje ertussen */}
        {groupLinesByType(invoice.lines as any[]).map((groep, gi) => (
          <View key={groep.heading ?? `los-${gi}`}>
            {groep.heading && <Text style={s.groupHeading}>{groep.heading}</Text>}
            {groep.lines.map((line: any) => (
              <View key={line.id} style={s.tableRow}>
                <Text style={s.colDesc}>{line.description}</Text>
                <Text style={s.colNum}>{Number(line.quantity).toFixed(2)}</Text>
                <Text style={s.colPrice}>{fmtCurrency(Number(line.unitPrice))}</Text>
                <Text style={s.colTotal}>{fmtCurrency(Number(line.total))}</Text>
                <Text style={s.colBtw}>{vatRate.toFixed(0)}%</Text>
              </View>
            ))}
          </View>
        ))}

        {/* Totals */}
        <View style={s.totalsWrap}>
          <View style={s.totals}>
            <View style={s.totalRow}>
              <Text>Subtotaal</Text>
              <Text>{fmtCurrency(Number(invoice.subtotal))}</Text>
            </View>
            <View style={s.totalRow}>
              <Text>BTW {vatRate.toFixed(0)}%</Text>
              <Text>{fmtCurrency(Number(invoice.vatAmount))}</Text>
            </View>
            <View style={s.totalGrand}>
              <Text style={s.totalGrandText}>Totaal</Text>
              <Text style={s.totalGrandText}>{fmtCurrency(Number(invoice.total))}</Text>
            </View>
          </View>
        </View>

        {/* Notes */}
        {invoice.notes && <Text style={s.notes}>{invoice.notes}</Text>}
      </Page>
    </Document>
  );
}
