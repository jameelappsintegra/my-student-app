import Link from "next/link";
import { useRouter } from "next/router";
import menuItems from "../../data/data";
import { useAuth } from "../../context/auth";

const Sidemenu = () => {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const isActive = (link) =>
    link === "/" ? router.pathname === "/" : router.pathname.startsWith(link);

  return (
    <nav className="w-64 min-h-full bg-white border-r border-slate-200 p-4 flex flex-col">
      <Link href="/">
        <a className="block px-3 mb-6 text-2xl font-bold text-primary">
          EduPro
        </a>
      </Link>
      <ul className="space-y-1 flex-1">
        {menuItems.map((item) => (
          <li key={item.link}>
            <Link href={item.link}>
              <a
                aria-current={isActive(item.link) ? "page" : undefined}
                className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
                  isActive(item.link)
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {item.name}
                {item.comingSoon && (
                  <span className="badge badge-ghost badge-sm">Soon</span>
                )}
              </a>
            </Link>
          </li>
        ))}
      </ul>
      {user && (
        <div className="mt-auto pt-6 border-t border-slate-100">
          <p className="px-3 text-sm font-medium text-slate-700 truncate">
            {user.name || user.username}
          </p>
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
