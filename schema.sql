-- ==========================================
-- CAMPUSBUDDY DATABASE SCHEMA
-- ==========================================

PRAGMA foreign_keys = ON;

-- ==========================================
-- 1. STUDENTS TABLE
-- ==========================================

CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY,
    roll_no TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    department TEXT,
    semester INTEGER
);

-- ==========================================
-- 2. TEACHERS TABLE
-- ==========================================

CREATE TABLE IF NOT EXISTS teachers (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE
);

-- ==========================================
-- 3. COURSES TABLE
-- ==========================================

CREATE TABLE IF NOT EXISTS courses (
    id INTEGER PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    teacher_id INTEGER,
    total_classes INTEGER DEFAULT 40,
    FOREIGN KEY (teacher_id) REFERENCES teachers(id)
);

-- ==========================================
-- 4. ATTENDANCE TABLE
-- ==========================================

CREATE TABLE IF NOT EXISTS attendance (
    student_id INTEGER NOT NULL,
    course_id INTEGER NOT NULL,
    class_date TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('P', 'A')),

    UNIQUE (student_id, course_id, class_date),

    FOREIGN KEY (student_id) REFERENCES students(id),
    FOREIGN KEY (course_id) REFERENCES courses(id)
);

-- ==========================================
-- 5. MARKS TABLE
-- ==========================================

CREATE TABLE IF NOT EXISTS marks (
    student_id INTEGER NOT NULL,
    course_id INTEGER NOT NULL,
    exam_type TEXT NOT NULL CHECK (
        exam_type IN ('QUIZ', 'MID', 'FINAL')
    ),
    score REAL NOT NULL CHECK (score >= 0),
    max_score REAL NOT NULL CHECK (max_score > 0),

    UNIQUE (student_id, course_id, exam_type),

    FOREIGN KEY (student_id) REFERENCES students(id),
    FOREIGN KEY (course_id) REFERENCES courses(id),

    CHECK (score <= max_score)
);

-- ==========================================
-- 6. FEES TABLE
-- ==========================================

CREATE TABLE IF NOT EXISTS fees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    total_fees REAL NOT NULL DEFAULT 50000,
    paid_amount REAL NOT NULL DEFAULT 0,
    payment_date TEXT,

    FOREIGN KEY (student_id) REFERENCES students(id),

    CHECK (total_fees >= 0),
    CHECK (paid_amount >= 0),
    CHECK (paid_amount <= total_fees)
);

-- ==========================================
-- 7. USEFUL DATABASE INDEXES
-- ==========================================

CREATE INDEX IF NOT EXISTS idx_attendance_student
ON attendance(student_id);

CREATE INDEX IF NOT EXISTS idx_attendance_course
ON attendance(course_id);

CREATE INDEX IF NOT EXISTS idx_marks_student
ON marks(student_id);

CREATE INDEX IF NOT EXISTS idx_fees_student
ON fees(student_id);