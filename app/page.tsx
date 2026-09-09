"use client";

import { useState, useEffect, useRef } from "react";
import { collection, addDoc, onSnapshot, query, orderBy, doc, updateDoc, deleteDoc } from "firebase/firestore";
import { db } from "../lib/firebase";

export default function Home() {
  const [appMode, setAppMode] = useState<"lecture" | "dictionary">("lecture");

  /* --- 講義サポート用の状態 --- */
  const [isRecording, setIsRecording] = useState(false);
  const [interimText, setInterimText] = useState("");
  const [transcripts, setTranscripts] = useState<{ id: number, chapterId: number, en: string, ja: string, isTranslating: boolean }[]>([]);
  const [savingWord, setSavingWord] = useState<string | null>(null);
  
  const [chapters, setChapters] = useState<{ id: number, title: string }[]>([{ id: Date.now(), title: "章 1 (はじめに)" }]);
  const [autoChapter, setAutoChapter] = useState(false);
  
  /* --- 過去の講義（レジュメ）管理用の状態 --- */
  const [savedLectures, setSavedLectures] = useState<any[]>([]);
  const [viewingLecture, setViewingLecture] = useState<any | null>(null);

  const [hoverData, setHoverData] = useState<{ word: string, meaning: string, x: number, y: number } | null>(null);
  const hoverTimerRef = useRef<any>(null);

  const recognitionRef = useRef<any>(null);
  const isRecordingRef = useRef(false);
  const recordingChapterIdRef = useRef<number>(chapters[0].id);
  const autoChapterRef = useRef(false);
  const blockTimerRef = useRef<any>(null);
  const activeBlockIdRef = useRef<number | null>(null);
  const activeBlockEnRef = useRef<string>("");
  const previousBlockEnRef = useRef<string>("");
  const hasMovedToNewChapterRef = useRef<boolean>(false);
  
  const scrollBottomRef = useRef<HTMLDivElement>(null);

  /* --- 単語帳＆テストモード用の状態 --- */
  const [savedPhrases, setSavedPhrases] = useState<any[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"today" | "date" | "all">("today");
  const [selectedDate, setSelectedDate] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isQuizMode, setIsQuizMode] = useState(false);
  const [quizList, setQuizList] = useState<any[]>([]);
  const [currentQuizIndex, setCurrentQuizIndex] = useState(0);
  const [userAnswer, setUserAnswer] = useState("");
  const [quizFeedback, setQuizFeedback] = useState("");
  const [isChecking, setIsChecking] = useState(false);

  const getTodayString = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  useEffect(() => {
    setSelectedDate(getTodayString());
    const qPhrases = query(collection(db, "phrases"), orderBy("createdAt", "desc"));
    const unsubPhrases = onSnapshot(qPhrases, (snapshot) => {
      setSavedPhrases(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    const qLectures = query(collection(db, "lectures"), orderBy("createdAt", "desc"));
    const unsubLectures = onSnapshot(qLectures, (snapshot) => {
      setSavedLectures(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => { unsubPhrases(); unsubLectures(); };
  }, []);

  useEffect(() => {
    if (scrollBottomRef.current && !viewingLecture) {
      scrollBottomRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [transcripts, interimText, viewingLecture]);

  const toggleAutoChapter = () => {
    const newVal = !autoChapter;
    setAutoChapter(newVal);
    autoChapterRef.current = newVal;
  };

  const addNewChapter = (titleOverride?: string) => {
    const newId = Date.now();
    const newTitle = titleOverride || `章 ${chapters.length + 1}`;
    setChapters(prev => [...prev, { id: newId, title: newTitle }]);
    recordingChapterIdRef.current = newId;
    
    if (blockTimerRef.current) clearTimeout(blockTimerRef.current);
    activeBlockIdRef.current = null;
    activeBlockEnRef.current = "";
    hasMovedToNewChapterRef.current = false;
  };

  const saveCurrentLecture = async () => {
    if (transcripts.length === 0) return alert("保存する内容がありません。");
    const title = window.prompt("この講義のタイトルを入力してください", "新しい講義ノート");
    if (!title) return;

    try {
      await addDoc(collection(db, "lectures"), {
        title,
        dateString: getTodayString(),
        createdAt: new Date(),
        chapters,
        transcripts
      });
      alert("講義をレジュメとして保存しました！");
      const initialChapterId = Date.now();
      setChapters([{ id: initialChapterId, title: "章 1 (はじめに)" }]);
      setTranscripts([]);
      recordingChapterIdRef.current = initialChapterId;
      setInterimText("");
    } catch (error) {
      alert("保存に失敗しました。");
    }
  };

  const deleteLecture = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!window.confirm("この講義ノートを完全に削除しますか？\n(この操作は取り消せません)")) return;
    try {
      await deleteDoc(doc(db, "lectures", id));
      if (viewingLecture && viewingLecture.id === id) {
        setViewingLecture(null);
      }
    } catch (error) {
      alert("削除に失敗しました。");
    }
  };

  const handlePrintPDF = () => {
    window.print();
  };

  const startRecording = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return alert("お使いのブラウザは対応していません。SafariかChromeをご利用ください。");

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-GB';

    recognition.onstart = () => {
      isRecordingRef.current = true;
      setIsRecording(true);
    };

    recognition.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          handleFinalText(event.results[i][0].transcript);
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      setInterimText(interim);
    };

    recognition.onend = () => {
      if (isRecordingRef.current) recognition.start();
    };

    recognition.start();
    recognitionRef.current = recognition;
  };

  const stopRecording = () => {
    isRecordingRef.current = false;
    setIsRecording(false);
    if (recognitionRef.current) recognitionRef.current.stop();
    setInterimText("");
    if (blockTimerRef.current) clearTimeout(blockTimerRef.current);
    activeBlockIdRef.current = null;
    activeBlockEnRef.current = "";
  };

  const handleFinalText = async (newText: string) => {
    if (!newText.trim()) return;

    if (!activeBlockIdRef.current) {
      activeBlockIdRef.current = Date.now();
      activeBlockEnRef.current = "";
      hasMovedToNewChapterRef.current = false;
      const targetChapterId = recordingChapterIdRef.current;
      setTranscripts(prev => [...prev, { id: activeBlockIdRef.current!, chapterId: targetChapterId, en: "", ja: "翻訳中...", isTranslating: true }]);
    }

    const currentId = activeBlockIdRef.current;
    activeBlockEnRef.current = activeBlockEnRef.current ? activeBlockEnRef.current + " " + newText.trim() : newText.trim();
    const textToTranslate = activeBlockEnRef.current;

    setTranscripts(prev => prev.map(t =>
      t.id === currentId ? { ...t, en: textToTranslate, isTranslating: true } : t
    ));

    if (blockTimerRef.current) clearTimeout(blockTimerRef.current);
    blockTimerRef.current = setTimeout(() => {
      previousBlockEnRef.current = activeBlockEnRef.current;
      activeBlockIdRef.current = null;
    }, 4000);

    try {
      const response = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: textToTranslate, context: previousBlockEnRef.current }),
      });
      const data = await response.json();
      
      if (data.japanese) {
        if (data.isNewChapter && autoChapterRef.current && !hasMovedToNewChapterRef.current) {
          hasMovedToNewChapterRef.current = true;
          const newId = Date.now();
          setChapters(prev => [...prev, { id: newId, title: data.newChapterTitle || "新しいトピック" }]);
          recordingChapterIdRef.current = newId;
          
          setTranscripts(prev => prev.map(t => 
            t.id === currentId ? { ...t, chapterId: newId, ja: data.japanese, isTranslating: false } : t
          ));
        } else {
          setTranscripts(prev => prev.map(t => 
            t.id === currentId ? { ...t, ja: data.japanese, isTranslating: false } : t
          ));
        }
      }
    } catch (error) {
      setTranscripts(prev => prev.map(t => 
        t.id === currentId ? { ...t, ja: "翻訳エラー", isTranslating: false } : t
      ));
    }
  };

  const handleWordMouseEnter = (e: React.MouseEvent, word: string) => {
    const cleanWord = word.replace(/[^a-zA-Z0-9'-]/g, '');
    if (!cleanWord) return;
    const x = e.clientX;
    const y = e.clientY - 30; // ポップアップの位置を少し下げて調整

    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);

    hoverTimerRef.current = setTimeout(async () => {
      setHoverData({ word: cleanWord, meaning: "...", x, y });
      try {
        const res = await fetch("/api/hover", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ word: cleanWord }),
        });
        const data = await res.json();
        if (data.meaning) {
          setHoverData({ word: cleanWord, meaning: data.meaning, x, y });
        }
      } catch (err) {
        setHoverData(null);
      }
    }, 600);
  };

  const handleWordMouseLeave = () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    setHoverData(null);
  };

  const handleWordClick = async (word: string) => {
    const cleanWord = word.replace(/[^a-zA-Z0-9'-]/g, '');
    if (!cleanWord) return;
    setSavingWord(cleanWord);
    handleWordMouseLeave();

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: cleanWord }),
      });
      const data = await response.json();
      if (data.explanation) {
        await addDoc(collection(db, "phrases"), {
          originalText: data.correctedPhrase || cleanWord,
          explanation: data.explanation,
          dialogue: data.dialogue || "",
          dialogueJapanese: data.dialogueJapanese || "",
          createdAt: new Date(),
          dateString: getTodayString(),
          isStarred: false,
          correctCount: 0,
          incorrectCount: 0
        });
      }
    } finally {
      setSavingWord(null);
    }
  };

  const toggleStar = async (e: React.MouseEvent, id: string, currentStatus: boolean) => {
    e.stopPropagation();
    await updateDoc(doc(db, "phrases", id), { isStarred: !currentStatus });
  };
  const startQuiz = (type: "all" | "date") => {
    if (displayPhrases.length === 0) return alert("テスト対象がありません");
    setQuizList([...displayPhrases].sort(() => 0.5 - Math.random()).slice(0, 10));
    setCurrentQuizIndex(0);
    setUserAnswer("");
    setQuizFeedback("");
    setIsQuizMode(true);
  };
  const checkQuizAnswer = async () => {
    if (!userAnswer) return;
    setIsChecking(true);
    setQuizFeedback("");
    const currentPhrase = quizList[currentQuizIndex];
    try {
      const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: userAnswer, mode: "quiz", originalPhrase: currentPhrase.originalText }) });
      const data = await response.json();
      if (data.result) {
        setQuizFeedback(data.result);
        const isCorrect = data.result.includes("正解");
        await updateDoc(doc(db, "phrases", currentPhrase.id), { correctCount: (currentPhrase.correctCount || 0) + (isCorrect ? 1 : 0), incorrectCount: (currentPhrase.incorrectCount || 0) + (!isCorrect ? 1 : 0) });
      }
    } finally { setIsChecking(false); }
  };
  const nextQuiz = () => {
    if (currentQuizIndex < quizList.length - 1) { setCurrentQuizIndex(currentQuizIndex + 1); setUserAnswer(""); setQuizFeedback(""); } else { alert("全問終了です！"); setIsQuizMode(false); }
  };

  const displayPhrases = savedPhrases.filter(p => {
    if (viewMode === "today" && p.dateString !== getTodayString()) return false;
    if (viewMode === "date" && p.dateString !== selectedDate) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return p.originalText.toLowerCase().includes(q) || (p.explanation && p.explanation.toLowerCase().includes(q)) || (p.dialogueJapanese && p.dialogueJapanese.includes(searchQuery));
    }
    return true;
  }).sort((a, b) => {
    if (a.isStarred && !b.isStarred) return -1;
    if (!a.isStarred && b.isStarred) return 1;
    return 0;
  });

  const availableDates = Array.from(new Set(savedPhrases.map(p => p.dateString))).filter(Boolean);
  const displayChapters = viewingLecture ? viewingLecture.chapters : chapters;
  const displayTranscripts = viewingLecture ? viewingLecture.transcripts : transcripts;

  return (
    <main className="p-2 md:p-6 max-w-7xl mx-auto text-gray-900 min-h-screen flex flex-col font-sans">
      
      {hoverData && (
        <div 
          className="fixed z-50 bg-gray-800 text-white px-3 py-1.5 rounded shadow-lg text-xs md:text-sm font-bold pointer-events-none transform -translate-x-1/2 -translate-y-full"
          style={{ left: hoverData.x, top: hoverData.y }}
        >
          {hoverData.meaning}
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-800"></div>
        </div>
      )}

      {/* ヘッダー全体を少し小さく・薄く調整 */}
      <h1 className="text-xl md:text-2xl font-bold text-slate-800 mb-4 text-center tracking-tight print:hidden">
        UK Class Assistant 🇬🇧
      </h1>
      <div className="flex w-full mb-4 bg-slate-200 rounded-lg p-1 shadow-inner print:hidden">
        <button onClick={() => setAppMode("lecture")} className={`flex-1 py-2 text-sm md:text-base font-bold rounded transition-colors ${appMode === "lecture" ? "bg-white shadow text-blue-700" : "text-slate-600 hover:text-slate-800"}`}>🎙️ 講義レジュメ</button>
        <button onClick={() => setAppMode("dictionary")} className={`flex-1 py-2 text-sm md:text-base font-bold rounded transition-colors ${appMode === "dictionary" ? "bg-white shadow text-indigo-700" : "text-slate-600 hover:text-slate-800"}`}>📚 単語帳＆復習</button>
      </div>

      {appMode === "lecture" ? (
        <div className="flex-1 flex flex-col md:flex-row gap-4 items-start">
          
          {/* 左サイドバー */}
          <div className="w-full md:w-1/4 bg-white rounded-xl shadow-sm border border-slate-200 p-3 md:sticky md:top-4 print:hidden">
            <button onClick={() => setViewingLecture(null)} className={`w-full font-bold py-2 rounded-lg mb-3 text-sm transition-colors border shadow-sm ${!viewingLecture ? "bg-blue-600 text-white border-blue-700" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>
              🔴 現在の講義
            </button>

            {!viewingLecture && (
              <div className="flex items-center justify-between mb-3 bg-slate-50 p-2 rounded-lg border border-slate-200">
                <span className="text-xs font-bold text-slate-600">✨ AI自動章分け</span>
                <button onClick={toggleAutoChapter} className={`w-10 h-5 rounded-full transition-colors relative shadow-inner ${autoChapter ? 'bg-blue-500' : 'bg-slate-300'}`}>
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all shadow-sm ${autoChapter ? 'left-5' : 'left-0.5'}`} />
                </button>
              </div>
            )}

            <h3 className="font-bold text-slate-700 mb-2 text-xs border-b border-slate-100 pb-1 mt-4">📁 過去のレジュメ</h3>
            <ul className="space-y-1 max-h-[40vh] overflow-y-auto pr-1">
              {savedLectures.map(lec => (
                <li 
                  key={lec.id}
                  onClick={() => setViewingLecture(lec)}
                  className={`p-2 rounded-lg cursor-pointer transition-colors border text-xs flex justify-between items-center group ${
                    viewingLecture?.id === lec.id ? "bg-teal-50 border-teal-200 text-teal-800 font-bold" : "bg-white border-transparent text-slate-600 hover:bg-slate-50 border-slate-100"
                  }`}
                >
                  <div className="overflow-hidden">
                    <p className="truncate pl-1">{lec.title}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5 pl-1">{lec.dateString}</p>
                  </div>
                  <button 
                    onClick={(e) => deleteLecture(e, lec.id)}
                    className="text-slate-300 hover:text-red-500 p-1.5 transition-colors"
                    title="この講義を削除"
                  >
                    🗑️
                  </button>
                </li>
              ))}
              {savedLectures.length === 0 && <p className="text-[10px] text-slate-400">保存された講義はありません。</p>}
            </ul>
          </div>

          {/* 右メインエリア */}
          <div className="w-full md:w-3/4 flex flex-col gap-4">
            
            <div className="bg-white p-3 md:p-4 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between gap-3 print:hidden">
              {!viewingLecture ? (
                <>
                  <div className="flex items-center gap-3">
                    <button onClick={isRecording ? stopRecording : startRecording} className={`w-12 h-12 rounded-full flex items-center justify-center text-xl shadow-md transition-all ${isRecording ? "bg-red-500 text-white animate-pulse" : "bg-blue-600 text-white hover:bg-blue-700"}`}>
                      {isRecording ? "⏹️" : "🎙️"}
                    </button>
                    <div>
                      <p className="text-slate-800 font-bold text-sm">講義の録音</p>
                      <p className="text-slate-500 text-[10px] mt-0.5">{isRecording ? "解析中..." : "タップして開始"}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => addNewChapter()} className="bg-slate-100 text-slate-700 font-bold py-1.5 px-3 rounded-md text-xs border border-slate-200 hover:bg-slate-200">➕ 章追加</button>
                    <button onClick={saveCurrentLecture} className="bg-teal-500 text-white font-bold py-1.5 px-3 rounded-md text-xs hover:bg-teal-600 shadow-sm">💾 保存終了</button>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-between w-full">
                  <div>
                    <p className="text-teal-700 font-bold text-base">{viewingLecture.title}</p>
                    <p className="text-slate-500 text-xs">{viewingLecture.dateString}</p>
                  </div>
                  <button onClick={handlePrintPDF} className="bg-indigo-500 text-white font-bold py-1.5 px-4 rounded-md hover:bg-indigo-600 shadow-sm text-xs flex items-center gap-2">
                    📄 PDF出力
                  </button>
                </div>
              )}
            </div>

            {savingWord && <p className="text-green-600 font-bold text-xs bg-green-50 px-3 py-1.5 rounded-full w-fit print:hidden">「{savingWord}」を保存しました！</p>}

            <div className="flex-1 overflow-y-auto pb-32 print:overflow-visible print:h-auto print:block">
              {displayChapters.map((chapter: any) => {
                const chapterTranscripts = displayTranscripts.filter((t: any) => t.chapterId === chapter.id);
                const isRecordingThisChapter = !viewingLecture && recordingChapterIdRef.current === chapter.id;

                return (
                  <div key={chapter.id} className="mb-6 print:mb-4">
                    {/* ▼ 見出しサイズと余白を縮小 ▼ */}
                    <h2 className="text-base md:text-lg font-bold bg-slate-100 text-slate-800 px-3 py-2 rounded-lg mb-2 border border-slate-200 print:bg-transparent print:border-b-2 print:border-black print:rounded-none print:p-1">
                      {chapter.title}
                    </h2>

                    <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden print:shadow-none print:border-none">
                      {chapterTranscripts.map((t: any) => (
                        // ▼ 各ブロックのパディング（p-4 -> px-4 py-2）を減らして高さを圧縮 ▼
                        <div key={t.id} className="px-3 py-2 md:px-4 md:py-2.5 border-b border-slate-200 last:border-b-0 hover:bg-slate-50 transition-colors print:border-b print:border-gray-300">
                          {/* ▼ 英語の文字サイズを縮小・行間を詰める（leading-snug） ▼ */}
                          <div className="text-base font-semibold text-slate-800 leading-snug mb-1">
                            {t.en.split(' ').map((word: string, i: number) => (
                              <span 
                                key={i} 
                                onClick={() => !viewingLecture && handleWordClick(word)}
                                onMouseEnter={(e) => handleWordMouseEnter(e, word)}
                                onMouseLeave={handleWordMouseLeave}
                                className={`${!viewingLecture ? "cursor-pointer" : ""} hover:bg-yellow-200 rounded px-0.5 transition-colors`}
                              >
                                {word}{' '}
                              </span>
                            ))}
                          </div>
                          {/* ▼ 日本語の文字サイズを縮小 ▼ */}
                          <div className={`text-sm font-medium leading-snug ${t.isTranslating ? 'text-slate-400 animate-pulse' : 'text-slate-600 print:text-black'}`}>
                            {t.ja}
                          </div>
                        </div>
                      ))}

                      {interimText && isRecordingThisChapter && (
                        <div className="px-3 py-2 md:px-4 md:py-2.5 bg-blue-50 opacity-80 border-t border-slate-200">
                          <p className="text-base font-semibold text-slate-600 italic leading-snug">{interimText}</p>
                          <p className="text-[10px] text-blue-500 mt-1 font-bold animate-pulse">聞き取り中...</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={scrollBottomRef} className="h-20 print:hidden" />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col">
          {isQuizMode ? (
             <div className="bg-white p-6 md:p-8 rounded-xl shadow-sm border border-indigo-200">
               <div className="flex justify-between items-center mb-6">
                 <h2 className="text-xl md:text-2xl font-bold text-indigo-700">復習テスト ({currentQuizIndex + 1} / {quizList.length})</h2>
                 <button onClick={() => setIsQuizMode(false)} className="text-slate-500 hover:text-slate-700 underline text-sm">終了</button>
               </div>
               
               <p className="font-bold text-slate-700 mb-2 text-sm">文脈に合わせて空欄を埋めてください：</p>
               <div className="bg-indigo-50 p-4 md:p-6 rounded-lg mb-6 border border-indigo-100">
                 {(quizList[currentQuizIndex].dialogueJapanese || quizList[currentQuizIndex].exampleJapanese) && <p className="text-slate-600 mb-2 font-bold text-sm">💡 {quizList[currentQuizIndex].dialogueJapanese || quizList[currentQuizIndex].exampleJapanese}</p>}
                 <p className="text-lg md:text-xl font-bold text-slate-800 leading-relaxed whitespace-pre-wrap">
                   {(quizList[currentQuizIndex].dialogue || quizList[currentQuizIndex].example || quizList[currentQuizIndex].explanation).replace(new RegExp(quizList[currentQuizIndex].originalText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '【 ＿＿＿ 】')}
                 </p>
               </div>
     
               {!quizFeedback ? (
                 <div className="space-y-3">
                   <input
                     type="text"
                     className="w-full p-3 bg-white text-slate-900 border border-indigo-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-base font-bold shadow-sm"
                     placeholder="英語を入力..."
                     value={userAnswer}
                     onChange={(e) => setUserAnswer(e.target.value)}
                     onKeyDown={(e) => { if (e.key === 'Enter') checkQuizAnswer(); }}
                   />
                   <button onClick={checkQuizAnswer} disabled={isChecking || !userAnswer} className="w-full bg-indigo-600 text-white font-bold py-3 rounded-lg hover:bg-indigo-700 disabled:bg-slate-400 text-base shadow-sm transition-colors">
                     {isChecking ? "判定中..." : "回答を判定する！"}
                   </button>
                 </div>
               ) : (
                 <div className="animate-fade-in space-y-4">
                   <div className="p-4 md:p-5 bg-slate-50 border border-slate-200 rounded-lg">
                     <p className="text-slate-800 whitespace-pre-wrap text-sm md:text-base">{quizFeedback}</p>
                     <div className="mt-4 pt-3 border-t border-slate-200">
                       <p className="text-slate-500 mb-1 text-xs">正解：</p>
                       <p className="font-bold text-indigo-700 text-lg">{quizList[currentQuizIndex].originalText}</p>
                     </div>
                   </div>
                   <button onClick={nextQuiz} className="w-full bg-teal-500 text-white font-bold py-3 rounded-lg hover:bg-teal-600 text-base shadow-sm transition-colors">
                     {currentQuizIndex < quizList.length - 1 ? "次の問題へ" : "結果を見る"}
                   </button>
                 </div>
               )}
             </div>
          ) : (
            <>
              <div className="bg-white p-4 md:p-5 rounded-xl shadow-sm border border-slate-200 mb-6">
                <input type="text" className="w-full p-3 bg-slate-50 text-slate-900 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 font-bold shadow-inner text-sm mb-3" placeholder="🔍 保存した単語や意味を検索..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex gap-2">
                    <button onClick={() => setViewMode("today")} className={`px-4 py-2 text-xs md:text-sm rounded-md font-bold transition-colors ${viewMode === "today" ? "bg-indigo-600 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>今日</button>
                    <button onClick={() => setViewMode("all")} className={`px-4 py-2 text-xs md:text-sm rounded-md font-bold transition-colors ${viewMode === "all" ? "bg-indigo-600 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>すべて</button>
                  </div>
                  <button onClick={() => startQuiz("date")} className="bg-teal-500 text-white font-bold py-2 px-4 rounded-md hover:bg-teal-600 text-xs md:text-sm shadow-sm transition-colors flex items-center gap-1">📝 10問テスト</button>
                </div>
              </div>
              
              <div className="space-y-3">
                {displayPhrases.map((phrase) => (
                  <div key={phrase.id} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden p-4">
                    <p className="font-bold text-lg text-slate-800">{phrase.originalText}</p>
                    <p className="text-slate-600 text-sm mt-1">{phrase.explanation}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </main>
  );
}