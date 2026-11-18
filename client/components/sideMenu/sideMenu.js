import Link from "next/link";
import { useRouter } from "next/router";
import menuItems from "../../data/data";
import { useAuth } from "../../context/auth";
import Icon from "../common/Icon";

export const isActive = (pathname, link) =>
  link === "/" ? pathname === "/" : pathname === link || pathname.startsWith(`${link}/`);

const Sidemenu = () => {
  const router = useRouter();
  const { user, signOut } = useAuth();

  return (
    <nav className="w-64 min-h-full bg-white border-r border-slate-200 p-4 flex flex-col" aria-label="Main">
      <Link href="/">
        <a className="block px-3 mb-6 text-2xl font-bold text-primary">EduPro</a>
      </Link>
      <ul className="space-y-1 flex-1">
        {menuItems.map((item) => {
          const active = isActive(router.pathname, item.link);
          return (
            <li key={item.link}>
              <Link href={item.link}>
                <a
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                    active ? "bg-primary/10 text-primary font-medium" : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <Icon name={item.icon} />
                  {item.name}
                </a>
              </Link>
            </li>
          );
        })}
      </ul>
      {user && (
        <div className="mt-auto pt-6 border-t border-slate-100">
          <p className="px-3 text-sm font-medium text-slate-700 truncate">{user.name || user.username}</p>
          <p className="px-3 text-xs text-slate-500 capitalize">{user.role}</p>
          <button className="btn btn-ghost btn-sm w-full justify-start mt-2" onClick={signOut}>
            Sign out
          </button>
        </div>
      )}
    </nav>
  );
};

export default Sidemenu;
