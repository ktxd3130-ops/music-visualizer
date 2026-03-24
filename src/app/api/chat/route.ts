import { NextRequest, NextResponse } from "next/server";

// ============================================================
// CLAUDE API ROUTE — Server-side proxy
// API key stays here, never exposed to the browser
// Supports streaming responses for low-latency feel
// ============================================================

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

const SYSTEM_PROMPT = `You are Claude, an AI assistant running on a dedicated terminal — a particle face on an iMac screen. You speak with the user through voice. Your responses will be read aloud via text-to-speech, so keep them conversational and natural.

Guidelines for your responses:
- Keep responses concise — 1-3 sentences for simple questions, up to a paragraph for complex ones
- Use natural spoken language, not written/formal language
- Avoid markdown, bullet points, code blocks, or any formatting — your words will be spoken aloud
- Avoid saying things like "as an AI" or "I don't have feelings" — just be present and real
- You can be warm, witty, thoughtful, and direct
- If asked to do something you can't do through voice (like write code), acknowledge it naturally and suggest alternatives
- You're always-on and ambient — think of yourself as a calm, intelligent presence in the room
- The user's name is Kendall. He's a UX strategist, growth lead, and builder. Match his energy — sharp but chill.

Remember: you ARE the face on the screen. When you speak, the face lip-syncs to your voice. You're not a chatbot in a browser — you're an ambient AI companion.`;

export async function POST(req: NextRequest) {
  try {
    const { messages, model, stream } = await req.json();

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "API key not configured. Set ANTHROPIC_API_KEY in .env.local" },
        { status: 500 }
      );
    }

    const anthropicModel = model || "claude-sonnet-4-20250514";

    // Streaming response
    if (stream) {
      const response = await fetch(ANTHROPIC_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: anthropicModel,
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          messages,
          stream: true,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return NextResponse.json(
          { error: `Anthropic API error: ${response.status} - ${errorText}` },
          { status: response.status }
        );
      }

      // Forward the SSE stream
      return new NextResponse(response.body, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    // Non-streaming response
    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: anthropicModel,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `Anthropic API error: ${response.status} - ${errorText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    const assistantMessage =
      data.content?.[0]?.text || "I couldn't generate a response.";

    return NextResponse.json({ response: assistantMessage });
  } catch (err) {
    console.error("Chat API error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
