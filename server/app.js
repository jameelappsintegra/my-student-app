const express = require("express");
const mongoose = require("mongoose");
const { MongoClient } = require("mongodb");
const app = express();
const Student = require("./models/student");
require("dotenv/config");

const uri =
  "mongodb+srv://jameel1234:jameel1234@cluster0.yvees.mongodb.net/student_manager?retryWrites=true&w=majority";

mongoose
  .connect(uri, { useNewUrlParser: true, useUnifiedTopology: true })
  .then((result) => app.listen(5000))
  .catch((err) => console.log(err));

app.get("/add-student", (req, res) => {
  const student = new Student({
    name: "John",
    dateOfBirth: "14-01-1986",
    admissionDate: "04-01-2009",
    fatherName: "Einstin",
    motherName: "Neils",
    address: "Parangipettai",
    class: "4",
    section: "B",
    incharge: "Kennady",
  });
  student
    .save()
    .then((result) => {
      res.send(result);
    })
    .catch((err) => {
      console.log(err);
    });
});

app.get("/all-students", (req, res) => {
  Student.find()
    .then((result) => {
      res.send(result);
    })
    .catch((err) => {
      console.log(err);
    });
});

app.get("/single-student", (req, res) => {
  Student.findById("62dca2f3f4187e634842a449")
    .then((result) => {
      res.send(result);
    })
    .catch((err) => {
      console.log(err);
    });
});

app.use((req, res, next) => {
  console.log("New req made");
  console.log("host", req.hostname);
  console.log("path", req.path);
  console.log("method", req.method);
  next();
});

app.listen(4000);
