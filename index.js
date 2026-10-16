
import "dotenv/config";
import { createInterface } from "readline/promises";
import { stdin, stdout } from "process";

import db from "./db.js";
import { makeAgent } from "./agent.js";

const rl = createInterface({
    input: stdin,
    output: stdout
});

async function main() {
    try {
        console.log("\n==================================");
        console.log("       CAMPUSBUDDY ASSISTANT");
        console.log("==================================\n");

        const roleInput = await rl.question(
            "Enter your role (Student/Faculty): "
        );

        const role = roleInput.trim().toLowerCase();

        if (role !== "student" && role !== "faculty") {
            console.log(
                "Invalid role. Please enter Student or Faculty."
            );
            return;
        }

        let user;

        if (role === "student") {
            const rollInput = await rl.question(
                "Enter your roll number: "
            );

            const rollNumber = rollInput.trim().padStart(3, "0");

            const student = db.prepare(`
                SELECT *
                FROM students
                WHERE TRIM(roll_no) = ?
                   OR CAST(roll_no AS INTEGER) = CAST(? AS INTEGER)
                LIMIT 1
            `).get(rollNumber, rollNumber);

            if (!student) {
                console.log(
                    "\nStudent not found. Please check your roll number."
                );
                return;
            }

            user = {
                role: "student",
                roll_no: String(student.roll_no),
                name: student.name
            };

            console.log(
                `\nWelcome to CampusBuddy, ${student.name}!`
            );
        } else {
            user = {
                role: "faculty",
                name: "Faculty"
            };

            console.log(
                "\nWelcome to CampusBuddy, Faculty!"
            );
        }

        const agent = makeAgent(user);

        // Keep the conversation history between messages.
        let conversationMessages = [];

        // Remember the requested student's roll number for faculty.
        let selectedStudentRoll = "";

        console.log("\nYou can ask questions about:");
        console.log("- Attendance");
        console.log("- Fee status");
        console.log("- Student information");
        console.log("- College information");
        console.log("\nType 'exit' to close the assistant.\n");

        while (true) {
            const text = await rl.question("You: ");
            const input = text.trim();

            if (input.toLowerCase() === "exit") {
                console.log(
                    "\nThank you for using CampusBuddy!"
                );
                break;
            }

            if (!input) {
                continue;
            }

            // Save the student roll number when faculty mentions it.
            if (role === "faculty") {
                const rollMatch = input.match(
                    /roll\s*(?:number|no\.?)?\s*[:#-]?\s*(\d{1,})/i
                );

                if (rollMatch) {
                    selectedStudentRoll =
                        rollMatch[1].padStart(3, "0");
                } else if (
                    /^\d{1,}$/.test(input) &&
                    selectedStudentRoll === ""
                ) {
                    selectedStudentRoll = input.padStart(3, "0");
                }
            }

            // If faculty supplies only a subject after asking about a
            // student's record, add the remembered roll number as context.
            let messageForAgent = input;

            if (
                role === "faculty" &&
                selectedStudentRoll &&
                /^(python|dbms|computer networks|operating systems)$/i.test(input)
            ) {
                messageForAgent =
                    `For student roll number ${selectedStudentRoll}, ` +
                    `show the ${input} attendance.`;
            }

            try {
                conversationMessages.push({
                    role: "user",
                    content: messageForAgent
                });

                const result = await agent.invoke({
                    messages: conversationMessages
                });

                conversationMessages = result.messages ?? conversationMessages;

                const messages = result.messages ?? [];
                const lastMessage = [...messages]
                    .reverse()
                    .find(message => message?._getType?.() === "ai" ||
                        message?.role === "assistant");

                let answer = lastMessage?.content ??
                    "Sorry, I could not generate a response.";

                if (Array.isArray(answer)) {
                    answer = answer
                        .map(item => item.text ?? "")
                        .join("\n");
                }

                console.log("\nAssistant:", answer);
                console.log();

            } catch (error) {
                console.error(
                    "\nAssistant error:",
                    error.message
                );
                console.log();
            }
        }

    } catch (error) {
        console.error(
            "\nApplication error:",
            error.message
        );
    } finally {
        rl.close();

        if (db && typeof db.close === "function") {
            db.close();
        }
    }
}

main();

