import Anthropic from "@anthropic-ai/sdk";


/**
 * Definition of tools available to the agent. Each tool has a name, description, and an input schema that defines what parameters it expects.
 * The agent will use this information to decide when and how to call these tools based on the conversation with the caller. 
 * The tools include checking class availability, booking classes, logging contacts, and more. This structured definition allows 
 * the agent to interact with these tools in a consistent way.
 */
export const tools: Anthropic.Tool[] = [
  {
    name: "check_availability",
    description:
      "Check if a specific class has available spots. Use this before booking or when a caller asks if a class is open.",
    input_schema: {
      type: "object",
      properties: {
        class_type: {
          type: "string",
          enum: ["Reformer", "Mat"],
          description: "Type of class",
        },
        date: {
          type: "string",
          description: "Date of the class in YYYY-MM-DD format",
        },
        time: {
          type: "string",
          description: "Start time of the class in HH:MM 24hr format",
        },
      },
      required: ["class_type", "date", "time"],
    },
  },
  {
    name: "get_all_classes",
    description:
      "Get all upcoming classes with their availability. Use when caller asks what classes are available without specifying a particular one.",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "book_class",
    description:
      "Book a spot in a class for a caller. Only call this after confirming availability and getting caller name, phone and spot count.",
    input_schema: {
      type: "object",
      properties: {
        class_type: {
          type: "string",
          enum: ["Reformer", "Mat"],
          description: "Type of class",
        },
        date: {
          type: "string",
          description: "Date of the class in YYYY-MM-DD format",
        },
        time: {
          type: "string",
          description: "Start time of the class in HH:MM 24hr format",
        },
        caller_name: {
          type: "string",
          description: "Full name of the caller",
        },
        caller_phone: {
          type: "string",
          description: "Phone number of the caller",
        },
        spots: {
          type: "number",
          description: "Number of spots to book",
        },
      },
      required: [
        "class_type",
        "date",
        "time",
        "caller_name",
        "caller_phone",
        "spots",
      ],
    },
  },
  {
    name: "cancel_booking",
    description:
      "Cancel an existing booking for a caller. Use when caller wants to cancel their spot in a class.",
    input_schema: {
      type: "object",
      properties: {
        class_type: {
          type: "string",
          enum: ["Reformer", "Mat"],
          description: "Type of class",
        },
        date: {
          type: "string",
          description: "Date of the class in YYYY-MM-DD format",
        },
        time: {
          type: "string",
          description: "Start time of the class in HH:MM 24hr format",
        },
        caller_phone: {
          type: "string",
          description: "Phone number of the caller to identify their booking",
        },
      },
      required: ["class_type", "date", "time", "caller_phone"],
    },
  },
  {
    name: "reschedule_booking",
    description:
      "Move a caller from one class to another. Cancels old booking and creates new one.",
    input_schema: {
      type: "object",
      properties: {
        old_class_type: {
          type: "string",
          enum: ["Reformer", "Mat"],
        },
        old_date: {
          type: "string",
          description: "YYYY-MM-DD format",
        },
        old_time: {
          type: "string",
          description: "HH:MM 24hr format",
        },
        new_class_type: {
          type: "string",
          enum: ["Reformer", "Mat"],
        },
        new_date: {
          type: "string",
          description: "YYYY-MM-DD format",
        },
        new_time: {
          type: "string",
          description: "HH:MM 24hr format",
        },
        caller_name: {
          type: "string",
        },
        caller_phone: {
          type: "string",
        },
        spots: {
          type: "number",
        },
      },
      required: [
        "old_class_type",
        "old_date",
        "old_time",
        "new_class_type",
        "new_date",
        "new_time",
        "caller_name",
        "caller_phone",
        "spots",
      ],
    },
  },
  {
    name: "log_contact",
    description:
      "Log the call details to Google Sheets. Always call this at the end of every conversation before saying goodbye.",
    input_schema: {
      type: "object",
      properties: {
        caller_phone: {
          type: "string",
          description: "Phone number of the caller",
        },
        caller_name: {
          type: "string",
          description: "Name of the caller, use Unknown if not provided",
        },
        request_type: {
          type: "string",
          enum: [
            "Booking",
            "Reschedule",
            "Cancellation",
            "Pricing Inquiry",
            "Running Late",
            "Drop-in Inquiry",
            "General Question",
            "Complaint",
            "Other",
          ],
        },
        details: {
          type: "string",
          description: "Brief summary of what the caller asked or requested",
        },
        status: {
          type: "string",
          enum: [
            "Booked",
            "Rescheduled",
            "Cancelled",
            "Handed Off to Human",
            "Info Only",
          ],
        },
        notes: {
          type: "string",
          description: "Any additional notes about the call",
        },
      },
      required: [
        "caller_phone",
        "caller_name",
        "request_type",
        "details",
        "status",
      ],
    },
  },
  {
    name: "handoff_to_human",
    description:
      "Hand off the call to a human staff member. Use for billing disputes, refunds, medical concerns, complaints requiring a manager, or anything you are not confident handling.",
    input_schema: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description: "Why this is being handed off to a human",
        },
        caller_name: {
          type: "string",
        },
        caller_phone: {
          type: "string",
        },
      },
      required: ["reason"],
    },
  },
  {
    name: "add_spots_to_booking",
    description:
      "Add more spots to an existing booking for a caller who is already booked in a class. Use when caller says they want to bring a friend, add a guest, or increase their spot count.",
    input_schema: {
      type: "object",
      properties: {
        class_type: {
          type: "string",
          enum: ["Reformer", "Mat"],
        },
        date: {
          type: "string",
          description: "Date in YYYY-MM-DD format",
        },
        time: {
          type: "string",
          description: "Start time in HH:MM 24hr format",
        },
        caller_phone: {
          type: "string",
          description: "Phone number to find existing booking",
        },
        caller_name: {
          type: "string",
        },
        additional_spots: {
          type: "number",
          description: "Number of additional spots to add",
        },
      },
      required: ["class_type", "date", "time", "caller_phone", "caller_name", "additional_spots"],
    },
  },
];