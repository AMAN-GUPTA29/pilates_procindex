import Anthropic from "@anthropic-ai/sdk";
import { systemPrompt } from "./systemPrompt";
import { tools } from "./tools";
import {
  getAllClasses,
  checkAvailability,
  bookClass,
  cancelBooking,
  rescheduleBooking,
  addSpotsToBooking,
} from "../google/calendar";
import { logContact, lookupCaller } from "../google/sheets";

const client = new Anthropic();

/**
 * Message format used in this agent implementation. The Anthropic SDK uses a more complex MessageParam type that can include tool calls, 
 * text blocks, etc. But for simplicity in our agent loop, we will just use an array of these Message objects to represent the conversation 
 * history. Each message has a role (user or assistant) and content (the text or tool calls). The actual Anthropic.MessageParam objects will 
 * be constructed from these when we call the API.
 */
export type Message = {
  role: "user" | "assistant";
  content: string;
};

// --- Tool Executor ---

/**
 * Executes a tool call with the given name and input.
 * @param toolName 
 * @param toolInput 
 * @returns 
 * The executeTool function is responsible for taking a tool name and its input, calling the corresponding function 
 * (like getAllClasses or logContact), and returning the result as a string. It also logs the tool calls and their 
 * results for debugging purposes. If an error occurs during tool execution, it catches the error and returns an error message instead. 
 * This function abstracts away the details of how each tool works, allowing the agent loop to simply call executeTool
 * with the desired tool name and input.
 */
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

        break;

      case "cancel_booking":
        result = await cancelBooking(
          toolInput.class_type,
          toolInput.date,
          toolInput.time,
          toolInput.caller_phone,
        );

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
      case "add_spots_to_booking":
        result = await addSpotsToBooking(
          toolInput.class_type,
          toolInput.date,
          toolInput.time,
          toolInput.caller_phone,
          toolInput.caller_name,
          toolInput.additional_spots,
        );
        if (result.success) {
          await logContact(
            toolInput.caller_phone,
            toolInput.caller_name,
            "Booking",
            `Added ${toolInput.additional_spots} spot(s) to existing booking in ${toolInput.class_type} class on ${toolInput.date} at ${toolInput.time}`,
            "Booked",
            "",
          );
        }
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

/**
 * Runs the AI agent with the given input messages.
 * @param inputMessages 
 * @returns 
 * The runAgent function is the core of the agent's operation. It takes an array of input messages (representing the conversation history),
 * calls the Anthropic API to get a response, checks if the response includes any tool calls, executes those tools if needed, 
 * and continues this loop until the agent has a final text response without any pending tool calls. It returns the final text
 * response along with the full message history. This function abstracts away the complexity of handling tool calls and allows 
 * us to simply call runAgent with the conversation history to get a response.
 */
export async function runAgent(
  inputMessages: Anthropic.MessageParam[],
): Promise<{ text: string; messages: Anthropic.MessageParam[] }> {
  const messages = [...inputMessages];

  let response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 1024,
    system: systemPrompt,
    tools,
    messages,
  });

  // Agentic loop — keep running until no more tool calls
  while (response.stop_reason === "tool_use") {
    // Push assistant message (contains tool_use blocks) into history
    messages.push({ role: "assistant", content: response.content });

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

    // Push tool results into history
    messages.push({ role: "user", content: toolResults });

    response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      system: systemPrompt,
      tools,
      messages,
    });
  }

  // Push final assistant response into history
  messages.push({ role: "assistant", content: response.content });

  // Extract text
  const textBlock = response.content.find((b) => b.type === "text");
  const text =
    textBlock && textBlock.type === "text"
      ? textBlock.text
      : "Sorry, I didn't catch that. Could you repeat?";

  return { text, messages };
}

/**
 * Runs the AI agent as a stream, calling the provided callback for each chunk of text.
 * @param inputMessages 
 * @param onChunk 
 * @returns 
 * The runAgentStream function is a variation of runAgent that allows for streaming responses. 
 * Instead of waiting for the entire response to be generated, it calls the onChunk callback with each chunk of text as it is generated.
 * This can be useful for providing a more responsive experience in a chat interface. 
 * The function still handles tool calls in the same way as runAgent, 
 * but it streams the final text response instead of returning it all at once.
 */
export async function runAgentStream(
  inputMessages: Anthropic.MessageParam[],
  onChunk: (text: string) => void,
): Promise<{ text: string; messages: Anthropic.MessageParam[] }> {
  const messages = [...inputMessages];

  let response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 1024,
    system: systemPrompt,
    tools,
    messages,
  });

  // Agentic loop — handle tool calls
  while (response.stop_reason === "tool_use") {
    messages.push({ role: "assistant", content: response.content });

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

    messages.push({ role: "user", content: toolResults });

    response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      system: systemPrompt,
      tools,
      messages,
    });
  }

  messages.push({ role: "assistant", content: response.content });

  const textBlock = response.content.find((b) => b.type === "text");
  const finalText =
    textBlock && textBlock.type === "text"
      ? textBlock.text
      : "Sorry, I didn't catch that. Could you repeat?";

  // Stream chunks to caller
  for (const word of finalText.split(" ")) {
    onChunk(word + " ");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  return { text: finalText, messages };
}
