import { GoogleGenAI } from "@google/genai";
import express from "express";
import cors from "cors";
import path from "path";

import dotenv from "dotenv";
dotenv.config();
// ===== INIT =====
const app = express();
app.use(cors());
app.use(express.json());

// 👉 Serve frontend folder
app.use(express.static(path.join(process.cwd(), "frontend")));

const History = [];
const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

// ===== TOOLS =====
function sum({ num1, num2 }) {
  return num1 + num2;
}

function prime({ num }) {
  if (num < 2) return false;
  for (let i = 2; i <= Math.sqrt(num); i++) {
    if (num % i === 0) return false;
  }
  return true;
}

async function getCryptoPrice({ coin }) {
  const response = await fetch(
    `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${coin}`
  );
  const data = await response.json();
  return data;
}

// ===== TOOL DECLARATIONS =====
const sumDeclaration = {
  name: "sum",
  description: "Get the sum of 2 numbers",
  parameters: {
    type: "OBJECT",
    properties: {
      num1: { type: "NUMBER" },
      num2: { type: "NUMBER" },
    },
    required: ["num1", "num2"],
  },
};

const primeDeclaration = {
  name: "prime",
  description: "Check if number is prime",
  parameters: {
    type: "OBJECT",
    properties: {
      num: { type: "NUMBER" },
    },
    required: ["num"],
  },
};

const cryptoDeclaration = {
  name: "getCryptoPrice",
  description: "Get crypto price",
  parameters: {
    type: "OBJECT",
    properties: {
      coin: { type: "STRING" },
    },
    required: ["coin"],
  },
};

// ===== TOOL MAP =====
const availableTools = {
  sum,
  prime,
  getCryptoPrice,
};

// ===== CHAT API =====
app.post("/chat", async (req, res) => {
  try {
    const userProblem = req.body.message;
    console.log("📩 User:", userProblem);

    let History = []; // ⚠️ make it local (IMPORTANT)
    let finalResponse = "";

    History.push({
      role: "user",
      parts: [{ text: userProblem }],
    });

    let loopCount = 0; // safety

    while (true) {
      loopCount++;
      if (loopCount > 5) {
        throw new Error("Loop exceeded limit");
      }

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: History,
        config: {
          systemInstruction: `You are an AI Agent.`,
          tools: [{
            functionDeclarations: [
              sumDeclaration,
              primeDeclaration,
              cryptoDeclaration
            ],
          }],
        },
      });

      console.log("🤖 Response:", response.text);
      console.log("🛠 Tool:", response.functionCalls);

      if (response.functionCalls && response.functionCalls.length > 0) {
        const { name, args } = response.functionCalls[0];

        console.log("⚙️ Calling Tool:", name, args);

        const tool = availableTools[name];
        const result = await tool(args);

        console.log("✅ Tool Result:", result);

        History.push({
          role: "model",
          parts: [{ functionCall: response.functionCalls[0] }],
        });

        History.push({
          role: "user",
          parts: [{
            functionResponse: {
              name,
              response: { result },
            },
          }],
        });

      } else {
        finalResponse = response.text;

        History.push({
          role: "model",
          parts: [{ text: response.text }],
        });

        break;
      }
    }

    res.json({ reply: finalResponse });

  } catch (err) {
    console.error("❌ ERROR:", err);
    res.status(500).json({ reply: "Server error, check logs" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
