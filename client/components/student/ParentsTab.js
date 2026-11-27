import { Card, Details } from "../common";

const tel = (p) => p && <a className="link link-primary" href={`tel:${p.replace(/\s/g, "")}`}>{p}</a>;
const mail = (e) => e && <a className="link link-primary break-all" href={`mailto:${e}`}>{e}</a>;

export default function ParentsTab({ s }) {
  const people = [
    ["Father", s.father, [["Occupation", s.father?.occupation]]],
    ["Mother", s.mother, [["Occupation", s.mother?.occupation]]],
    ["Guardian", s.guardian, [["Relation", s.guardian?.relation]]],
    ["Emergency contact", s.emergencyContact, [["Relation", s.emergencyContact?.relation]]],
  ].filter(([, p]) => p && (p.name || p.phone));

  if (!people.length) return <Card><p className="text-sm text-slate-500">No parent or guardian details recorded. Add them from Edit.</p></Card>;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {people.map(([title, p, extra]) => (
        <Card key={title} title={title}>
          <Details items={[["Name", p.name], ["Phone", tel(p.phone)], ["Email", mail(p.email)], ...extra]} />
        </Card>
      ))}
    </div>
  );
}
