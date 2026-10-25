import dotenv from "dotenv";
dotenv.config();

import fs from "fs";
import path from "path";
import { GoogleGenAI, Type } from "@google/genai";

async function test() {
  console.log("Reading PDF...");
  const samplePath = path.join(process.cwd(), "public", "assets", "aistudio", "Remix__RPF_Travelling_Allowance_Journal_69e12695.pdf");
  const buffer = fs.readFileSync(samplePath);
  const base64 = buffer.toString("base64");
  console.log("Base64 length:", base64.length);

  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });

  console.log("Calling Gemini 3.8 flash...");
  const start = Date.now();
  const response = await ai.models.generateContent({
    model: "gemini-3.8-flash",
    contents: [
      {
        inlineData: {
          mimeType: "application/pdf",
          data: base64,
        },
      },
      {
        text: "Extract officer details and journey table rows from this RPF TA Journal GA-31 PDF document as JSON.",
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          officer: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              pfNumber: { type: Type.STRING },
              designation: { type: Type.STRING },
            },
          },
          monthClaimed: { type: Type.STRING },
          journeysCount: { type: Type.NUMBER },
        },
      },
    },
  });
  console.log("Done in", (Date.now() - start) / 1000, "s");
  console.log("Response:", response.text);
}

test().catch(console.error);
