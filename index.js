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
  const userProblem = req.body.message;
  let finalResponse = "";

  History.push({
    role: "user",
    parts: [{ text: userProblem }],
  });

  while (true) {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: History,
      config: {
        systemInstruction: `You are an AI Agent.

IMPORTANT:
- If user asks crypto price in ANY language (Hindi, Hinglish, etc), ALWAYS call getCryptoPrice tool.
- Convert btc → bitcoin, eth → ethereum automatically, similarly user can use other variations.

Available tools:
- sum
- prime
- getCryptoPrice, which gets current price of any cryptocurrency in USD. User can ask any other questions also you should try to answer them without calling the tool, but if user asks anything related to crypto price, you MUST call the getCryptoPrice tool. Always try to understand user query and call appropriate tool. similarly if the question is related to tools, call the appropriate tool. If user is asking general question, try to answer without calling tool.`,
        tools: [
          {
            functionDeclarations: [
              sumDeclaration,
              primeDeclaration,
              cryptoDeclaration,
            ],
          },
        ],
      },
    });

    if (response.functionCalls && response.functionCalls.length > 0) {
      console.log("Tool called:", response.functionCalls[0].name);
      const { name, args } = response.functionCalls[0];

      const tool = availableTools[name];
      const result = await tool(args);

      // Push function call
      History.push({
        role: "model",
        parts: [{ functionCall: response.functionCalls[0] }],
      });

      // Push result
      History.push({
        role: "user",
        parts: [
          {
            functionResponse: {
              name,
              response: { result },
            },
          },
        ],
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
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
