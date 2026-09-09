import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request) {
  try {
    const body = await request.json();
    const { text, mode, originalPhrase } = body;

    let systemPrompt = "";
    let useJson = false;

    if (mode === "quiz") {
      // ▼ テスト採点用のプロンプト
      systemPrompt = `あなたは英語教師です。生徒が対話の穴埋め問題（正解フレーズ：「${originalPhrase}」）で「${text}」と回答しました。
文法的に正しく自然なら「✨ 正解！」、間違っていれば「惜しい！」や「不正解…」から始め、その後に簡潔な解説を添えてください。`;
    } else {
      // ▼ 新機能：間違い修正と対話文を含めた JSON を返すプロンプト
      useJson = true;
      systemPrompt = `あなたは日本人に英語を教えるプロの英語教師です。生徒が入力したフレーズ「${text}」について解説してください。
★重要ルール：生徒の入力にスペルミスや文法的な間違い、不自然さがある場合は、最もネイティブらしく自然な英語フレーズに修正してください。

必ず以下のJSON形式（キーは英語）で出力してください。

{
  "correctedPhrase": "修正済みの正しい英語フレーズ（間違いがない場合は入力されたフレーズをそのまま）",
  "explanation": "ネイティブのニュアンス、文脈、軽い文法解説を含めた分かりやすい解説文",
  "dialogue": "このフレーズが自然に使われる短い対話文（A: ... B: ... の形式。必ずcorrectedPhraseをそのままの形で含めること）",
  "dialogueJapanese": "その対話文の日本語訳"
}`;
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text }
      ],
      response_format: useJson ? { type: "json_object" } : undefined
    });

    if (useJson) {
      const data = JSON.parse(response.choices[0].message.content);
      return NextResponse.json(data);
    } else {
      return NextResponse.json({ result: response.choices[0].message.content });
    }
    
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "AIの処理中にエラーが発生しました。" }, { status: 500 });
  }
}