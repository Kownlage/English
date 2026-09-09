import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(request) {
  try {
    const { word } = await request.json();
    
    // AIに「一瞬で読める短い意味だけを返す」ように指示
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "入力された英単語の最も一般的な日本語訳を1つか2つだけ、非常に短く（例:「〜を意味する、〜」）答えてください。解説は一切不要です。" },
        { role: "user", content: word }
      ]
    });

    return NextResponse.json({ meaning: response.choices[0].message.content });
  } catch (error) {
    return NextResponse.json({ error: "エラー" }, { status: 500 });
  }
}