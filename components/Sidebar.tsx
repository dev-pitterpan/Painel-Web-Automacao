import Link from "next/link";
const items = [
  ["Dashboard", "/"],
  ["Produtos", "/produtos"],
  ["Erros", "/erros"],
  ["Relatórios", "/relatorios"],
];
export function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">PP</div>
        <div>
          <div className="brand-title">Pitter Pan Festas</div>
          <div className="brand-sub">Automação Shopify</div>
        </div>
      </div>
      <nav className="nav">
        {items.map(([label, href]) => (
          <Link key={href} href={href}>
            {label}
          </Link>
        ))}
      </nav>
      <div className="sidebar-foot">V1 • Google Sheets + n8n</div>
    </aside>
  );
}
