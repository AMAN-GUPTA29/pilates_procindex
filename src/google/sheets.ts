import { google } from "googleapis";
import * as dotenv from "dotenv";

dotenv.config();

const auth = new google.auth.GoogleAuth({
  keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_PATH!,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheetsClient = google.sheets({ version: "v4", auth });
const SHEET_ID = process.env.GOOGLE_SHEET_ID!;
const SHEET_TAB = "Contacts";

// --- Helpers ---

function now() {
  return new Date().toLocaleString("en-US", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function today() {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  });
}

// --- Exported Functions ---

export async function lookupCaller(phone: string) {
  const response = await sheetsClient.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_TAB}!A:I`,
  });

  const rows = response.data.values || [];
  if (rows.length <= 1) return null; // only headers or empty

  // Skip header row, find all rows matching phone
  const callerRows = rows
    .slice(1)
    .filter((row) => row[0] === phone);

  if (callerRows.length === 0) return null;

  // Return first row (has First_Called) and latest row (has Last_Called)
  return {
    phone: callerRows[0][0],
    name: callerRows[0][1],
    firstCalled: callerRows[0][2],
    lastCalled: callerRows[callerRows.length - 1][3],
    totalCalls: callerRows.length,
  };
}

export async function logContact(
  caller_phone: string,
  caller_name: string,
  request_type: string,
  details: string,
  status: string,
  notes: string = ""
) {
  // Check if repeat caller
  const existing = await lookupCaller(caller_phone);

  const firstCalled = existing ? existing.firstCalled : today();
  const lastCalled = today();
  const callTimestamp = now();

  const newRow = [
    caller_phone,
    caller_name,
    firstCalled,
    lastCalled,
    callTimestamp,
    request_type,
    details,
    status,
    notes,
  ];

  await sheetsClient.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_TAB}!A:I`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [newRow],
    },
  });

  return {
    success: true,
    isRepeatCaller: !!existing,
    totalCalls: existing ? existing.totalCalls + 1 : 1,
    message: existing
      ? `Logged call for repeat caller ${caller_name} (${existing.totalCalls + 1} total calls)`
      : `Logged call for new caller ${caller_name}`,
  };
}