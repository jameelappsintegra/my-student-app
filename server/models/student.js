const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const studentSchema = new Schema(
  {
    studentName: {
      type: String,
      required: true,
    },
    dateOfBirth: {
      type: String,
      required: false,
    },
    admissionDate: {
      type: String,
      required: false,
    },
    fatherName: {
      type: String,
      required: true,
    },
    motherName: {
      type: String,
      required: true,
    },
    address: {
      type: String,
      required: true,
    },
    class: {
      type: String,
      required: false,
    },
    section: {
      type: String,
      required: true,
    },
    incharge: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

const Student = mongoose.model("student", studentSchema);
module.exports = Student;
