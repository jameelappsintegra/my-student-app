const router = require("express").Router();
const { z } = require("zod");
const { validate } = require("../middleware/validate");
const { objectId, classCode } = require("../validators/common");
const { attendanceDate, markAttendance } = require("../validators/records");
const register = require("../services/registerService");
const h = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/response");
const ApiError = require("../utils/ApiError");
const { canTeach } = require("../middleware/authorize");

// Teachers may open and save only the classes assigned to them.
const assigned = (source) => (req, _res, next) =>
  canTeach(req.user, req.valid[source]) ? next() : next(new ApiError(403, "You are not assigned to this class."));

const section = z.string().trim().regex(/^[A-Za-z]{1,5}$/, "Section must be letters, e.g. A");
const where = { school: objectId, className: classCode, section: section.optional(), date: attendanceDate };

router.get("/register", validate(z.object(where).strict(), "query"), assigned("query"), h(async (req, res) => {
  sendSuccess(res, { message: "Register", data: await register.getRegister(req.valid.query) });
}));

router.put(
  "/register",
  validate(
    z
      .object({
        ...where,
        entries: z
          .array(z.object({ student: objectId, status: markAttendance.shape.status, note: markAttendance.shape.note }).strict())
          .min(1, "Mark at least one student")
          .max(200),
      })
      .strict()
  ),
  assigned("body"),
  h(async (req, res) => {
    const data = await register.saveRegister(req.valid.body);
    req.log.info({ event: "attendance.register", school: req.valid.body.school, className: req.valid.body.className, section: req.valid.body.section, date: data.date, saved: data.saved }, "Register saved");
    sendSuccess(res, { message: `Attendance saved for ${data.saved} students`, data });
  })
);

module.exports = router;
