// School bus routes, stops and which students ride them.
const router = require("express").Router();
const { z } = require("zod");
const TransportRoute = require("../models/TransportRoute");
const Student = require("../models/Student");
const { validate, validateId } = require("../middleware/validate");
const { requirePermission: perm, isFamily } = require("../middleware/authorize");
const { objectId, optionalText, phone } = require("../validators/common");
const { assertSchool, schoolFilter } = require("../services/schoolAccess");
const { notify, parentsOf } = require("../services/notificationService");
const ApiError = require("../utils/ApiError");
const h = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/response");
const { toPublic } = require("../utils/serialize");

const time = z.preprocess((v) => (v === "" ? undefined : v), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 07:30").optional());
const stop = z.object({ name: z.string().trim().min(1, "Name the stop").max(80), pickupTime: time, dropTime: time, fee: z.coerce.number().min(0).max(1000000).optional() }).strict();
const routeBody = z.object({
  school: objectId,
  name: z.string().trim().min(1, "Name the route").max(60),
  vehicleNumber: optionalText(20),
  driverName: optionalText(80),
  driverPhone: phone,
  attendantName: optionalText(80),
  attendantPhone: phone,
  capacity: z.coerce.number().int().min(1, "Capacity must be at least 1").max(200),
  stops: z.array(stop).min(1, "Add at least one stop").max(40),
  active: z.boolean().optional(),
}).strict().superRefine((d, ctx) => {
  const names = d.stops.map((s) => s.name.toLowerCase());
  if (new Set(names).size !== names.length) ctx.addIssue({ code: "custom", path: ["stops"], message: "Each stop needs a different name" });
});

router.use((req, _res, next) => (isFamily(req.user) ? next(new ApiError(403, "You don't have permission to do that.")) : next()));

const riderCounts = async (ids) => {
  const rows = await Student.aggregate([{ $match: { transportRoute: { $in: ids }, deletedAt: null, status: "active" } }, { $group: { _id: "$transportRoute", n: { $sum: 1 } } }]);
  return new Map(rows.map((r) => [String(r._id), r.n]));
};

router.get("/routes", validate(z.object({ school: objectId.optional() }).strict(), "query"), h(async (req, res) => {
  const rows = await TransportRoute.find(schoolFilter(req.user, req.valid.query.school)).sort({ name: 1 }).populate("school", "name code").lean();
  const counts = await riderCounts(rows.map((r) => r._id));
  sendSuccess(res, { message: "Routes", data: rows.map((r) => ({ ...toPublic(r), school: { id: String(r.school._id), name: r.school.name, code: r.school.code }, riders: counts.get(String(r._id)) || 0 })) });
}));

router.post("/routes", perm("transport.manage"), validate(routeBody), h(async (req, res) => {
  assertSchool(req.user, req.valid.body.school);
  try {
    const r = await TransportRoute.create(req.valid.body);
    req.log.info({ event: "transport.route.create", routeId: r.id }, "Route created");
    sendSuccess(res, { status: 201, message: `${r.name} added`, data: r });
  } catch (err) {
    if (err.code === 11000) throw ApiError.conflict("This school already has a route with that name.");
    throw err;
  }
}));

const loadRoute = async (user, id) => {
  const r = await TransportRoute.findById(id);
  if (!r) throw ApiError.notFound("Route not found");
  assertSchool(user, r.school, "route");
  return r;
};

router.put("/routes/:id", validateId, perm("transport.manage"), validate(routeBody), h(async (req, res) => {
  const r = await loadRoute(req.user, req.params.id);
  if (String(req.valid.body.school) !== String(r.school)) throw ApiError.badRequest("A route can't move to another school.");
  const riders = await Student.find({ transportRoute: r._id, deletedAt: null, status: "active" }).select("transportStop").lean();
  if (req.valid.body.capacity < riders.length) throw ApiError.badRequest(`${riders.length} students ride this route; capacity can't be lower.`);
  const stops = new Set(req.valid.body.stops.map((s) => s.name));
  const orphaned = riders.filter((x) => !stops.has(x.transportStop)).length;
  if (orphaned) throw ApiError.badRequest(`${orphaned} students board at a stop you removed. Move them first.`);
  r.set(req.valid.body);
  await r.save();
  req.log.info({ event: "transport.route.update", routeId: r.id }, "Route updated");
  sendSuccess(res, { message: `${r.name} updated`, data: r });
}));

router.delete("/routes/:id", validateId, perm("transport.manage"), h(async (req, res) => {
  const r = await loadRoute(req.user, req.params.id);
  const n = await Student.countDocuments({ transportRoute: r._id, deletedAt: null });
  if (n) throw ApiError.conflict(`${n} students are assigned to this route. Move them first.`);
  await r.deleteOne();
  req.log.info({ event: "transport.route.delete", routeId: req.params.id }, "Route deleted");
  sendSuccess(res, { message: "Route deleted" });
}));

// Riders by stop, with a parent phone for the driver's list.
router.get("/routes/:id/riders", validateId, h(async (req, res) => {
  const r = await loadRoute(req.user, req.params.id);
  const kids = await Student.find({ transportRoute: r._id, deletedAt: null, status: "active" })
    .select("firstName lastName className section rollNumber transportStop father.phone mother.phone guardian.phone admissionNumber").lean();
  const order = new Map(r.stops.map((s, i) => [s.name, i]));
  kids.sort((a, b) => (order.get(a.transportStop) ?? 99) - (order.get(b.transportStop) ?? 99) || a.firstName.localeCompare(b.firstName));
  sendSuccess(res, {
    message: "Riders",
    data: {
      route: r,
      riders: kids.map((k) => ({ id: String(k._id), name: `${k.firstName} ${k.lastName}`, admissionNumber: k.admissionNumber, className: k.className, section: k.section, stop: k.transportStop, contact: k.father?.phone || k.mother?.phone || k.guardian?.phone || null })),
    },
  });
}));

// Put a student on a route (or take them off with route: null).
router.put("/assign", perm("transport.manage"), validate(z.object({ student: objectId, route: objectId.nullable(), stop: optionalText(80) }).strict()), h(async (req, res) => {
  const b = req.valid.body;
  const student = await Student.findOne({ _id: b.student, deletedAt: null });
  if (!student) throw ApiError.notFound("Student not found");
  assertSchool(req.user, student.school, "student");
  if (b.route === null) {
    student.set({ transportRoute: undefined, transportStop: undefined, busRoute: undefined, ...(student.transport === "school_bus" ? { transport: undefined } : {}) });
    await student.save();
    req.log.info({ event: "transport.unassign", studentId: b.student }, "Taken off route");
    return sendSuccess(res, { message: `${student.firstName} no longer uses the school bus.` });
  }
  const r = await loadRoute(req.user, b.route);
  if (String(r.school) !== String(student.school)) throw ApiError.badRequest("The route belongs to another school.");
  if (!r.active) throw ApiError.badRequest("This route isn't running.");
  const stopRow = r.stops.find((s) => s.name === b.stop);
  if (!stopRow) throw ApiError.badRequest("Choose one of the route's stops.");
  if (String(student.transportRoute) !== String(r._id)) {
    const n = await Student.countDocuments({ transportRoute: r._id, deletedAt: null, status: "active" });
    if (n >= r.capacity) throw ApiError.conflict(`${r.name} is full (${r.capacity} seats).`);
  }
  student.set({ transportRoute: r._id, transportStop: stopRow.name, transport: "school_bus", busRoute: r.name });
  await student.save();
  const family = await parentsOf([student._id]);
  await notify(family.map((u) => u._id), { type: "transport", title: `Bus: ${r.name}`, body: `${student.firstName} boards at ${stopRow.name}${stopRow.pickupTime ? ` at ${stopRow.pickupTime}` : ""}.`, link: `/students/${student.id}?tab=services` });
  req.log.info({ event: "transport.assign", studentId: b.student, routeId: String(r._id), stop: stopRow.name }, "Assigned to route");
  sendSuccess(res, { message: `${student.firstName} assigned to ${r.name}, ${stopRow.name}.` });
}));

module.exports = router;
