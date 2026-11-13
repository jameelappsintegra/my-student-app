import Link from "next/link";
import { useRouter } from "next/router";
import menuItems from "../../data/data";

const Sidemenu = () => {
  const router = useRouter();
  const isActive = (link) =>
    link === "/" ? router.pathname === "/" : router.pathname.startsWith(link);

  return (
    <nav className="w-64 min-h-full bg-white border-r border-slate-200 p-4">
      <Link href="/">
        <a className="block px-3 mb-6 text-2xl font-bold text-primary">
          EduPro
        </a>
      </Link>
      <ul className="space-y-1">
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
    </nav>
  );
};

export default Sidemenu;
