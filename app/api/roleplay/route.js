import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request) {
  try {
    const body = await request.json();
    const { messages } = body; // 過去のチャット履歴をまるごと受け取ります

    // AIに「アメリカの大学のルームメイト」として振る舞うように指示
    const systemPrompt = {
      role: "system",
      content: `あなたはアメリカの大学に通うフレンドリーな学生で、ユーザーのルームメイトです。
ユーザーは英語を学んでいる留学生です。以下のルールで会話してください。
1. カジュアルで自然な日常会話（テキストメッセージやチャットのような短いテンポ）を心がける。
2. ユーザーが覚えたてのフレーズを使ってきたら、自然にリアクションする。
3. ユーザーの英語に少し不自然な点があっても会話の流れを優先するが、必要があれば「〇〇って言うともっと自然だよ！」と優しく1つだけ提案する。`
    };

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [systemPrompt, ...messages]
    });

    return NextResponse.json({ result: response.choices[0].message.content });
    
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "AIの処理中にエラーが発生しました。" }, { status: 500 });
  }
}