import Anthropic from "@anthropic-ai/sdk";
import { systemPrompt } from "./systemPrompt";
import { tools } from "./tools";
import {
  getAllClasses,
  checkAvailability,
  bookClass,
  cancelBooking,
  rescheduleBooking,
} from "../google/calendar";
import { logContact, lookupCaller } from "../google/sheets";

const client = new Anthropic();

export type Message = {
  role: "user" | "assistant";
  content: string;
};

// --- Tool Executor ---

async function executeTool(
  toolName: string,
  toolInput: Record<string, any>,
): Promise<string> {
  console.log(`\n[Tool Call] ${toolName}`, toolInput);

  try {
    let result: any;

    switch (toolName) {
      case "get_all_classes":
        result = await getAllClasses();
        break;

      case "check_availability":
        result = await checkAvailability(
          toolInput.class_type,
          toolInput.date,
          toolInput.time,
        );
        break;

      case "book_class":
        result = await bookClass(
          toolInput.class_type,
          toolInput.date,
          toolInput.time,
          toolInput.caller_name,
          toolInput.caller_phone,
          toolInput.spots,
        );
        // Auto-log after every successful booking
        if (result.success) {
          await logContact(
            toolInput.caller_phone,
            toolInput.caller_name,
            "Booking",
            `Booked ${toolInput.class_type} class on ${toolInput.date} at ${toolInput.time}, ${toolInput.spots} spot(s)`,
            "Booked",
            "",
          );
        }
        break;

      case "cancel_booking":
        result = await cancelBooking(
          toolInput.class_type,
          toolInput.date,
          toolInput.time,
          toolInput.caller_phone,
        );
        if (result.success) {
          await logContact(
            toolInput.caller_phone,
            "Unknown",
            "Cancellation",
            `Cancelled ${toolInput.class_type} class on ${toolInput.date} at ${toolInput.time}`,
            "Cancelled",
            "",
          );
        }
        break;

      case "reschedule_booking":
        result = await rescheduleBooking(
          toolInput.old_class_type,
          toolInput.old_date,
          toolInput.old_time,
          toolInput.new_class_type,
          toolInput.new_date,
          toolInput.new_time,
          toolInput.caller_name,
          toolInput.caller_phone,
          toolInput.spots,
        );
        if (result.success) {
          await logContact(
            toolInput.caller_phone,
            toolInput.caller_name,
            "Reschedule",
            `Rescheduled from ${toolInput.old_class_type} ${toolInput.old_date} ${toolInput.old_time} to ${toolInput.new_class_type} ${toolInput.new_date} ${toolInput.new_time}`,
            "Rescheduled",
            "",
          );
        }
        break;

      case "log_contact":
        result = await logContact(
          toolInput.caller_phone,
          toolInput.caller_name,
          toolInput.request_type,
          toolInput.details,
          toolInput.status,
          toolInput.notes || "",
        );
        break;

      case "lookup_caller":
        result = await lookupCaller(toolInput.caller_phone);
        break;

      case "handoff_to_human":
        result = {
          success: true,
          message: `Handing off to human staff. Reason: ${toolInput.reason}. Please follow up with ${toolInput.caller_name || "the caller"} at ${toolInput.caller_phone || "unknown number"}.`,
          handoff: true,
        };
        break;

      default:
        result = { error: `Unknown tool: ${toolName}` };
    }

    console.log(`[Tool Result]`, result);
    return JSON.stringify(result);
  } catch (error: any) {
    console.error(`[Tool Error] ${toolName}:`, error.message);
    return JSON.stringify({ error: error.message });
  }
}

// --- Main Agent Loop ---

export async function runAgent(
  conversationHistory: Message[],
): Promise<string> {
  const messages: Anthropic.MessageParam[] = conversationHistory.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  let response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 1024,
    system: systemPrompt,
    tools,
    messages,
  });

  // Agentic loop — keep running until no more tool calls
  while (response.stop_reason === "tool_use") {
    const assistantMessage: Anthropic.MessageParam = {
      role: "assistant",
      content: response.content,
    };

    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const block of response.content) {
      if (block.type === "tool_use") {
        const result = await executeTool(
          block.name,
          block.input as Record<string, any>,
        );
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: result,
        });
      }
    }

    const toolResultMessage: Anthropic.MessageParam = {
      role: "user",
      content: toolResults,
    };

    response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      system: systemPrompt,
      tools,
      messages: [...messages, assistantMessage, toolResultMessage],
    });
  }

  // Extract final text response
  const textBlock = response.content.find((b) => b.type === "text");
  return textBlock && textBlock.type === "text"
    ? textBlock.text
    : "Sorry, I didn't catch that. Could you repeat?";
}
