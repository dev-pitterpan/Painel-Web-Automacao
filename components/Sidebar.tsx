"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { ChevronLeft, ChevronRight, CircleAlert, FileText, LayoutDashboard, Package } from "lucide-react";

const items: Array<[string, string, LucideIcon]> = [
  ["Dashboard", "/", LayoutDashboard],
  ["Produtos", "/produtos", Package],
  ["Erros", "/erros", CircleAlert],
  ["Relatórios", "/relatorios", FileText],
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  return (
    <aside className={`sidebar ${collapsed ? "is-collapsed" : ""}`}>
      <button
        className="sidebar-toggle"
        type="button"
        aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
        title={collapsed ? "Expandir menu" : "Recolher menu"}
        onClick={() => setCollapsed(value => !value)}
      >
        {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>
      <div className="brand">
        <img className="brand-logo" src="/logo-pitter-com-fundo.png" alt="Pitter Pan Festas" />
        <div>
          <div className="brand-title">Catálogo Pro</div>
          <div className="brand-sub">Automação de e-commerce</div>
        </div>
      </div>
      <nav className="nav">
        {items.map(([label, href, Icon]) => (
          <Link
            key={href}
            href={href}
            className={pathname === href ? "is-active" : undefined}
          >
            {Icon && <Icon size={17} strokeWidth={2} />}
            <span>{label}</span>
          </Link>
        ))}
      </nav>
      <div className="sidebar-user">
        <span className="avatar">AD</span>
        <span><strong>Administrador</strong><small>admin@exemplo.com</small></span>
        <span className="user-chevron">⌄</span>
      </div>
    </aside>
  );
}
