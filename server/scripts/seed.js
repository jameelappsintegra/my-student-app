// Fills the database with sample schools, students (with generated avatar
// photos) and admissions, using the same service code the API uses.
//
//   npm run seed            # refuses if schools already exist
//   npm run seed -- --reset # deletes schools, students, admissions, photos first
//
// All people, phone numbers and addresses are fictional; emails use the
// reserved example.com domain. Never run against a live school database:
// production is refused unless --force is given.
const mongoose = require("mongoose");
const sharp = require("sharp");
const { getMongoUri, isProduction } = require("../src/config/env");
const { connectDatabase, disconnectDatabase } = require("../src/config/db");
const School = require("../src/models/School");
const Student = require("../src/models/Student");
const Admission = require("../src/models/Admission");
const Counter = require("../src/models/Counter");
const Attendance = require("../src/models/Attendance");
const ExamResult = require("../src/models/ExamResult");
const FeeInvoice = require("../src/models/FeeInvoice");
const records = require("../src/services/recordsService");
const User = require("../src/models/User");
const Session = require("../src/models/Session");
const AccessShare = require("../src/models/AccessShare");
const { hashPassword } = require("../src/services/authService");
const { setUserPhoto } = require("../src/services/userPhotoService");
const { BUCKET } = require("../src/services/photoService");
const students = require("../src/services/studentService");
const admissions = require("../src/services/admissionService");
const schools = require("../src/services/schoolService");

const args = new Set(process.argv.slice(2));

// Deterministic pseudo-random numbers so every seed run looks the same.
let state = 20261118;
const rand = () => {
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (list) => list[Math.floor(rand() * list.length)];

const SCHOOLS = [
  { name: "Green Valley Public School", code: "GVPS", board: "CBSE", city: "Parangipettai", address: "14 Beach Road", principalName: "Dr. Lakshmi Narayanan", phone: "04144 243100" },
  { name: "St. Mary's Matriculation School", code: "SMMS", board: "State Board", city: "Chidambaram", address: "2 East Car Street", principalName: "Sr. Agnes Joseph", phone: "04144 222410" },
  { name: "Sunrise International School", code: "SIS", board: "ICSE", city: "Cuddalore", address: "88 Imperial Road", principalName: "Mr. Farhan Siddiqui", phone: "04142 230880" },
];
const GIRLS = ["Aisha", "Meera", "Kavya", "Fatima", "Diya", "Ananya", "Sana", "Priya", "Nila", "Zara", "Ishita", "Lakshmi", "Maryam", "Divya", "Harini"];
const BOYS = ["Arjun", "Rahul", "Omar", "Karthik", "Vikram", "Imran", "Aditya", "Rohan", "Yusuf", "Surya", "Nikhil", "Faizal", "Pranav", "Joel", "Hari"];
const SURNAMES = ["Rahman", "Krishnan", "Joseph", "Iyer", "Khan", "Murugan", "Fernandes", "Subramanian", "Ali", "Pillai", "Thomas", "Raman", "Basha", "Nair", "Selvam"];
const FATHERS = ["Imran", "Suresh", "Anthony", "Ganesh", "Rafiq", "Senthil", "George", "Ramesh", "Abdul", "Mohan", "Thomas", "Prakash"];
const MOTHERS = ["Sara", "Kala", "Mary", "Revathi", "Nasreen", "Selvi", "Anita", "Geetha", "Ayesha", "Latha", "Rosy", "Deepa"];
const OCCUPATIONS = ["Teacher", "Fisheries officer", "Shop owner", "Engineer", "Nurse", "Farmer", "Accountant", "Driver", "Doctor", "Tailor"];
const STREETS = ["Market Street", "Mosque Street", "Temple Road", "Harbour Lane", "Church Street", "Gandhi Nagar", "Station Road", "Nehru Street"];
const BLOOD = ["A+", "B+", "O+", "AB+", "O-", "A-", "B-"];
const PALETTE = ["#4f46e5", "#0ea5e9", "#14b8a6", "#f59e0b", "#ef4444", "#8b5cf6", "#22c55e", "#ec4899"];

const now = new Date();
const startYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
const YEAR = `${startYear}-${startYear + 1}`;

// Demo accounts for trying each role. Passwords come from
// SEED_USER_PASSWORD (all demo accounts share it); without it, no accounts
// are created.
const DEMO_USERS = [
  { username: "principal.gvps", name: "Dr. Lakshmi Narayanan", role: "principal", school: "GVPS" },
  { username: "teacher.gvps", name: "Meera Krishnan", role: "teacher", school: "GVPS", classes: [["7", "A"], ["7", "B"], ["5", null]], grants: ["students.import"] },
  { username: "principal.smms", name: "Sr. Agnes Joseph", role: "principal", school: "SMMS" },
  { username: "teacher.smms", name: "Ravi Fernandes", role: "teacher", school: "SMMS", classes: [["5", null], ["9", null]] },
  { username: "parent.demo", name: "Imran Rahman", role: "parent", school: "GVPS" },
];

const SUBJECTS = {
  pre: ["English", "Tamil", "Numbers", "Rhymes & Activity"],
  primary: ["English", "Tamil", "Mathematics", "Science", "Social Studies"],
  middle: ["English", "Tamil", "Mathematics", "Science", "Social Science"],
  senior: ["English", "Physics", "Chemistry", "Mathematics", "Computer Science"],
};
const subjectsFor = (c) =>
  ["LKG", "UKG"].includes(c) ? SUBJECTS.pre : Number(c) <= 5 ? SUBJECTS.primary : Number(c) <= 10 ? SUBJECTS.middle : SUBJECTS.senior;
const FEE_BY_CLASS = (c) => (["LKG", "UKG"].includes(c) ? 9000 : Number(c) <= 5 ? 12000 : Number(c) <= 10 ? 15000 : 18000);

// School days: the last 60 weekdays up to today. Some are public holidays.
const SCHOOL_DAYS = (() => {
  const days = [];
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  while (days.length < 60) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) days.push(new Date(d));
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return days.reverse();
})();
const HOLIDAYS = new Set([SCHOOL_DAYS[9], SCHOOL_DAYS[31], SCHOOL_DAYS[32]].map((d) => d.toISOString()));

async function addRecords(studentId, schoolId, className) {
  // Attendance: each student has their own reliability.
  const reliability = 0.8 + rand() * 0.18;
  const docs = SCHOOL_DAYS.map((date) => {
    let status = "present";
    if (HOLIDAYS.has(date.toISOString())) status = "holiday";
    else {
      const r = rand();
      if (r > reliability + 0.06) status = "absent";
      else if (r > reliability + 0.03) status = "leave";
      else if (r > reliability) status = "late";
      else if (r > reliability - 0.02) status = "half_day";
    }
    return { student: studentId, school: schoolId, date, status, ...(status === "leave" ? { note: "Leave letter from parent" } : {}) };
  });
  await Attendance.insertMany(docs);

  // Exam results: Term 1 for everyone, mid-term for most.
  const ability = 0.45 + rand() * 0.5;
  for (const [exam, month] of [["Term 1", 8], ["Mid-term", 9]]) {
    if (exam === "Mid-term" && rand() < 0.3) continue;
    await records.createResult(studentId, {
      academicYear: YEAR,
      exam,
      examDate: new Date(Date.UTC(startYear, month, 20)),
      subjects: subjectsFor(className).map((subject) => {
        const marks = Math.max(8, Math.min(100, Math.round((ability + (rand() - 0.5) * 0.3) * 100)));
        return { subject, maxMarks: 100, marks };
      }),
      remarks: ability > 0.8 ? "Excellent work. Keep it up." : ability > 0.6 ? "Good progress." : "Needs more practice at home.",
    });
  }

  // Fees: three terms. Term 1 mostly paid, Term 2 mixed, Term 3 not yet due.
  const termFee = FEE_BY_CLASS(className);
  const terms = [
    ["Term 1 tuition fee", new Date(Date.UTC(startYear, 5, 15))],
    ["Term 2 tuition fee", new Date(Date.UTC(startYear, 9, 15))],
    ["Term 3 tuition fee", new Date(Date.UTC(startYear + 1, 0, 15))],
  ];
  for (const [i, [title, dueDate]] of terms.entries()) {
    const inv = await records.createInvoice(studentId, { academicYear: YEAR, title, amount: termFee, dueDate });
    const r = rand();
    const pay = (amount, daysBefore) =>
      records.recordPayment(studentId, inv.id, {
        amount,
        method: pick(["upi", "cash", "bank_transfer", "card"]),
        paidAt: new Date(Math.min(Date.now(), dueDate.getTime() - daysBefore * 86400000)),
      });
    if (i === 0 && r < 0.92) await pay(termFee, 5);
    else if (i === 0) await pay(Math.round(termFee / 2), 3);
    if (i === 1 && r < 0.55) await pay(termFee, 2);
    else if (i === 1 && r < 0.75) await pay(Math.round(termFee / 2), 1);
    if (i === 2 && r < 0.15) await pay(termFee, 30);
  }
  if (rand() < 0.4) {
    const inv = await records.createInvoice(studentId, {
      academicYear: YEAR,
      title: "Transport fee (annual)",
      amount: 6000,
      dueDate: new Date(Date.UTC(startYear, 6, 1)),
    });
    if (rand() < 0.8) await records.recordPayment(studentId, inv.id, { amount: 6000, method: "upi", paidAt: new Date(Date.UTC(startYear, 5, 28)) });
  }
}

const CLASS_AGES = { LKG: 3, UKG: 4, 1: 5, 2: 6, 3: 7, 4: 8, 5: 9, 6: 10, 7: 11, 8: 12, 9: 13, 10: 14, 11: 15, 12: 16 };

function dob(className) {
  const d = new Date(Date.UTC(startYear - CLASS_AGES[className], 5, 1));
  d.setUTCDate(d.getUTCDate() - Math.floor(rand() * 360));
  return d.toISOString().slice(0, 10);
}
const phone = () => `9${Math.floor(100000000 + rand() * 899999999)}`;

// A simple illustrated avatar (head and shoulders) standing in for a photo.
function avatarSvg(initials, bg) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    <rect width="512" height="512" fill="${bg}"/>
    <circle cx="256" cy="200" r="96" fill="#ffffff" fill-opacity="0.85"/>
    <path d="M86 512c12-110 84-176 170-176s158 66 170 176z" fill="#ffffff" fill-opacity="0.85"/>
    <text x="256" y="222" font-family="Arial, Helvetica, sans-serif" font-size="68" font-weight="700" fill="${bg}" text-anchor="middle">${initials}</text>
  </svg>`);
}

function person(gender) {
  const firstName = gender === "female" ? pick(GIRLS) : pick(BOYS);
  return { firstName, lastName: pick(SURNAMES) };
}

function family(lastName, city) {
  const father = `${pick(FATHERS)} ${lastName}`;
  const mother = `${pick(MOTHERS)} ${lastName}`;
  return {
    address: `${1 + Math.floor(rand() * 120)}, ${pick(STREETS)}, ${city}`,
    nationality: "Indian",
    father: { name: father, phone: phone(), occupation: pick(OCCUPATIONS), email: `${father.split(" ")[0].toLowerCase()}.${lastName.toLowerCase()}@example.com` },
    mother: { name: mother, phone: phone(), occupation: pick(OCCUPATIONS) },
    emergencyContact: { name: mother, relation: "Mother", phone: phone() },
  };
}

async function reset() {
  const db = mongoose.connection.db;
  await Promise.all([
    School.deleteMany({}),
    Student.deleteMany({}),
    Admission.deleteMany({}),
    Counter.deleteMany({}),
    Attendance.deleteMany({}),
    ExamResult.deleteMany({}),
    FeeInvoice.deleteMany({}),
    AccessShare.deleteMany({}),
    // Demo accounts only; real admins are kept.
    User.deleteMany({ username: { $in: DEMO_USERS.map((u) => u.username) } }),
    db.collection("userPhotos.files").deleteMany({ "metadata.demo": true }),
    db.collection(`${BUCKET}.files`).deleteMany({}),
    db.collection(`${BUCKET}.chunks`).deleteMany({}),
  ]);
}

(async () => {
  if (isProduction && !args.has("--force")) {
    throw new Error("Refusing to seed sample data with NODE_ENV=production (pass --force if this really is a demo database).");
  }
  await connectDatabase(getMongoUri());
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));

  if (args.has("--reset")) await reset();
  else if (await School.exists({})) {
    throw new Error("Schools already exist. Run with --reset to replace all schools, students, admissions and photos.");
  }

  const used = new Set();
  const unique = (gender) => {
    for (;;) {
      const p = person(gender);
      if (!used.has(`${p.firstName} ${p.lastName}`)) {
        used.add(`${p.firstName} ${p.lastName}`);
        return p;
      }
    }
  };

  let studentCount = 0;
  let admissionCount = 0;
  for (const s of SCHOOLS) {
    const school = await schools.createSchool({ ...s, email: `office@${s.code.toLowerCase()}.example.com` });
    const classes = ["LKG", "1", "3", "5", "7", "9", "10", "12"];
    for (const className of classes) {
      for (const section of ["A", "B"].slice(0, rand() < 0.5 ? 1 : 2)) {
        const size = 1 + Math.floor(rand() * 3);
        for (let roll = 1; roll <= size; roll++) {
          const gender = rand() < 0.5 ? "female" : "male";
          const { firstName, lastName } = unique(gender);
          const older = Number(className) >= 9;
          const created = await students.createStudent({
            school: school.id,
            firstName,
            lastName,
            gender,
            dateOfBirth: dob(className),
            bloodGroup: pick(BLOOD),
            ...family(lastName, s.city),
            className,
            section,
            rollNumber: roll,
            academicYear: YEAR,
            admissionDate: new Date(Date.UTC(startYear - Math.floor(rand() * 4), 5, 3)),
            transport: pick(["school_bus", "school_bus", "private", "walking"]),
            ...(older ? { email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.com` } : {}),
            ...(rand() < 0.15 ? { medicalNotes: "Mild asthma; inhaler kept with class teacher." } : {}),
          });
          if (created.transport === "school_bus") {
            await students.updateStudent(created.id, { busRoute: `Route ${1 + Math.floor(rand() * 6)}` });
          }
          // Most students get an avatar photo; a few keep the initials fallback.
          if (rand() < 0.85) {
            const png = await sharp(avatarSvg(`${firstName[0]}${lastName[0]}`, pick(PALETTE))).png().toBuffer();
            await students.setPhoto(created.id, png);
          }
          await addRecords(created.id, school.id, className);
          studentCount++;
        }
      }
    }

    for (const target of ["submitted", "under_review", "documents_required", "approved", "rejected"]) {
      const gender = rand() < 0.5 ? "female" : "male";
      const { firstName, lastName } = unique(gender);
      const className = pick(["LKG", "UKG", "1", "6"]);
      const a = await admissions.createAdmission({
        school: school.id,
        firstName,
        lastName,
        gender,
        dateOfBirth: dob(className),
        classApplied: className,
        academicYear: YEAR,
        previousSchool: className === "6" ? "Town Government School" : undefined,
        ...family(lastName, s.city),
      });
      const path = {
        under_review: ["under_review"],
        documents_required: ["under_review", "documents_required"],
        approved: ["under_review", "approved"],
        rejected: ["under_review", "rejected"],
      }[target] || [];
      for (const status of path) {
        await admissions.updateStatus(a.id, {
          status,
          note: status === "rejected" ? "Class is full for this year" : undefined,
        });
      }
      admissionCount++;
    }
    console.log(`${school.name} (${school.code}) seeded`);
  }
  console.log(`Seeded ${SCHOOLS.length} schools, ${studentCount} students and ${admissionCount} admissions for ${YEAR}.`);

  const password = process.env.SEED_USER_PASSWORD;
  if (!password) {
    console.log("No SEED_USER_PASSWORD set, so no demo accounts were created.");
  } else {
    const schoolsByCode = new Map((await School.find().lean()).map((x) => [x.code, x]));
    const passwordHash = await hashPassword(password);
    for (const u of DEMO_USERS) {
      const sc = schoolsByCode.get(u.school);
      const doc = { username: u.username, name: u.name, role: u.role, passwordHash, grants: u.grants };
      if (u.role === "principal") doc.schools = [sc._id];
      if (u.role === "teacher") doc.assignments = u.classes.map(([className, section]) => ({ school: sc._id, className, ...(section ? { section } : {}) }));
      if (u.role === "parent") {
        const kids = await Student.find({ school: sc._id, deletedAt: null }).sort({ admissionNumber: 1 }).limit(2).select("_id").lean();
        doc.children = kids.map((k) => k._id);
      }
      const created = await User.create(doc);
      const initials = u.name.replace(/^(Dr|Sr|Mr|Ms|Mrs)\.\s*/, "").split(" ").map((w) => w[0]).join("").slice(0, 2);
      const png = await sharp(avatarSvg(initials, u.role === "teacher" ? "#15803d" : u.role === "principal" ? "#0f766e" : "#c2410c")).png().toBuffer();
      await setUserPhoto(created._id, png);
    }
    await mongoose.connection.db.collection("userPhotos.files").updateMany({}, { $set: { "metadata.demo": true } });
    await Session.deleteMany({ user: { $in: (await User.find({ username: { $in: DEMO_USERS.map((u) => u.username) } }).select("_id").lean()).map((x) => x._id) } });
    console.log(`Created demo accounts: ${DEMO_USERS.map((u) => u.username).join(", ")} (password from SEED_USER_PASSWORD).`);
  }
  await disconnectDatabase();
})().catch(async (err) => {
  console.error(err.message);
  await disconnectDatabase().catch(() => {});
  process.exit(1);
});
