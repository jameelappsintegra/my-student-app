import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/router";
import { api } from "../../services/api";
import { Avatar } from "../common";
import { classLabel, fullName } from "../../constants";

// Type-ahead search for students across every school. Arrow keys move,
// Enter opens the student, Escape closes the list.
export default function GlobalSearch({ autoFocus = false, onNavigate, className = "" }) {
  const router = useRouter();
  const listId = useId();
  const [q, setQ] = useState("");
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [state, setState] = useState("idle"); // idle | loading | done | error
  const seq = useRef(0);
  const inputRef = useRef(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setItems([]);
      setState("idle");
      return undefined;
    }
    const mine = ++seq.current;
    setState("loading");
    const t = setTimeout(() => {
      api
        .search(term)
        .then((res) => {
          // Ignore answers to older keystrokes.
          if (mine !== seq.current) return;
          setItems(res.data);
          setActive(res.data.length ? 0 : -1);
          setState("done");
        })
        .catch(() => mine === seq.current && setState("error"));
    }, 220);
    return () => clearTimeout(t);
  }, [q]);

  const go = (student) => {
    setOpen(false);
    setQ("");
    onNavigate?.();
    router.push(`/students/${student.id}`);
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(items.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter" && open && items[active]) {
      e.preventDefault();
      go(items[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const showList = open && q.trim().length >= 2;

  return (
    <div className={`relative ${className}`}>
      <label htmlFor={`${listId}-input`} className="sr-only">Search students</label>
      <input
        ref={inputRef}
        id={`${listId}-input`}
        type="search"
        role="combobox"
        aria-expanded={showList}
        aria-controls={`${listId}-list`}
        aria-autocomplete="list"
        aria-activedescendant={showList && items[active] ? `${listId}-opt-${active}` : undefined}
        autoComplete="off"
        placeholder="Search students by name or admission no."
        className="input input-bordered w-full"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKeyDown}
      />
      {showList && (
        <ul
          id={`${listId}-list`}
          role="listbox"
          aria-label="Matching students"
          className="absolute z-40 mt-1 w-full max-h-[60vh] overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg"
        >
          {state === "loading" && !items.length && <li className="px-4 py-3 text-sm text-slate-500">Searching…</li>}
          {state === "error" && <li className="px-4 py-3 text-sm text-error">Search failed. Try again.</li>}
          {state === "done" && !items.length && (
            <li className="px-4 py-3 text-sm text-slate-500">No students match “{q.trim()}”.</li>
          )}
          {items.map((s, i) => (
            <li
              key={s.id}
              id={`${listId}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              className={`flex items-center gap-3 px-3 py-2 cursor-pointer ${i === active ? "bg-primary/10" : "hover:bg-slate-50"}`}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => go(s)}
            >
              <Avatar student={s} size="w-9 h-9" text="text-xs" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{fullName(s)}</p>
                <p className="text-xs text-slate-500 truncate">
                  {s.admissionNumber} · {classLabel(s.className)}
                  {s.section ? ` ${s.section}` : ""} · {s.school?.name}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
