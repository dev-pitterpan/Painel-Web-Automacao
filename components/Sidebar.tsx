"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  ArchiveX,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  FileText,
  LayoutDashboard,
  LogOut,
  Package,
  RotateCcw,
  ScrollText,
  Settings,
  UserCog,
  UserRound,
} from "lucide-react";
import type { AuthUser } from "@/lib/auth";

const items: Array<[string, string, LucideIcon]> = [
  ["Dashboard", "/", LayoutDashboard],
  ["Produtos", "/produtos", Package],
  ["Excluídos", "/excluidos", ArchiveX],
  ["Erros", "/erros", CircleAlert],
  ["Relatórios", "/relatorios", FileText],
];

export function Sidebar({ user }: { user: AuthUser }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [productsOpen, setProductsOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const navRef = useRef<HTMLElement>(null);
  const navigationItems =
    user.role === "admin"
      ? [
          ...items,
          ["Reprocessados", "/reprocessados", RotateCcw] as [
            string,
            string,
            LucideIcon,
          ],
          ["Integrações", "/saude", Activity] as [string, string, LucideIcon],
          ["Usuários", "/usuarios", UserCog] as [string, string, LucideIcon],
          ["Auditoria", "/auditoria", ScrollText] as [
            string,
            string,
            LucideIcon,
          ],
          ["Meu perfil", "/perfil", UserRound] as [string, string, LucideIcon],
          ["Configurações", "/configuracoes", Settings] as [
            string,
            string,
            LucideIcon,
          ],
        ]
      : [
          ...items,
          ["Meu perfil", "/perfil", UserRound] as [string, string, LucideIcon],
        ];

  useEffect(() => {
    setMobileOpen(false);
    setProductsOpen(false);
  }, [pathname]);
  useEffect(() => {
    document.body.classList.toggle("mobile-menu-open", mobileOpen);
    if (mobileOpen) navRef.current?.scrollTo({ top: 0 });
    return () => document.body.classList.remove("mobile-menu-open");
  }, [mobileOpen]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <>
      <button
        className={`mobile-menu-toggle ${mobileOpen ? "is-open" : ""}`}
        type="button"
        onClick={() => setMobileOpen((value) => !value)}
        aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"}
        aria-expanded={mobileOpen}
      >
        <span className="mobile-menu-icon" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </button>
      <aside
        className={`sidebar ${collapsed ? "is-collapsed" : ""} ${mobileOpen ? "is-mobile-open" : ""}`}
      >
        <div className="sidebar-art" aria-hidden="true" />
        <button
          className="sidebar-toggle"
          type="button"
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          title={collapsed ? "Expandir menu" : "Recolher menu"}
          onClick={() => setCollapsed((value) => !value)}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
        <div
          className="brand"
          style={mobileOpen ? { display: "none" } : undefined}
        >
          <img
            className="brand-logo"
            src="/favicon.svg"
            alt="Pitter Pan Festas"
            width={60}
            height={60}
          />
          <div>
            <div className="brand-title">Catálogo Pro</div>
            <div className="brand-sub">Automação de e-commerce</div>
          </div>
        </div>
        <nav className="nav">
          {navigationItems.map(([label, href, Icon]) => label === "Produtos" ? (
            <div className={`nav-products-group ${productsOpen ? "is-open" : ""}`} key={href}>
              <button
                type="button"
                className={`nav-products-trigger ${pathname.startsWith("/produtos") ? "is-active" : ""}`}
                data-tooltip={collapsed ? label : undefined}
                onClick={() => setProductsOpen((value) => !value)}
                aria-expanded={productsOpen}
              >
                <Icon size={17} strokeWidth={2} />
                <span>{label}</span>
                <ChevronRight className="nav-products-chevron" size={15} />
              </button>
              {productsOpen && (
                <div className="nav-products-flyout">
                  <strong>Produtos</strong>
                  <Link href="/produtos" className={pathname === "/produtos" ? "is-active" : undefined} onClick={() => setProductsOpen(false)}>Todos os produtos</Link>
                  <Link href="/produtos/processados" className={pathname.startsWith("/produtos/processados") ? "is-active" : undefined} onClick={() => setProductsOpen(false)}>Produtos processados</Link>
                </div>
              )}
            </div>
          ) : (
            <Link
              key={href}
              href={href}
              className={pathname === href ? "is-active" : undefined}
              data-tooltip={collapsed ? label : undefined}
              onClick={() => setMobileOpen(false)}
            >
              {Icon && <Icon size={17} strokeWidth={2} />}
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-user">
          <Link
            className="sidebar-user-profile"
            href="/perfil"
            title="Personalizar perfil"
            aria-label="Personalizar perfil"
          >
            <span className="avatar">
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt="" />
              ) : (
                user.name.slice(0, 2).toUpperCase()
              )}
            </span>
            <span className="sidebar-user-details">
              <strong>{user.name}</strong>
              <small>{user.email}</small>
            </span>
          </Link>
          <button
            className="user-logout"
            type="button"
            onClick={logout}
            aria-label="Sair"
            title="Sair"
          >
            <LogOut size={15} />
          </button>
        </div>
      </aside>
      {mobileOpen && (
        <>
          <nav
            className="mobile-drawer"
            ref={navRef}
            aria-label="Menu principal"
          >
            <div className="mobile-drawer-brand">
              <img
                src="/logo-pitter-com-fundo.png"
                alt=""
                width={42}
                height={42}
              />
              <span>
                <strong>Catálogo Pro</strong>
                <small>Automação de e-commerce</small>
              </span>
            </div>
            {navigationItems.map(([label, href, Icon]) => label === "Produtos" ? (
              <div className="mobile-products-group" key={href}>
                <button className={pathname.startsWith("/produtos") ? "is-active" : undefined} type="button" onClick={() => setProductsOpen((value) => !value)} aria-expanded={productsOpen}>
                  <Icon size={18} strokeWidth={2} />
                  <span>{label}</span>
                  <ChevronRight className={productsOpen ? "is-open" : ""} size={16} />
                </button>
                {productsOpen && <div className="mobile-products-links">
                  <Link href="/produtos" className={pathname === "/produtos" ? "is-active" : undefined} onClick={() => { setMobileOpen(false); setProductsOpen(false); }}>Todos os produtos</Link>
                  <Link href="/produtos/processados" className={pathname.startsWith("/produtos/processados") ? "is-active" : undefined} onClick={() => { setMobileOpen(false); setProductsOpen(false); }}>Produtos processados</Link>
                </div>}
              </div>
            ) : (
              <Link
                key={href}
                href={href}
                className={pathname === href ? "is-active" : undefined}
                onClick={() => setMobileOpen(false)}
              >
                <Icon size={18} strokeWidth={2} />
                <span>{label}</span>
              </Link>
            ))}
          </nav>
          <button
            className="mobile-menu-backdrop"
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Fechar menu"
          />
        </>
      )}
    </>
  );
}
