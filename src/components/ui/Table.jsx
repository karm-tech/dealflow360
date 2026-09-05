// Wide content scrolls inside the table's own box rather than the page.
//
//   <Table>
//     <THead><TR><TH>Customer</TH><TH align="right">Amount</TH></TR></THead>
//     <TBody><TR><TD>Acme</TD><TD figure align="right">₹5,60,800</TD></TR></TBody>
//   </Table>
export function Table({ className = "", children }) {
  return (
    <div className="overflow-x-auto overflow-y-hidden rounded-xl border border-sand-200 bg-surface shadow-card">
      <table className={`w-full border-collapse text-base ${className}`}>{children}</table>
    </div>
  );
}

export function THead({ children }) {
  return <thead className="border-b border-sand-200 bg-sand-50">{children}</thead>;
}

export function TBody({ children }) {
  return <tbody className="divide-y divide-sand-200">{children}</tbody>;
}

export function TR({ selected = false, className = "", children, ...rest }) {
  const interactive = rest.onClick ? "cursor-pointer hover:bg-sand-50" : "";
  // Selected rows get the navy tint, not a heavy fill.
  const state = selected ? "bg-ink-50" : "";
  return (
    <tr className={`${interactive} ${state} ${className}`} {...rest}>
      {children}
    </tr>
  );
}

export function TH({ align = "left", className = "", children }) {
  return (
    <th
      scope="col"
      className={`px-4 py-2.5 text-2xs font-semibold uppercase text-sand-600 ${
        align === "right" ? "text-right" : "text-left"
      } ${className}`}
    >
      {children}
    </th>
  );
}

// Pass `figure` for anything numeric so the column lines up digit under digit.
export function TD({ align = "left", figure = false, className = "", children, ...rest }) {
  return (
    <td
      className={`px-4 py-3 text-sand-800 ${align === "right" ? "text-right" : "text-left"} ${
        figure ? "figure" : ""
      } ${className}`}
      {...rest}
    >
      {children}
    </td>
  );
}
