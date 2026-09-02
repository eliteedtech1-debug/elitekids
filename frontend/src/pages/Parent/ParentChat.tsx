import { useState, useEffect, useRef, useCallback } from 'react';
import { Send, ArrowLeft, MessageCircle } from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import apiClient from '@/lib/api/client';
import { t } from '@/lib/i18n';
import { API_CONFIG, STORAGE_KEYS } from '@/lib/utils/constants';

interface ChatMessage {
  id: string;
  child_admission_no: string;
  from_user_id: string;
  from_role: 'parent' | 'student' | 'teacher';
  text: string;
  read_at: string | null;
  created_at: string;
}

interface ParentChatProps {
  childAdmissionNo: string;
  childName: string;
  onBack: () => void;
}

export default function ParentChat({ childAdmissionNo, childName, onBack }: ParentChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [connected, setConnected] = useState(false);
  const [typing, setTyping] = useState(false);
  const [sending, setSending] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Load chat history
  useEffect(() => {
    apiClient.get(`/kids/chat/${childAdmissionNo}/messages?limit=100`)
      .then((res) => setMessages(res.data?.data || []))
      .catch(() => {})
      .finally(() => setTimeout(scrollToBottom, 100));
  }, [childAdmissionNo, scrollToBottom]);

  // Connect socket
  useEffect(() => {
    const token = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN) || '';
    const wsUrl = API_CONFIG.BASE_URL.replace(/^http/, 'ws').replace(/\/api\/?$/, '');

    const socket = io(wsUrl, {
      path: '/kids/chat',
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('join-chat', { child_admission_no: childAdmissionNo });
    });

    socket.on('disconnect', () => setConnected(false));

    socket.on('message', (msg: ChatMessage) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      setTimeout(scrollToBottom, 50);
    });

    socket.on('typing', ({ from_role }: { from_role: string }) => {
      if (from_role === 'student') {
        setTyping(true);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => setTyping(false), 3000);
      }
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, [childAdmissionNo, scrollToBottom]);

  const sendMessage = useCallback(() => {
    const text = input.trim();
    if (!text || !socketRef.current) return;
    setSending(true);
    socketRef.current.emit('send-message', {
      child_admission_no: childAdmissionNo,
      text,
    });
    setInput('');
    setTimeout(() => setSending(false), 300);
  }, [input, childAdmissionNo]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
    if (socketRef.current) {
      socketRef.current.emit('typing', { child_admission_no: childAdmissionNo });
    }
  }, [sendMessage, childAdmissionNo]);

  return (
    <div className="flex h-screen flex-col bg-gray-50">
      {/* Header */}
      <div className="flex items-center gap-3 border-b bg-white px-4 py-3 shadow-sm">
        <button onClick={onBack} className="rounded-full p-1 hover:bg-gray-100">
          <ArrowLeft className="h-5 w-5 text-gray-600" />
        </button>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 text-sm">
          💬
        </div>
        <div className="flex-1">
          <h2 className="text-sm font-extrabold text-gray-800">{childName}</h2>
          <p className="text-[10px] text-gray-400">
            {connected ? t('chat.connected') : t('chat.connecting')}
          </p>
        </div>
        <div className={`h-2 w-2 rounded-full ${connected ? 'bg-green-400' : 'bg-gray-300'}`} />
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <MessageCircle className="mb-3 h-12 w-12 text-gray-200" />
            <p className="text-sm font-bold text-gray-400">{t('chat.noMessages')}</p>
            <p className="text-xs text-gray-300">{t('chat.startConversation')}</p>
          </div>
        )}
        {messages.map((msg) => {
          const isParent = msg.from_role === 'parent';
          return (
            <div key={msg.id} className={`mb-3 flex ${isParent ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                isParent
                  ? 'bg-blue-500 text-white rounded-br-md'
                  : 'bg-white text-gray-800 shadow-sm rounded-bl-md'
              }`}>
                <p className="text-sm">{msg.text}</p>
                <p className={`mt-1 text-[10px] ${isParent ? 'text-blue-100' : 'text-gray-400'}`}>
                  {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {msg.read_at && isParent ? ' ✓✓' : ''}
                </p>
              </div>
            </div>
          );
        })}
        {typing && (
          <div className="mb-3 flex justify-start">
            <div className="rounded-2xl bg-white px-4 py-2.5 shadow-sm rounded-bl-md">
              <p className="text-sm text-gray-400 animate-pulse">{t('chat.typing')}</p>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t bg-white px-4 py-3">
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('chat.placeholder')}
            className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-blue-300 focus:outline-none"
            disabled={!connected}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || !connected || sending}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500 text-white shadow hover:bg-blue-600 disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
