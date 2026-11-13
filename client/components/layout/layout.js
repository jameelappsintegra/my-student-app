import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import Sidemenu from "../sideMenu/sideMenu";

const Layout = ({ title, children }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const router = useRouter();

  // Close the mobile drawer after navigating.
  useEffect(() => setMenuOpen(false), [router.asPath]);

  return (
    <>
      <Head>
        <title>{title ? `${title} · EduPro` : "EduPro"}</title>
        <meta name="description" content="EduPro school management" />
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
          <header className="lg:hidden flex items-center gap-3 bg-white border-b border-slate-200 px-4 py-3">
            <label
              htmlFor="edupro-drawer"
              className="btn btn-ghost btn-sm"
              aria-label="Open menu"
            >
              ☰
            </label>
            <span className="font-bold text-primary text-lg">EduPro</span>
          </header>
          <main className="flex-1 p-4 md:p-8 max-w-6xl w-full">{children}</main>
        </div>
        <div className="drawer-side">
          <label htmlFor="edupro-drawer" className="drawer-overlay" />
          <Sidemenu />
        </div>
      </div>
    </>
  );
};

export default Layout;
