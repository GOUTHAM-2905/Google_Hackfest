import React, { createContext, useContext, useState, ReactNode } from 'react';
import type { ChatMessage } from '../types/chat';

interface ChatContextValue {
    messages: ChatMessage[];
    isLoading: boolean;
    addMessage: (msg: ChatMessage) => void;
    setLoading: (v: boolean) => void;
    clearMessages: () => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isLoading, setLoading] = useState(false);

    const addMessage = (msg: ChatMessage) => setMessages((prev) => [...prev, msg]);
    const clearMessages = () => setMessages([]);

    return (
        <ChatContext.Provider value={{ messages, isLoading, addMessage, setLoading, clearMessages }}>
            {children}
        </ChatContext.Provider>
    );
}

export function useChatContext() {
    const ctx = useContext(ChatContext);
    if (!ctx) throw new Error('useChatContext must be used within ChatProvider');
    return ctx;
}
