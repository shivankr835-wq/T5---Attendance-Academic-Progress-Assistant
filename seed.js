import db from "./db.js";

db.exec(`
DELETE FROM marks;
DELETE FROM attendance;
DELETE FROM courses;
DELETE FROM teachers;
DELETE FROM students;
`);

const names = [
  "Rahul", "Neha", "Aman", "Priya", "Riya",
  "Arjun", "Simran", "Karan", "Ishita", "Rohan",
  "Ananya", "Vivek", "Meera", "Kabir", "Sneha",
  "Dev", "Pooja", "Yash", "Diya", "Varun",
  "Nisha", "Aditya", "Tanya", "Manav", "Aditi"
];

const addStudent = db.prepare(
  "INSERT INTO students VALUES (?, ?, ?, ?, ?)"
);

names.forEach((name, i) => {
  addStudent.run(i + 1, String(i + 1).padStart(3, "0"), name, "BCA", 5);
});

db.exec(`
INSERT INTO teachers VALUES
(1, 'Anita Sharma', 'anita@college.edu'),
(2, 'Raj Mehta', 'raj@college.edu'),
(3, 'Neeraj Verma', 'neeraj@college.edu');

INSERT INTO courses VALUES
(1, 'DBMS', 'DBMS', 1, 30),
(2, 'OS', 'Operating Systems', 2, 30),
(3, 'PY', 'Python', 3, 30),
(4, 'CN', 'Computer Networks', 1, 30);
`);

const attendance = db.prepare(`
INSERT INTO attendance VALUES (?, ?, ?, ?)
`);

const marks = db.prepare(`
INSERT INTO marks VALUES (?, ?, ?, ?, ?)
`);

for (let student = 1; student <= 25; student++) {
  for (let course = 1; course <= 4; course++) {
    for (let day = 1; day <= 20; day++) {
      const date = `2026-09-${String(day).padStart(2, "0")}`;
      const status = (student + course + day) % 4 === 0 ? "A" : "P";

      attendance.run(student, course, date, status);
    }

    marks.run(student, course, "QUIZ", 7, 10);
    marks.run(student, course, "MID", 35, 50);
  }
}

console.log("CampusBuddy sample data created!");