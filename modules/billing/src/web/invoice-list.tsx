"use client";

export interface Invoice {
  id: string;
  provider?: string;
  number: string | null;
  amountPaid: number;
  currency: string;
  status: string | null;
  /** Unix seconds. */
  created: number;
  hostedInvoiceUrl: string | null;
  invoicePdf: string | null;
}

function money(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

/** Past invoices, newest first (any provider). */
export function InvoiceList({
  invoices,
  loading,
}: {
  invoices: Invoice[] | undefined;
  loading: boolean;
}) {
  if (loading) return <p className="text-muted-foreground text-sm">Loading…</p>;
  if (!invoices || invoices.length === 0) {
    return <p className="text-muted-foreground text-sm">No invoices yet.</p>;
  }
  return (
    <ul className="divide-border divide-y text-sm">
      {invoices.map((inv) => (
        <li
          key={inv.id}
          className="flex items-center justify-between gap-4 py-3"
        >
          <div className="flex flex-col">
            <span className="font-medium">{inv.number ?? inv.id}</span>
            <span className="text-muted-foreground">
              {new Date(inv.created * 1000).toLocaleDateString()} · {inv.status}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span>{money(inv.amountPaid, inv.currency)}</span>
            {inv.hostedInvoiceUrl ? (
              <a
                href={inv.hostedInvoiceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                View
              </a>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
