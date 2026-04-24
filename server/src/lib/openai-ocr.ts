import OpenAI from "openai";

let client: OpenAI | null = null;

function getClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }

  client ??= new OpenAI({ apiKey });
  return client;
}

export async function extractTextWithOpenAIOCR(input: {
  bytes: ArrayBuffer;
  mimeType: string;
  fileName: string;
}) {
  const openai = getClient();
  if (!openai) {
    return "";
  }

  const mimeType = (input.mimeType || "application/octet-stream").toLowerCase();
  const base64 = Buffer.from(input.bytes).toString("base64");
  const model = process.env.OPENAI_OCR_MODEL || process.env.OPENAI_MODEL || "gpt-4.1-mini";

  try {
    const content: Array<
      | { type: "input_text"; text: string }
      | { type: "input_file"; file_data: string; filename: string }
      | { type: "input_image"; image_url: string; detail: "high" | "auto" | "low" }
    > = [
      {
        type: "input_text",
        text:
          "Extract all readable text from this resume exactly. Return plain text only. " +
          "Do not summarize. Do not add commentary. Preserve section order and line breaks where possible."
      }
    ];

    if (mimeType.startsWith("image/")) {
      content.push({
        type: "input_image",
        image_url: `data:${mimeType};base64,${base64}`,
        detail: "high"
      });
    } else {
      content.push({
        type: "input_file",
        file_data: `data:${mimeType};base64,${base64}`,
        filename: input.fileName
      });
    }

    const response = await openai.responses.create({
      model,
      temperature: 0,
      input: [
        {
          role: "user",
          content
        }
      ]
    });

    return (response.output_text || "").trim();
  } catch (error) {
    console.warn("OpenAI OCR failed", error);
    return "";
  }
}

