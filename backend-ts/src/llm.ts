import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "./config";

const genAI = new GoogleGenerativeAI(config.geminiApiKey);

export async function callLLM(
  systemMessage: string,
  prompt: string,
): Promise<string> {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    systemInstruction: systemMessage,
  });
  const result = await model.generateContent(prompt);
  return result.response.text();
}
