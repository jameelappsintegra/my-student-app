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
const ExamResultModel = require("../src/models/ExamResult");
const Announcement = require("../src/models/Announcement");
const Homework = require("../src/models/Homework");
const TimetableEntry = require("../src/models/TimetableEntry");
const LeaveRequest = require("../src/models/LeaveRequest");
const Notification = require("../src/models/Notification");
const User = require("../src/models/User");
const Session = require("../src/models/Session");
const AccessShare = require("../src/models/AccessShare");
const HomeworkSubmission = require("../src/models/HomeworkSubmission");
const TransportRoute = require("../src/models/TransportRoute");
const Book = require("../src/models/Book");
const BookIssue = require("../src/models/BookIssue");
const Certificate = require("../src/models/Certificate");
const BookReservation = require("../src/models/BookReservation");
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
  { username: "teacher.gvps", name: "Meera Krishnan", role: "teacher", school: "GVPS", classes: [["7", "A"], ["7", "B"], ["5", null]], grants: ["students.import", "library.manage"] },
  { username: "principal.smms", name: "Sr. Agnes Joseph", role: "principal", school: "SMMS" },
  { username: "teacher.smms", name: "Ravi Fernandes", role: "teacher", school: "SMMS", classes: [["5", null], ["9", null]] },
  { username: "parent.demo", name: "Imran Rahman", role: "parent", school: "GVPS" },
  // Linked to the first student of GVPS class 7 A (also parent.demo's child).
  { username: "student.gvps", name: "", role: "student", school: "GVPS" },
  { username: "librarian.gvps", name: "Saraswathi Iyer", role: "librarian", school: "GVPS" },
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
    Announcement.deleteMany({}),
    Homework.deleteMany({}),
    TimetableEntry.deleteMany({}),
    LeaveRequest.deleteMany({}),
    Notification.deleteMany({}),
    HomeworkSubmission.deleteMany({}),
    TransportRoute.deleteMany({}),
    Book.deleteMany({}),
    BookIssue.deleteMany({}),
    Certificate.deleteMany({}),
    BookReservation.deleteMany({}),
    // Demo accounts only; real admins are kept.
    User.deleteMany({ username: { $in: DEMO_USERS.map((u) => u.username) } }),
    db.collection("userPhotos.files").deleteMany({ "metadata.demo": true }),
    db.collection(`${BUCKET}.files`).deleteMany({}),
    db.collection(`${BUCKET}.chunks`).deleteMany({}),
  ]);
}

// School settings, homework submissions, buses, library and certificates.
async function seedCampus({ users, gvps, smms, day }) {
  const ay = (m, d) => new Date(Date.UTC(m >= 4 ? startYear : startYear + 1, m - 1, d));
  await School.updateOne({ _id: gvps._id }, { $set: { settings: {
    terms: [{ name: "Term 1", start: ay(4, 1), end: ay(9, 30) }, { name: "Term 2", start: ay(10, 1), end: ay(3, 31) }],
    holidays: [
      { date: ay(8, 15), name: "Independence Day" }, { date: ay(10, 2), name: "Gandhi Jayanti" }, { date: ay(12, 25), name: "Christmas" },
      { date: ay(1, 14), name: "Pongal" }, { date: ay(1, 26), name: "Republic Day" }, { date: day(12), name: "School foundation day" },
    ],
    library: { finePerDay: 2, loanDays: 14, maxBooks: 3 },
  } } });
  // St. Mary's: a different grading scale, pass mark and a five-day week.
  await School.updateOne({ _id: smms._id }, { $set: { settings: {
    weeklyOffs: [0, 6], passPercentage: 35,
    gradingScale: [{ min: 90, grade: "A+", remark: "Outstanding" }, { min: 75, grade: "A", remark: "Very good" }, { min: 60, grade: "B", remark: "Good" }, { min: 45, grade: "C", remark: "Fair" }, { min: 35, grade: "D", remark: "Pass" }, { min: 0, grade: "F", remark: "Fail" }],
    holidays: [{ date: ay(12, 25), name: "Christmas" }, { date: ay(1, 1), name: "New Year" }],
    library: { finePerDay: 5, loanDays: 7, maxBooks: 2 },
    homework: { allowLate: false },
  } } });

  // student.gvps handed in the overdue Science homework; the teacher marked it.
  const student = users.get("student.gvps");
  const sci = await Homework.findOne({ school: gvps._id, title: /renewable/ }).lean();
  await HomeworkSubmission.create({ homework: sci._id, student: student.student, school: gvps._id, text: "Solar, wind, hydro, biomass and geothermal energy.", submittedBy: student._id, submittedAt: day(-2), status: "graded", marks: 5, feedback: "All correct. Well done!", gradedBy: users.get("teacher.gvps")._id, gradedAt: day(-1) });

  // Buses.
  const routes = await TransportRoute.create([
    { school: gvps._id, name: "Route 1 – Beach Road", vehicleNumber: "TN-31-AB-1201", driverName: "Murugan S", driverPhone: "9443012345", attendantName: "Selvi R", attendantPhone: "9443067890", capacity: 30,
      stops: [{ name: "Harbour Lane", pickupTime: "07:20", dropTime: "16:10", fee: 3500 }, { name: "Market Street", pickupTime: "07:35", dropTime: "15:55", fee: 3000 }, { name: "Temple Road", pickupTime: "07:45", dropTime: "15:45", fee: 2500 }] },
    { school: gvps._id, name: "Route 2 – Station Road", vehicleNumber: "TN-31-AB-1202", driverName: "Joseph A", driverPhone: "9443023456", capacity: 25,
      stops: [{ name: "Railway Station", pickupTime: "07:15", dropTime: "16:15", fee: 3500 }, { name: "Gandhi Nagar", pickupTime: "07:30", dropTime: "16:00", fee: 3000 }] },
    { school: smms._id, name: "Chidambaram Town", vehicleNumber: "TN-31-CD-0420", driverName: "Ramesh K", driverPhone: "9443034567", capacity: 20,
      stops: [{ name: "East Car Street", pickupTime: "07:40", dropTime: "15:40", fee: 2800 }, { name: "Bus Stand", pickupTime: "07:55", dropTime: "15:25", fee: 2400 }] },
  ]);
  for (const r of routes) {
    const kids = await Student.find({ school: r.school, deletedAt: null, status: "active" }).sort({ admissionNumber: r.name.includes("2") ? -1 : 1 }).limit(r.school.equals(gvps._id) ? 5 : 4).lean();
    for (const [i, k] of kids.entries()) {
      if (k.transportRoute) continue;
      const stop = r.stops[i % r.stops.length];
      await Student.updateOne({ _id: k._id }, { $set: { transportRoute: r._id, transportStop: stop.name, transport: "school_bus", busRoute: r.name } });
    }
  }

  // Library.
  const titles = [
    ["Wings of Fire", "A. P. J. Abdul Kalam", "Biography", "978-8173711466"], ["Malgudi Days", "R. K. Narayan", "Fiction", "978-0143039655"],
    ["The Story of My Experiments with Truth", "M. K. Gandhi", "Biography"], ["Panchatantra Stories", "Vishnu Sharma", "Stories"],
    ["Ponniyin Selvan (Part 1)", "Kalki Krishnamurthy", "Tamil literature"], ["A Brief History of Time", "Stephen Hawking", "Science"],
    ["The Jungle Book", "Rudyard Kipling", "Fiction"], ["Thirukkural", "Thiruvalluvar", "Tamil literature"],
    ["Charlotte's Web", "E. B. White", "Fiction"], ["NCERT Science Class 7", "NCERT", "Textbook"], ["Oxford Student Atlas", "Oxford", "Reference"],
  ];
  for (const sc of [gvps, smms]) {
    const books = await Book.insertMany(titles.map(([title, author, category, isbn], i) => ({ school: sc._id, title, author, category, ...(isbn ? { isbn } : {}), shelf: `${String.fromCharCode(65 + (i % 4))}-${1 + (i % 3)}`, copies: 1 + (i % 3) })));
    const kids = await Student.find({ school: sc._id, deletedAt: null, status: "active" }).sort({ rollNumber: 1, admissionNumber: 1 }).limit(4).lean();
    const loans = [
      { book: books[0], kid: kids[0], issued: -5, due: 9 },
      { book: books[1], kid: kids[1], issued: -20, due: -6 }, // overdue
      { book: books[6], kid: kids[2], issued: -30, due: -16, returned: -10, fine: 12, fineStatus: "due" },
      { book: books[3], kid: kids[3], issued: -12, due: 2 },
    ].filter((l) => l.kid);
    for (const l of loans) {
      await BookIssue.create({ school: sc._id, book: l.book._id, student: l.kid._id, issuedAt: day(l.issued), dueAt: day(l.due), ...(l.returned ? { returnedAt: day(l.returned), fine: l.fine, fineStatus: l.fineStatus } : {}) });
      if (!l.returned) await Book.updateOne({ _id: l.book._id }, { $inc: { issued: 1 } });
    }
  }

  // The demo student is waiting for a book that's out (GVPS).
  const me = users.get("student.gvps");
  const full = await Book.findOne({ school: gvps._id, $expr: { $gte: ["$issued", "$copies"] } }).lean();
  const holder = full && (await BookIssue.findOne({ book: full._id, returnedAt: null }).lean());
  if (full && String(holder?.student) !== String(me.student)) {
    await BookReservation.create({ school: gvps._id, book: full._id, student: me.student, requestedBy: me._id });
  }

  // A bonafide certificate for the demo student.
  const k = await Student.findById(student.student).lean();
  const seq = await Counter.next(`cert:GVPS:BC:${now.getUTCFullYear()}`);
  await Certificate.create({
    school: gvps._id, student: k._id, type: "bonafide", serialNumber: `GVPS/BC/${now.getUTCFullYear()}/${String(seq).padStart(4, "0")}`,
    verificationCode: require("crypto").randomBytes(8).toString("hex").slice(0, 12).toUpperCase(),
    issuedAt: day(-3), issuedBy: users.get("principal.gvps")._id, purpose: "opening a student bank account",
    snapshot: { name: [k.firstName, k.middleName, k.lastName].filter(Boolean).join(" "), admissionNumber: k.admissionNumber, dateOfBirth: k.dateOfBirth, gender: k.gender, nationality: k.nationality, father: k.father?.name, mother: k.mother?.name, className: k.className, section: k.section, rollNumber: k.rollNumber, academicYear: k.academicYear, admissionDate: k.admissionDate, address: k.address },
  });
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
  // Term 1 results are published; Mid-term stays as a draft so publishing
  // can be tried.
  await ExamResultModel.updateMany({ exam: "Term 1" }, { $set: { status: "published", publishedAt: new Date() } });
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
      if (u.role === "principal" || u.role === "librarian") doc.schools = [sc._id];
      if (u.role === "teacher") doc.assignments = u.classes.map(([className, section]) => ({ school: sc._id, className, ...(section ? { section } : {}) }));
      const first7A = await Student.findOne({ school: sc._id, className: "7", section: "A", deletedAt: null }).sort({ rollNumber: 1 }).lean();
      if (u.role === "parent") {
        const kids = await Student.find({ school: sc._id, deletedAt: null, _id: { $ne: first7A?._id } }).sort({ admissionNumber: 1 }).limit(1).select("_id").lean();
        doc.children = [first7A?._id, ...kids.map((k) => k._id)].filter(Boolean);
      }
      if (u.role === "student") {
        doc.student = first7A._id;
        doc.name = `${first7A.firstName} ${first7A.lastName}`;
        u.name = doc.name;
      }
      const created = await User.create(doc);
      const initials = u.name.replace(/^(Dr|Sr|Mr|Ms|Mrs)\.\s*/, "").split(" ").map((w) => w[0]).join("").slice(0, 2);
      const png = await sharp(avatarSvg(initials, u.role === "teacher" ? "#15803d" : u.role === "principal" ? "#0f766e" : u.role === "student" ? "#7c3aed" : u.role === "librarian" ? "#a16207" : "#c2410c")).png().toBuffer();
      await setUserPhoto(created._id, png);
    }
    await mongoose.connection.db.collection("userPhotos.files").updateMany({}, { $set: { "metadata.demo": true } });
    await Session.deleteMany({ user: { $in: (await User.find({ username: { $in: DEMO_USERS.map((u) => u.username) } }).select("_id").lean()).map((x) => x._id) } });
    // Announcements, homework, timetable and a pending leave request.
    const users = new Map((await User.find({ username: { $in: DEMO_USERS.map((u) => u.username) } }).lean()).map((u) => [u.username, u]));
    const gvps = schoolsByCode.get("GVPS");
    const smms = schoolsByCode.get("SMMS");
    const day = (offset) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset));
    await Announcement.create([
      { title: "Annual sports day", body: "Sports day is on the main ground. Students wear house colours; parents are welcome from 9 am.", school: gvps._id, eventDate: day(10), pinned: true, author: users.get("principal.gvps")._id },
      { title: "Parent–teacher meeting", body: "Meet your child's class teacher on Saturday between 10 am and 1 pm.", school: smms._id, audience: "parents", eventDate: day(4), author: users.get("principal.smms")._id },
      { title: "Staff meeting", body: "All teachers in the staff room at 3:30 pm.", school: gvps._id, audience: "staff", author: users.get("principal.gvps")._id },
    ]);
    await Homework.create([
      { school: gvps._id, className: "7", section: "A", subject: "Mathematics", title: "Exercise 5.3, questions 1–10", details: "Show all working in your notebook.", dueDate: day(2), author: users.get("teacher.gvps")._id },
      { school: gvps._id, className: "7", section: "A", subject: "English", title: "Write a paragraph: My favourite festival", details: "About 150 words. Type it here or share a Google Doc link.", dueDate: day(4), onlineSubmission: true, maxMarks: 10, author: users.get("teacher.gvps")._id },
      { school: gvps._id, className: "7", section: "A", subject: "Science", title: "List five sources of renewable energy", dueDate: day(-1), onlineSubmission: true, maxMarks: 5, author: users.get("teacher.gvps")._id },
      { school: gvps._id, className: "7", section: "B", subject: "Science", title: "Draw and label a plant cell", dueDate: day(3), author: users.get("teacher.gvps")._id },
      { school: gvps._id, className: "LKG", subject: "Rhymes & Activity", title: "Learn the rhyme 'Twinkle Twinkle'", dueDate: day(1), author: users.get("principal.gvps")._id },
    ]);
    const tt = [];
    const plan = { 1: ["English", "Mathematics", "Science", "Tamil", "Social Science", "Computer"], 2: ["Mathematics", "English", "Tamil", "Science", "Games", "Social Science"] };
    for (const [section, rows] of [["A", plan[1]], ["B", plan[2]]]) {
      for (let d = 1; d <= 5; d++) {
        rows.forEach((subject, i) => {
          const period = ((i + d - 1) % 6) + 1;
          const teach = section === "A" && subject === "Mathematics" ? users.get("teacher.gvps")._id : undefined;
          tt.push({ school: gvps._id, className: "7", section, day: d, period, subject, ...(teach ? { teacher: teach } : {}), room: `7${section}` });
        });
      }
    }
    await TimetableEntry.insertMany(tt);
    const parent = users.get("parent.demo");
    if (parent.children?.length) {
      await LeaveRequest.create({ student: parent.children[0], school: gvps._id, from: day(3), to: day(4), reason: "Family wedding out of town", requestedBy: parent._id });
    }
    await seedCampus({ users, gvps, smms, day });
    console.log(`Created demo accounts: ${DEMO_USERS.map((u) => u.username).join(", ")} (password from SEED_USER_PASSWORD).`);
  }
  await disconnectDatabase();
})().catch(async (err) => {
  console.error(err.message);
  await disconnectDatabase().catch(() => {});
  process.exit(1);
});
