import { google } from "googleapis";
import * as dotenv from "dotenv";

dotenv.config();

const auth = new google.auth.GoogleAuth({
  keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_PATH!,
  scopes: ["https://www.googleapis.com/auth/calendar"],
});

const calendarClient = google.calendar({ version: "v3", auth });
const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID!;

// --- Helpers ---

function parseDescription(description: string) {
  const lines = description || "";
  const capacityMatch = lines.match(/capacity:(\d+)/);
  const bookedMatch = lines.match(/booked:(\d+)/);
  const attendeesMatch = lines.match(/attendees:(.+)/);

  return {
    capacity: capacityMatch ? parseInt(capacityMatch[1]) : 0,
    booked: bookedMatch ? parseInt(bookedMatch[1]) : 0,
    attendees: attendeesMatch ? attendeesMatch[1].trim() : "",
  };
}

function buildDescription(
  capacity: number,
  booked: number,
  attendees: string
) {
  return `capacity:${capacity}\nbooked:${booked}\nattendees:${attendees}`;
}

function matchesClass(
  event: any,
  class_type: string,
  date: string,
  time: string
) {
  const eventTitle = event.summary?.toLowerCase() || "";
  const classMatch = eventTitle.includes(class_type.toLowerCase());

  const eventStart = new Date(event.start?.dateTime || "");
  
  // Use IST timezone explicitly
  const localDate = eventStart.toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  });
  const localTime = eventStart.toLocaleTimeString("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return classMatch && localDate === date && localTime === time;
}

// --- Exported Functions ---

export async function getAllClasses() {
  const response = await calendarClient.events.list({
    calendarId: CALENDAR_ID,
    timeMin: new Date().toISOString(),
    maxResults: 20,
    singleEvents: true,
    orderBy: "startTime",
  });

  const events = response.data.items || [];

  return events.map((e) => {
    const { capacity, booked, attendees } = parseDescription(
      e.description || ""
    );
    const spotsLeft = capacity - booked;
    const startDate = new Date(e.start?.dateTime || "");
  const localDate = startDate.toLocaleDateString("en-CA", {
  timeZone: "Asia/Kolkata",
  });
  const localTime = startDate.toLocaleTimeString("en-GB", {
  timeZone: "Asia/Kolkata",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  });

  return {
  id: e.id,
  title: e.summary,
  date: localDate,
  dayName: startDate.toLocaleDateString("en-US", {
    timeZone: "Asia/Kolkata",
    weekday: "long",
  }),
  time: localTime,
  capacity,
  booked,
  spotsLeft,
  isFull: spotsLeft <= 0,
  attendees,
};
  });
}

export async function checkAvailability(
  class_type: string,
  date: string,
  time: string
) {
  const response = await calendarClient.events.list({
    calendarId: CALENDAR_ID,
    timeMin: new Date().toISOString(),
    maxResults: 20,
    singleEvents: true,
    orderBy: "startTime",
  });

  const events = response.data.items || [];
  const event = events.find((e) => matchesClass(e, class_type, date, time));

  if (!event) {
    return { found: false, message: "No class found for that date and time." };
  }

  const { capacity, booked, attendees } = parseDescription(
    event.description || ""
  );
  const spotsLeft = capacity - booked;

  return {
    found: true,
    id: event.id,
    title: event.summary,
    date,
    time,
    capacity,
    booked,
    spotsLeft,
    isFull: spotsLeft <= 0,
    attendees,
  };
}

export async function bookClass(
  class_type: string,
  date: string,
  time: string,
  caller_name: string,
  caller_phone: string,
  spots: number
) {
  const availability = await checkAvailability(class_type, date, time);

  if (!availability.found) {
    return { success: false, message: "Class not found." };
  }

  if (availability.isFull) {
    return { success: false, message: "Class is full." };
  }

  if (availability.spotsLeft! < spots) {
    return {
      success: false,
      message: `Only ${availability.spotsLeft} spot(s) left, cannot book ${spots}.`,
    };
  }

  const attendeesList = availability.attendees || "";
  const alreadyBooked = attendeesList
    .split(",")
    .map((a) => a.trim())
    .some((a) => a.includes(caller_phone));

  if (alreadyBooked) {
    return {
      success: false,
      alreadyBooked: true,
      message: `${caller_name} is already booked in this class.`,
    };
  }


  const newBooked = availability.booked! + spots;
  const existingAttendees = availability.attendees || "";
  const newAttendee = `${caller_name} ${caller_phone} x${spots}`;
  const newAttendees = existingAttendees
    ? `${existingAttendees}, ${newAttendee}`
    : newAttendee;

  const newDescription = buildDescription(
    availability.capacity!,
    newBooked,
    newAttendees
  );

  await calendarClient.events.patch({
    calendarId: CALENDAR_ID,
    eventId: availability.id!,
    requestBody: { description: newDescription },
  });

  return {
    success: true,
    message: `Booked ${spots} spot(s) for ${caller_name} in ${class_type} class on ${date} at ${time}.`,
  };
}

export async function cancelBooking(
  class_type: string,
  date: string,
  time: string,
  caller_phone: string
) {
  const availability = await checkAvailability(class_type, date, time);

  if (!availability.found) {
    return { success: false, message: "Class not found." };
  }

  const attendeesList = availability.attendees || "";
  const attendees = attendeesList.split(",").map((a) => a.trim());
  const attendeeEntry = attendees.find((a) => a.includes(caller_phone));

  if (!attendeeEntry) {
    return {
      success: false,
      message: "No booking found for that phone number.",
    };
  }

  // Get spot count from xN
  const spotsMatch = attendeeEntry.match(/x(\d+)/);
  const spots = spotsMatch ? parseInt(spotsMatch[1]) : 1;

  const newAttendees = attendees
    .filter((a) => !a.includes(caller_phone))
    .join(", ");
  const newBooked = availability.booked! - spots;

  const newDescription = buildDescription(
    availability.capacity!,
    newBooked,
    newAttendees
  );

  await calendarClient.events.patch({
    calendarId: CALENDAR_ID,
    eventId: availability.id!,
    requestBody: { description: newDescription },
  });

  return {
    success: true,
    message: `Cancelled ${spots} spot(s) for ${caller_phone} in ${class_type} class on ${date} at ${time}.`,
  };
}

export async function rescheduleBooking(
  old_class_type: string,
  old_date: string,
  old_time: string,
  new_class_type: string,
  new_date: string,
  new_time: string,
  caller_name: string,
  caller_phone: string,
  spots: number
) {
  // Cancel old booking
  const cancelResult = await cancelBooking(
    old_class_type,
    old_date,
    old_time,
    caller_phone
  );

  if (!cancelResult.success) {
    return {
      success: false,
      message: `Could not cancel old booking: ${cancelResult.message}`,
    };
  }

  // Book new class
  const bookResult = await bookClass(
    new_class_type,
    new_date,
    new_time,
    caller_name,
    caller_phone,
    spots
  );

  if (!bookResult.success) {
    // Re-book the old class if new booking fails
    await bookClass(
      old_class_type,
      old_date,
      old_time,
      caller_name,
      caller_phone,
      spots
    );
    return {
      success: false,
      message: `Could not book new class: ${bookResult.message}. Original booking restored.`,
    };
  }

  return {
    success: true,
    message: `Rescheduled from ${old_class_type} on ${old_date} at ${old_time} to ${new_class_type} on ${new_date} at ${new_time}.`,
  };
}