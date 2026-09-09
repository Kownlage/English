import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request) {
  try {
    // 画面から送られてきた音声データを受け取る
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file) {
      return NextResponse.json({ error: "音声データが見つかりません" }, { status: 400 });
    }

    // 1. Whisper API で音声を英語のテキストに文字起こし
    const transcription = await openai.audio.transcriptions.create({
      file: file,
      model: 'whisper-1',
      language: 'en' // イギリス英語も含め英語全般に対応
    });

    const englishText = transcription.text;

    // 2. GPT-4o-mini で英語を日本語に瞬間翻訳
    const translation = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "あなたはイギリスの大学で学ぶ日本人留学生をサポートするアシスタントです。入力された英語の講義内容を、自然で分かりやすい日本語に翻訳してください。" },
        { role: "user", content: englishText }
      ]
    });

    const japaneseText = translation.choices[0].message.content;

    // 英語と日本語の両方を返す
    return NextResponse.json({
      english: englishText,
      japanese: japaneseText
    });
    
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "音声処理中にエラーが発生しました。" }, { status: 500 });
  }
}