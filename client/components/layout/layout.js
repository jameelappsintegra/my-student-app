import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import Sidemenu, { isActive } from "../sideMenu/sideMenu";
import { tabItems } from "../../data/data";
import { useAuth } from "../../context/auth";
import GlobalSearch from "../search/GlobalSearch";
import Icon from "../common/Icon";
import NotificationBell from "../common/NotificationBell";

// Desktop: sidebar + top search bar. Phone: app bar, bottom tab bar and a
// full-screen search, like a native app.
const Layout = ({ title, back, children }) => {
  const router = useRouter();
  const { can, user } = useAuth();
  const canSearch = can("students.search");
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
    setSearchOpen(false);
  }, [router.asPath]);

  return (
    <>
      <Head>
        <title>{title ? `${title} · EduPro` : "EduPro"}</title>
      </Head>
      <div className="drawer drawer-mobile">
        <input
          id="edupro-drawer"
          type="checkbox"
          className="drawer-toggle"
          checked={menuOpen}
          onChange={(e) => setMenuOpen(e.target.checked)}
        />
        <div className="drawer-content flex flex-col bg-slate-50 min-h-screen">
          {/* Phone app bar */}
          <header className="lg:hidden sticky top-0 z-30 flex items-center gap-1 bg-white/95 backdrop-blur border-b border-slate-200 px-2 pt-[env(safe-area-inset-top)] h-14 box-content">
            {back ? (
              <button className="btn btn-ghost btn-sm btn-circle" aria-label="Back" onClick={() => router.back()}>
                <Icon name="back" />
              </button>
            ) : (
              <label htmlFor="edupro-drawer" className="btn btn-ghost btn-sm btn-circle" aria-label="Open menu">
                <Icon name="menu" />
              </label>
            )}
            <span className="font-semibold text-slate-900 truncate flex-1 px-1">{title || "EduPro"}</span>
            <NotificationBell />
            {canSearch && (
              <button className="btn btn-ghost btn-sm btn-circle" aria-label="Search students" onClick={() => setSearchOpen(true)}>
                <Icon name="search" />
              </button>
            )}
          </header>

          {/* Desktop search bar */}
          <div className="hidden lg:flex items-center gap-3 sticky top-0 z-30 bg-slate-50/95 backdrop-blur border-b border-slate-200 px-8 py-3">
            {canSearch ? <GlobalSearch className="max-w-xl flex-1" /> : <div className="flex-1" />}
            <NotificationBell />
          </div>

          <main className="flex-1 p-4 md:p-8 pb-24 lg:pb-8 max-w-6xl w-full">{children}</main>

          {/* Phone bottom tabs */}
          <nav className="btm-nav lg:hidden z-30 border-t border-slate-200 bg-white h-16 pb-[env(safe-area-inset-bottom)] box-content" aria-label="Tabs">
            {tabItems(can, user?.role).map((item) => {
                const active = isActive(router.pathname, item.link);
                return (
                  <Link key={item.link} href={item.link}>
                    <a className={active ? "active text-primary" : "text-slate-500"} aria-current={active ? "page" : undefined}>
                      <Icon name={item.icon} />
                      <span className="btm-nav-label text-[11px]">{item.short}</span>
                    </a>
                  </Link>
                );
              })}
          </nav>
        </div>
        <div className="drawer-side">
          <label htmlFor="edupro-drawer" className="drawer-overlay" />
          <Sidemenu />
        </div>
      </div>

      {searchOpen && (
        <div className="fixed inset-0 z-50 bg-white lg:hidden flex flex-col pt-[env(safe-area-inset-top)]" role="dialog" aria-label="Search students">
          <div className="flex items-start gap-2 p-3 border-b border-slate-200">
            <GlobalSearch autoFocus className="flex-1" onNavigate={() => setSearchOpen(false)} />
            <button className="btn btn-ghost" onClick={() => setSearchOpen(false)}>Cancel</button>
          </div>
          <p className="p-4 text-sm text-slate-500">Type at least two letters of a name or an admission number.</p>
        </div>
      )}
    </>
  );
};

export default Layout;
