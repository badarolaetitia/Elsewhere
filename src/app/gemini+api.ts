import { GoogleGenAI } from "@google/genai";

export async function POST(request: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return Response.json(
        {
          error: "Gemini API key is missing.",
        },
        {
          status: 500,
        }
      );
    }

    const body = await request.json();

    const place =
      typeof body?.place === "string"
        ? body.place.trim()
        : "";

    if (!place) {
      return Response.json(
        {
          error: "A place name is required.",
        },
        {
          status: 400,
        }
      );
    }

    const ai = new GoogleGenAI({
      apiKey,
    });

    const response =
      await ai.models.generateContent({
        model: "gemini-3.7-flash",
        contents: `
You are helping power an app called Elsewhere.

Elsewhere helps travelers decide whether a popular or viral place is worth visiting,
and suggests the kinds of nearby alternatives they should look for.

The traveler searched for:

"${place}"

Give a concise analysis of this place.

Return ONLY valid JSON in this exact structure:

{
  "placeName": "string",
  "summary": "string",
  "knownFor": ["string"],
  "alternativeSearchIdeas": ["string"],
  "travelerAdvice": "string"
}

Rules:
- Do not invent exact prices, wait times, ratings, addresses, or factual claims you are unsure about.
- Keep the summary short.
- knownFor should contain 2 to 5 short items.
- alternativeSearchIdeas should contain 3 useful search ideas for finding similar places.
- travelerAdvice should be 1 or 2 sentences.
`,
        config: {
          responseMimeType:
            "application/json",
        },
      });

    const text = response.text;

    if (!text) {
      return Response.json(
        {
          error:
            "Gemini returned an empty response.",
        },
        {
          status: 500,
        }
      );
    }

    const data = JSON.parse(text);

    return Response.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error(
      "Gemini API error:",
      error
    );

    return Response.json(
      {
        success: false,
        error:
          "Something went wrong while contacting Gemini.",
      },
      {
        status: 500,
      }
    );
  }
}