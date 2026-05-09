import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";

const s = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 10, color: "#111", padding: "40px 48px 64px" },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 32 },
  addressBlock: { fontSize: 10, lineHeight: 1.6 },
  companyBlock: { fontSize: 10, lineHeight: 1.6, textAlign: "right" },
  logo: { width: 120, height: 48, objectFit: "contain", marginBottom: 6, alignSelf: "flex-end" },
  heading: { fontSize: 22, fontFamily: "Helvetica-Bold", marginBottom: 10 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderBottomWidth: 1, borderColor: "#ddd", paddingVertical: 8, marginBottom: 20 },
  metaLabel: { color: "#555", marginRight: 4 },
  subject: { fontSize: 10, marginBottom: 16, color: "#333" },
  tableHeader: { flexDirection: "row", borderBottomWidth: 1, borderColor: "#333", paddingBottom: 4, marginBottom: 2 },
  tableRow: { flexDirection: "row", borderBottomWidth: 1, borderColor: "#eee", paddingVertical: 5 },
  colDesc: { flex: 3, paddingRight: 8 },
  colNum: { width: 48, textAlign: "right", paddingRight: 8 },
  colPrice: { width: 64, textAlign: "right", paddingRight: 8 },
  colTotal: { width: 64, textAlign: "right" },
  headerText: { fontFamily: "Helvetica-Bold", fontSize: 9, color: "#666" },
  totalsWrap: { flexDirection: "row", justifyContent: "flex-end", marginTop: 8 },
  totals: { width: 200 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3, borderBottomWidth: 1, borderColor: "#eee" },
  totalGrand: { flexDirection: "row", justifyContent: "space-between", paddingTop: 5, borderTopWidth: 1, borderColor: "#333" },
  totalGrandText: { fontFamily: "Helvetica-Bold", fontSize: 11 },
  notes: { marginTop: 24, fontSize: 10, color: "#444", lineHeight: 1.5 },
  bold: { fontFamily: "Helvetica-Bold" },
});

function fmt(date: string) {
  return new Date(date).toLocaleDateString("nl-NL");
}

function fmtCurrency(n: number) {
  return `€ ${n.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function QuotePdf({ quote, settings }: { quote: any; settings: any }) {
  const vatRate = Number(quote.vatRate);

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.row}>
          <View style={s.addressBlock}>
            <Text>{quote.customer.name}</Text>
            {quote.customer.address && <Text>{quote.customer.address}</Text>}
            {quote.customer.postalCode && <Text>{quote.customer.postalCode} {quote.customer.city}</Text>}
            {quote.customer.country && <Text>{quote.customer.country}</Text>}
          </View>
          <View style={s.companyBlock}>
            {settings?.logoUrl && <Image src={settings.logoUrl} style={s.logo} />}
            <Text style={s.bold}>{settings?.name ?? ""}</Text>
            {settings?.address && <Text>{settings.address}</Text>}
            {settings?.postalCode && <Text>{settings.postalCode}{settings?.city ? ` ${settings.city}` : ""}</Text>}
            {settings?.email && <><Text>{"\n"}</Text><Text>{settings.email}</Text></>}
            {(settings?.kvkNumber || settings?.vatNumber || settings?.iban) && <Text>{"\n"}</Text>}
            {settings?.kvkNumber && <Text>KvK: {settings.kvkNumber}</Text>}
            {settings?.vatNumber && <Text>Btw: {settings.vatNumber}</Text>}
          </View>
        </View>

        <Text style={s.heading}>OFFERTE</Text>

        <View style={s.metaRow}>
          <View>
            <View style={{ flexDirection: "row", marginBottom: 2 }}>
              <Text style={s.metaLabel}>Offertenummer:</Text>
              <Text>{quote.quoteNumber}</Text>
            </View>
            {quote.reference && (
              <View style={{ flexDirection: "row", marginBottom: 2 }}>
                <Text style={s.metaLabel}>Kenmerk:</Text>
                <Text>{quote.reference}</Text>
              </View>
            )}
          </View>
          <View style={{ textAlign: "right" }}>
            <View style={{ flexDirection: "row", marginBottom: 2, justifyContent: "flex-end" }}>
              <Text style={s.metaLabel}>Datum:</Text>
              <Text>{fmt(quote.issueDate)}</Text>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
              <Text style={s.metaLabel}>Geldig tot:</Text>
              <Text>{fmt(quote.validUntil)}</Text>
            </View>
          </View>
        </View>

        {quote.subject && <Text style={s.subject}>{quote.subject}</Text>}

        <View style={s.tableHeader}>
          <Text style={[s.headerText, s.colDesc]}>Omschrijving</Text>
          <Text style={[s.headerText, s.colNum]}>Aantal</Text>
          <Text style={[s.headerText, s.colPrice]}>Prijs</Text>
          <Text style={[s.headerText, s.colTotal]}>Totaal</Text>
        </View>

        {quote.lines.map((line: any) => (
          <View key={line.id} style={s.tableRow}>
            <Text style={s.colDesc}>{line.description}</Text>
            <Text style={s.colNum}>{Number(line.quantity).toFixed(2)}</Text>
            <Text style={s.colPrice}>{fmtCurrency(Number(line.unitPrice))}</Text>
            <Text style={s.colTotal}>{fmtCurrency(Number(line.total))}</Text>
          </View>
        ))}

        <View style={s.totalsWrap}>
          <View style={s.totals}>
            <View style={s.totalRow}>
              <Text>Subtotaal</Text>
              <Text>{fmtCurrency(Number(quote.subtotal))}</Text>
            </View>
            <View style={s.totalRow}>
              <Text>BTW {vatRate.toFixed(0)}%</Text>
              <Text>{fmtCurrency(Number(quote.vatAmount))}</Text>
            </View>
            <View style={s.totalGrand}>
              <Text style={s.totalGrandText}>Totaal</Text>
              <Text style={s.totalGrandText}>{fmtCurrency(Number(quote.total))}</Text>
            </View>
          </View>
        </View>

        {quote.notes && <Text style={s.notes}>{quote.notes}</Text>}
      </Page>
    </Document>
  );
}
