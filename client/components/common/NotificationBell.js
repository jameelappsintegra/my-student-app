import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import Icon from "./Icon";
import { api } from "../../services/api";

const ago = (iso) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

// Bell with unread count; checks for new items every minute.
export default function NotificationBell() {
  const router = useRouter();
  const [data, setData] = useState({ items: [], unread: 0 });
  const [open, setOpen] = useState(false);
  const box = useRef(null);

  // The bell must never break the page it sits on.
  const load = useCallback(() => {
    try {
      Promise.resolve(api.notifications.list())
        .then((r) => r?.data && setData(r.data))
        .catch(() => {});
    } catch {
      // Notifications unavailable: show an empty bell.
    }
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => box.current && !box.current.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const openItem = async (n) => {
    setOpen(false);
    if (!n.readAt) {
      await api.notifications.read({ ids: [n.id] }).catch(() => {});
      load();
    }
    if (n.link) router.push(n.link);
  };

  return (
    <div className="relative" ref={box}>
      <button className="btn btn-ghost btn-sm btn-circle relative" aria-label={`Notifications${data.unread ? `, ${data.unread} unread` : ""}`} aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name="bell" />
        {data.unread > 0 && <span className="badge badge-error badge-xs absolute -top-0.5 -right-0.5 text-[10px] px-1">{data.unread > 9 ? "9+" : data.unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-white border border-slate-200 rounded-xl shadow-lg z-50" role="dialog" aria-label="Notifications">
          <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100">
            <span className="font-semibold text-sm">Notifications</span>
            {data.unread > 0 && <button className="btn btn-ghost btn-xs" onClick={async () => { await api.notifications.read({ all: true }); load(); }}>Mark all read</button>}
          </div>
          <ul className="max-h-96 overflow-auto divide-y divide-slate-100">
            {data.items.length === 0 && <li className="px-4 py-6 text-sm text-slate-500 text-center">You&apos;re all caught up.</li>}
            {data.items.map((n) => (
              <li key={n.id}>
                <button className={`w-full text-left px-4 py-3 hover:bg-slate-50 ${n.readAt ? "" : "bg-primary/5"}`} onClick={() => openItem(n)}>
                  <p className={`text-sm ${n.readAt ? "text-slate-700" : "font-semibold text-slate-900"}`}>{n.title}</p>
                  {n.body && <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.body}</p>}
                  <p className="text-[11px] text-slate-400 mt-1">{ago(n.createdAt)}</p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
