
import { tool } from "langchain";
import { z } from "zod";
import db from "./db.js";

export function makeTools(user) {
    const role = String(user.role || "").toLowerCase();
    const isFaculty = role === "faculty" || role === "teacher";

    // Normalize roll number
    function normalizeRoll(roll) {
        const value = String(roll ?? "").trim();

        if (!value) return "";

        return value.padStart(3, "0");
    }

    // Find student by roll number
    function findStudent(roll) {
        const normalized = normalizeRoll(roll);

        if (!normalized) return null;

        return db.prepare(`
            SELECT *
            FROM students
            WHERE TRIM(roll_no) = ?
               OR CAST(roll_no AS INTEGER) = CAST(? AS INTEGER)
            LIMIT 1
        `).get(normalized, normalized);
    }

    // Find course by subject name or course code
    function findCourse(subject) {
        const value = String(subject ?? "").trim();

        if (!value) return null;

        return db.prepare(`
            SELECT *
            FROM courses
            WHERE LOWER(TRIM(name)) = LOWER(?)
               OR LOWER(TRIM(code)) = LOWER(?)
            LIMIT 1
        `).get(value, value);
    }

    // Check record access permissions
    function allowed(roll) {
        if (isFaculty) return true;

        const loggedInRoll = normalizeRoll(
            user.roll_no ?? user.roll
        );

        const requestedRoll = normalizeRoll(roll);

        return Boolean(
            loggedInRoll &&
            requestedRoll &&
            loggedInRoll === requestedRoll
        );
    }

    // Check faculty course permissions
    function canTeach(course) {
        if (!isFaculty) return false;

        if (user.teacherId != null) {
            return String(user.teacherId) ===
                String(course.teacher_id);
        }

        return true;
    }

    // Get attendance totals
    function getAttendanceData(student, course) {
        return db.prepare(`
            SELECT
                COUNT(*) AS total,
                COALESCE(
                    SUM(CASE WHEN status = 'P' THEN 1 ELSE 0 END),
                    0
                ) AS present
            FROM attendance
            WHERE student_id = ?
              AND course_id = ?
        `).get(student.id, course.id);
    }

    // =========================================
    // 1. GET ATTENDANCE
    // =========================================

    const getAttendance = tool(
        async ({ roll, subject }) => {
            if (!roll || !String(roll).trim()) {
                return "Please provide the student's roll number, for example 003.";
            }

            if (!subject || !String(subject).trim()) {
                return "Please provide the subject name, for example Python.";
            }

            if (!allowed(roll)) {
                return "Access denied. Students can only view their own attendance.";
            }

            const s = findStudent(roll);

            if (!s) {
                return `Student with roll number ${roll} was not found.`;
            }

            const c = findCourse(subject);

            if (!c) {
                const courses = db.prepare(`
                    SELECT name, code
                    FROM courses
                    ORDER BY name
                `).all();

                if (courses.length === 0) {
                    return "No courses are available in the database.";
                }

                return "Subject not found. Available subjects: " +
                    courses.map(x => `${x.name} (${x.code})`).join(", ");
            }

            if (isFaculty && !canTeach(c)) {
                return "You are not authorized to access this course.";
            }

            const data = getAttendanceData(s, c);
            const total = Number(data.total || 0);
            const present = Number(data.present || 0);
            const absent = total - present;

            if (total === 0) {
                return `No attendance records found for ${s.name}, roll ${s.roll_no}, in ${c.name}.`;
            }

            const percentage = (present / total) * 100;

            return `
Attendance Report
Student: ${s.name}
Roll Number: ${s.roll_no}
Subject: ${c.name}
Classes Held: ${total}
Classes Attended: ${present}
Classes Absent: ${absent}
Attendance Percentage: ${percentage.toFixed(2)}%
            `.trim();
        },
        {
            name: "get_attendance_percentage",
            description: `
Get attendance for a student and subject.

For faculty:
- Use the roll number explicitly requested by the user.
- Example: "Show attendance of roll number 003" means roll="003".
- If the assistant asks for a subject and the user replies "Python",
  preserve the previously requested roll number "003".
- Never use roll="000" or an empty roll number.

For students:
- Use the logged-in student's own roll number.
`,
            schema: z.object({
                roll: z.string().describe(
                    "Student roll number, for example 003"
                ),
                subject: z.string().describe(
                    "Subject name or course code, for example Python"
                )
            })
        }
    );

    // =========================================
    // 2. GET FEE STATUS
    // =========================================

    const getFeeStatus = tool(
        async ({ roll }) => {
            if (!roll || !String(roll).trim()) {
                return "Please provide the student's roll number.";
            }

            if (!allowed(roll)) {
                return "Access denied. Students can only view their own fee status.";
            }

            const s = findStudent(roll);

            if (!s) {
                return `Student with roll number ${roll} was not found.`;
            }

            const table = db.prepare(`
                SELECT name
                FROM sqlite_master
                WHERE type = 'table'
                  AND LOWER(name) = 'fees'
            `).get();

            if (!table) {
                return "The fees table does not exist. Please create it using schema.sql.";
            }

            const fee = db.prepare(`
                SELECT
                    total_fees,
                    paid_amount,
                    total_fees - paid_amount AS pending_amount,
                    payment_date
                FROM fees
                WHERE student_id = ?
                ORDER BY id DESC
                LIMIT 1
            `).get(s.id);

            if (!fee) {
                return `No fee record found for ${s.name} (Roll ${s.roll_no}). Please add a fee record to the database.`;
            }

            const total = Number(fee.total_fees);
            const paid = Number(fee.paid_amount);
            const pending = total - paid;

            let status = "Pending";

            if (paid >= total) {
                status = "Paid";
            } else if (paid > 0) {
                status = "Partial";
            }

            return `
Fee Status
Student: ${s.name}
Roll Number: ${s.roll_no}
Total Fees: ₹${total.toLocaleString("en-IN")}
Paid Amount: ₹${paid.toLocaleString("en-IN")}
Pending Amount: ₹${pending.toLocaleString("en-IN")}
Status: ${status}
Payment Date: ${fee.payment_date || "Not available"}
            `.trim();
        },
        {
            name: "get_fee_status",
            description: `
Get fee status from the database.
Faculty should use the roll number requested by the user.
Students can only view their own fee status.
Never invent fee records or payment information.
`,
            schema: z.object({
                roll: z.string().describe("Student roll number")
            })
        }
    );

    // =========================================
    // 3. CLASSES NEEDED FOR 75% ATTENDANCE
    // =========================================

    const classesNeeded = tool(
        async ({ roll, subject }) => {
            if (!roll || !String(roll).trim()) {
                return "Please provide the student's roll number.";
            }

            if (!allowed(roll)) {
                return "Access denied.";
            }

            const s = findStudent(roll);

            if (!s) {
                return `Student with roll number ${roll} was not found.`;
            }

            const c = findCourse(subject);

            if (!c) {
                return "Course not found. Please check the subject name.";
            }

            if (isFaculty && !canTeach(c)) {
                return "You are not authorized to access this course.";
            }

            const data = getAttendanceData(s, c);
            const total = Number(data.total || 0);
            const present = Number(data.present || 0);

            if (total === 0) {
                return `No attendance records found for ${s.name} in ${c.name}.`;
            }

            const percentage = (present / total) * 100;

            if (percentage >= 75) {
                return `${s.name}'s attendance in ${c.name} is ${percentage.toFixed(2)}%. The student has reached 75%.`;
            }

            const needed = Math.ceil(
                (0.75 * total - present) / 0.25
            );

            const remaining = Math.max(
                0,
                Number(c.total_classes || 0) - total
            );

            if (needed > remaining) {
                return `Current attendance is ${percentage.toFixed(2)}%. Reaching 75% may not be possible within the remaining scheduled classes.`;
            }

            return `${s.name}'s current attendance in ${c.name} is ${percentage.toFixed(2)}%. The student must attend the next ${needed} classes without absence to reach at least 75%.`;
        },
        {
            name: "classes_needed_for_target",
            description: "Calculate how many more classes a student needs to attend to reach 75% attendance.",
            schema: z.object({
                roll: z.string().describe("Student roll number"),
                subject: z.string().describe("Subject name or course code")
            })
        }
    );

    // =========================================
    // 4. STUDENTS BELOW 75% ATTENDANCE
    // =========================================

    const shortage = tool(
        async ({ subject }) => {
            if (!isFaculty) {
                return "Only faculty can view attendance shortage reports.";
            }

            const c = findCourse(subject);

            if (!c) {
                return "Course not found. Please check the subject name.";
            }

            if (!canTeach(c)) {
                return "You are not authorized to access this course.";
            }

            const results = db.prepare(`
                SELECT
                    s.roll_no,
                    s.name,
                    COUNT(a.class_date) AS total_classes,
                    SUM(
                        CASE WHEN a.status = 'P' THEN 1 ELSE 0 END
                    ) AS classes_attended,
                    ROUND(
                        100.0 * SUM(
                            CASE WHEN a.status = 'P' THEN 1 ELSE 0 END
                        ) / COUNT(*),
                        2
                    ) AS percentage
                FROM students s
                JOIN attendance a ON a.student_id = s.id
                WHERE a.course_id = ?
                GROUP BY s.id, s.roll_no, s.name
                HAVING percentage < 75
                ORDER BY percentage ASC
            `).all(c.id);

            if (results.length === 0) {
                return `No students below 75% attendance were found in ${c.name}.`;
            }

            return JSON.stringify(results, null, 2);
        },
        {
            name: "list_shortage_students",
            description: "List students with attendance below 75% in a course. Faculty only.",
            schema: z.object({
                subject: z.string().describe("Subject name or course code")
            })
        }
    );

    // =========================================
    // 5. STUDENT MARKS / REPORT CARD
    // =========================================

    const report = tool(
        async ({ roll }) => {
            if (!roll || !String(roll).trim()) {
                return "Please provide the student's roll number.";
            }

            if (!allowed(roll)) {
                return "Access denied. Students can only view their own marks.";
            }

            const s = findStudent(roll);

            if (!s) {
                return `Student with roll number ${roll} was not found.`;
            }

            const marks = db.prepare(`
                SELECT
                    c.name AS subject,
                    m.exam_type,
                    m.score,
                    m.max_score
                FROM marks m
                JOIN courses c ON c.id = m.course_id
                WHERE m.student_id = ?
                ORDER BY c.name, m.exam_type
            `).all(s.id);

            if (marks.length === 0) {
                return `No marks records found for ${s.name}.`;
            }

            const formatted = marks.map(item => ({
                subject: item.subject,
                exam: item.exam_type,
                marks_obtained: item.score,
                maximum_marks: item.max_score,
                percentage: Number(item.max_score) > 0
                    ? `${(
                        Number(item.score) /
                        Number(item.max_score) *
                        100
                    ).toFixed(2)}%`
                    : "0.00%"
            }));

            return `Marks Report for ${s.name} (Roll ${s.roll_no})\n` +
                JSON.stringify(formatted, null, 2);
        },
        {
            name: "get_report_card",
            description: `
Get a student's marks and report card from the database.
Faculty should use the roll number requested by the user.
Students can only view their own marks.
Never substitute an empty roll number or 000.
`,
            schema: z.object({
                roll: z.string().describe("Student roll number")
            })
        }
    );

    return [
        getAttendance,
        getFeeStatus,
        classesNeeded,
        shortage,
        report
    ];
}


