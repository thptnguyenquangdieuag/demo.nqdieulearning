import React, { useState, useEffect, useRef } from 'react';
import { Bot, Sparkles, Send, RefreshCw, BookOpen, Lightbulb, MessageSquare, ChevronDown, ChevronUp, X } from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: string;
}

interface AiTutorChatProps {
  courseTitle: string;
  lessonTitle: string;
  lessonDescription?: string;
  learningMode?: string;
  contentText?: string;
  initialExpanded?: boolean;
  quizContext?: {
    isQuizActive?: boolean;
    questionText?: string;
    options?: string[];
  };
}

export const AiTutorChat: React.FC<AiTutorChatProps> = ({
  courseTitle,
  lessonTitle,
  lessonDescription,
  learningMode = 'VIDEO',
  contentText,
  initialExpanded = false,
  quizContext,
}) => {
  const [isExpanded, setIsExpanded] = useState(initialExpanded);
  const [inputPrompt, setInputPrompt] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Initialize initial greeting when component mounts or lesson changes
  useEffect(() => {
    const greetingMsg: Message = {
      id: `init-${Date.now()}`,
      role: 'model',
      text: `Chào em! Thầy/Cô là **NQDieu AI** - Trợ lý học tập thông minh THPT Nguyễn Quang Diêu 🌸\n\nThầy Cô sẵn sàng đồng hành cùng em trong bài học **"${lessonTitle}"**.\n\nNếu em vướng mắc phần kiến thức nào hoặc cần gợi ý cách tự tư duy, hãy nhắn cho Thầy Cô nhé!💪`,
      timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages([greetingMsg]);
  }, [lessonTitle]);

  // Auto-scroll to bottom of chat when expanded
  useEffect(() => {
    if (isExpanded) {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading, isExpanded]);

  const handleSendMessage = async (textToSend?: string) => {
    const prompt = (textToSend || inputPrompt).trim();
    if (!prompt || isLoading) return;

    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: prompt,
      timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputPrompt('');
    setIsLoading(true);

    try {
      // Build previous message history for backend context
      const historyPayload = messages
        .filter((m) => !m.id.startsWith('init-'))
        .map((m) => ({
          role: m.role,
          text: m.text,
        }));

      const response = await fetch('/api/ai-tutor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          courseTitle,
          lessonTitle,
          lessonDescription,
          learningMode,
          contentText,
          quizContext,
          history: historyPayload,
        }),
      });

      const data = await response.json();

      if (data.success && data.reply) {
        const modelMsg: Message = {
          id: `m-${Date.now()}`,
          role: 'model',
          text: data.reply,
          timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages((prev) => [...prev, modelMsg]);
      } else {
        const errorMsg: Message = {
          id: `m-err-${Date.now()}`,
          role: 'model',
          text: `⚠️ ${data.message || 'Chưa thể kết nối với NQDieu AI lúc này. Vui lòng thử lại sau.'}`,
          timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages((prev) => [...prev, errorMsg]);
      }
    } catch (err: any) {
      console.error('Error contacting NQDieu AI:', err);
      const errorMsg: Message = {
        id: `m-err-${Date.now()}`,
        role: 'model',
        text: '⚠️ Có lỗi kết nối mạng. Em hãy kiểm tra đường truyền và thử lại nhé!',
        timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetChat = () => {
    const greetingMsg: Message = {
      id: `init-${Date.now()}`,
      role: 'model',
      text: `Thầy Cô NQDieu AI đã làm mới hội thoại. Em hãy gửi câu hỏi về bài **"${lessonTitle}"** nhé!`,
      timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages([greetingMsg]);
  };

  // Helper to format text with simple Markdown (bold, linebreaks, bullet points)
  const renderFormattedText = (text: string) => {
    return text.split('\n').map((line, lineIdx) => {
      const parts = line.split(/(\*\*.*?\*\*)/g);
      const formattedLine = parts.map((part, pIdx) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <strong key={pIdx} className="font-semibold text-slate-900">
              {part.slice(2, -2)}
            </strong>
          );
        }
        return part;
      });

      return (
        <React.Fragment key={lineIdx}>
          {line.startsWith('• ') || line.startsWith('- ') ? (
            <div className="flex items-start gap-1.5 my-0.5 pl-1">
              <span className="text-blue-500 font-bold">•</span>
              <span>{formattedLine.map((p, idx) => (typeof p === 'string' ? p.replace(/^[-•]\s*/, '') : p))}</span>
            </div>
          ) : (
            <p className={lineIdx > 0 ? 'mt-1.5' : ''}>{formattedLine}</p>
          )}
        </React.Fragment>
      );
    });
  };

  const suggestedQuestions = [
    '💡 Tóm tắt 3 ý trọng tâm bài này',
    '❓ Giải thích khái niệm chính bài học',
    '📝 Gợi ý phương pháp nhớ bài lâu',
  ];

  // Collapsed State: Show clean "Hỏi NQDieu AI" button card
  if (!isExpanded) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3.5 hover:shadow-md transition-all">
        <button
          type="button"
          onClick={() => setIsExpanded(true)}
          className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-sky-600 hover:from-blue-700 hover:to-indigo-700 active:scale-[0.99] text-white font-bold text-sm rounded-xl transition-all shadow-xs flex items-center justify-between gap-2.5 cursor-pointer group"
        >
          <div className="flex items-center gap-2.5">
            <div className="relative flex items-center justify-center w-8 h-8 rounded-lg bg-white/15 border border-white/20 shrink-0">
              <Bot className="w-4 h-4 text-amber-300 group-hover:scale-110 transition-transform" />
              <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
              </span>
            </div>
            <span className="tracking-wide flex items-center gap-1.5 text-sm font-bold">
              <span>Hỏi NQDieu AI</span>
              <Sparkles className="w-4 h-4 text-amber-300 shrink-0" />
            </span>
          </div>

          <div className="flex items-center gap-1 text-xs font-semibold text-blue-100 group-hover:text-white bg-white/10 px-2.5 py-1 rounded-lg border border-white/10 shrink-0">
            <span>Mở Chat</span>
            <ChevronDown className="w-4 h-4 group-hover:translate-y-0.5 transition-transform" />
          </div>
        </button>
      </div>
    );
  }

  // Expanded State: Show full chat box
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3 transition-all">
      {/* Box Header */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-100">
        <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
          <Bot className="w-4 h-4 text-blue-700" />
          <span>NQDieu AI - Trợ Lý Học Tập 24/7</span>
        </h4>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleResetChat}
            className="p-1 text-slate-400 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
            title="Làm mới cuộc trò chuyện với NQDieu AI"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setIsExpanded(false)}
            className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer flex items-center gap-1 text-xs font-semibold px-2"
            title="Thu nhỏ khung chat"
          >
            <ChevronUp className="w-4 h-4" />
            <span>Thu gọn</span>
          </button>
        </div>
      </div>

      {/* Current Context Banner */}
      <div className="bg-blue-50/70 border border-blue-100 rounded-xl px-3 py-1.5 text-xs text-blue-900 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 truncate">
          <BookOpen className="w-3.5 h-3.5 text-blue-600 shrink-0" />
          <span className="font-medium truncate">
            Đang hỗ trợ: <strong className="text-blue-800">{lessonTitle}</strong>
          </span>
        </div>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-full border border-emerald-200 shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
          Sẵn sàng 24/7
        </span>
      </div>

      {/* Chat Messages Box */}
      <div className="h-72 sm:h-80 overflow-y-auto p-3 space-y-3 bg-slate-50/60 rounded-xl border border-slate-200/80">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.role === 'model' && (
              <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5 shadow-xs">
                <Bot className="w-3.5 h-3.5" />
              </div>
            )}

            <div
              className={`max-w-[85%] rounded-2xl p-2.5 text-xs leading-relaxed shadow-xs ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-br-none font-medium'
                  : 'bg-white text-slate-800 border border-slate-200 rounded-bl-none'
              }`}
            >
              <div>{renderFormattedText(msg.text)}</div>
              <div
                className={`text-[9px] mt-1 text-right font-medium ${
                  msg.role === 'user' ? 'text-blue-200' : 'text-slate-400'
                }`}
              >
                {msg.timestamp}
              </div>
            </div>
          </div>
        ))}

        {/* Loading State */}
        {isLoading && (
          <div className="flex gap-2 justify-start">
            <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold shrink-0 shadow-xs animate-pulse">
              <Bot className="w-3.5 h-3.5" />
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-none p-2.5 shadow-xs flex items-center gap-2 text-slate-500 text-xs">
              <Sparkles className="w-3.5 h-3.5 text-amber-500 animate-spin" />
              <span>NQDieu AI đang soạn câu trả lời...</span>
            </div>
          </div>
        )}

        <div ref={chatBottomRef} />
      </div>

      {/* Suggested Questions Chips */}
      {messages.length <= 2 && !isLoading && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {suggestedQuestions.map((q, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleSendMessage(q.replace(/^[💡❓📝]\s*/, ''))}
              className="px-2 py-1 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 text-[11px] font-medium rounded-lg border border-slate-200 hover:border-blue-300 transition-all shrink-0 cursor-pointer"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Input Box */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSendMessage();
        }}
        className="flex items-center gap-2 pt-1"
      >
        <input
          type="text"
          value={inputPrompt}
          onChange={(e) => setInputPrompt(e.target.value)}
          placeholder="Hỏi NQDieu AI về bài học này..."
          disabled={isLoading}
          className="flex-1 px-3 py-2 bg-slate-50 focus:bg-white text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
        />
        <button
          type="submit"
          disabled={!inputPrompt.trim() || isLoading}
          className="px-3 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-40 text-white rounded-xl transition-all cursor-pointer disabled:cursor-not-allowed shadow-xs shrink-0 flex items-center gap-1 text-xs font-bold"
          title="Gửi câu hỏi"
        >
          <Send className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Gửi</span>
        </button>
      </form>

      <div className="text-[10px] text-slate-400 text-center">
        NQDieu AI gợi mở tư duy • Không làm hộ toàn bộ bài tập
      </div>
    </div>
  );
};

