import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(request) {
  try {
    // 画面から「新しい英語」と「直前の英語（文脈）」を受け取る
    const { text, context } = await request.json();
    
    // AIへの指示書（JSON形式で返答するように指定します）
    const systemPrompt = `あなたはイギリスの大学の講義をサポートするAIアシスタントです。
入力された英語を自然な日本語に翻訳してください。
また、提供された「前の文脈(Context)」と比較して、今回の入力が「明らかに新しい話題・章の始まり」であるかを判定してください。
（例："Now, let's move on to...", "Next topic", まったく異なる主題への移行など）

必ず以下のJSONフォーマットで出力してください：
{
  "japanese": "翻訳した日本語テキスト",
  "isNewChapter": true または false,
  "newChapterTitle": "isNewChapterがtrueの場合、新しい話題の短いタイトル（日本語で10文字以内）。falseの場合は空文字"
}`;

    const translation = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" }, // JSONで返すよう強制
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `【前の文脈】\n${context || "なし"}\n\n【今回の入力】\n${text}` }
      ]
    });

    // JSONデータをプログラム用の形に戻して画面に返す
    const data = JSON.parse(translation.choices[0].message.content);
    return NextResponse.json(data);
    
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "翻訳エラー" }, { status: 500 });
  }
}