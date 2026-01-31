"use client";

import { useChat } from "ai/react";
import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { Send, Menu, FileText, X, Bot, User, BookOpen, Plus, Trash2, MessageSquare, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { useRouter, useParams } from "next/navigation";

interface Conversation {
    id: string;
    title: string;
    updated_at: string;
}

export default function ChatPage() {
    const router = useRouter();
    const params = useParams();
    const conversationId = params.id as string;

    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [showCitations, setShowCitations] = useState(false);
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [currentTitle, setCurrentTitle] = useState("New Chat");
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [conversationToDelete, setConversationToDelete] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Protected route check
    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (!session) router.push("/login");
        });
    }, [router]);

    // Load conversations list
    useEffect(() => {
        loadConversations();
    }, []);

    // Load conversation messages
    useEffect(() => {
        if (conversationId) {
            loadConversation();
        }
    }, [conversationId]);

    async function loadConversations() {
        const res = await fetch('/api/conversations');
        if (res.ok) {
            const data = await res.json();
            setConversations(data);
        }
    }

    async function loadConversation() {
        const res = await fetch(`/api/conversations/${conversationId}`);
        if (res.ok) {
            const data = await res.json();
            setCurrentTitle(data.title);
            // Set initial messages from database
            if (data.messages && data.messages.length > 0) {
                setMessages(data.messages.map((m: any) => ({
                    id: m.id,
                    role: m.role,
                    content: m.content
                })));
            }
        }
    }

    async function createNewChat() {
        const res = await fetch('/api/conversations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'New Chat' })
        });
        if (res.ok) {
            const conversation = await res.json();
            router.push(`/chat/${conversation.id}`);
            loadConversations();
        }
    }

    function openDeleteModal(id: string) {
        setConversationToDelete(id);
        setDeleteModalOpen(true);
    }

    async function confirmDelete() {
        if (!conversationToDelete) return;

        const res = await fetch(`/api/conversations/${conversationToDelete}`, {
            method: 'DELETE'
        });
        if (res.ok) {
            loadConversations();
            if (conversationToDelete === conversationId) {
                router.push('/chat');
            }
        }
        setDeleteModalOpen(false);
        setConversationToDelete(null);
    }

    function cancelDelete() {
        setDeleteModalOpen(false);
        setConversationToDelete(null);
    }

    // Initialize useChat
    const { messages, input, handleInputChange, handleSubmit, isLoading, error, data, setMessages } = useChat({
        api: "/api/chat/send",
        body: {
            conversationId
        },
        onFinish: async (message) => {
            // Save messages to database
            await fetch(`/api/conversations/${conversationId}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    role: 'assistant',
                    content: message.content
                })
            });

        },
        onError: (err) => {
            console.error("Chat error:", err);
        }
    });

    // Override handleSubmit to save user message
    const customHandleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim()) return;

        // Save user message to database
        await fetch(`/api/conversations/${conversationId}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                role: 'user',
                content: input
            })
        });

        // Auto-generate title from first message if it's a new chat
        if (messages.length === 0) {
            const firstUserMsg = input.substring(0, 30) + (input.length > 30 ? '...' : '');

            // Update title in DB
            fetch(`/api/conversations/${conversationId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: firstUserMsg })
            }).then(() => {
                setCurrentTitle(firstUserMsg);
                loadConversations();
            });
        }

        // Call original submit
        handleSubmit(e);
    };

    // Auto-scroll
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // Extract citations
    const latestData = data && data.length > 0 ? data[data.length - 1] : null;
    const citations = (latestData as any)?.citations || [];

    return (
        <div className="flex h-screen bg-gray-50 overflow-hidden">
            {/* Sidebar (Conversations) */}
            <aside
                className={cn(
                    "fixed inset-y-0 left-0 z-40 w-64 bg-white border-r transform transition-transform duration-200 ease-in-out md:relative md:translate-x-0 flex flex-col h-screen",
                    sidebarOpen ? "translate-x-0" : "-translate-x-full"
                )}
            >
                <div className="p-4 border-b flex justify-between items-center bg-white">
                    <h2 className="font-semibold text-lg flex items-center gap-2 text-gray-900">
                        <Bot className="w-5 h-5 text-indigo-600" />
                        Kai AI Chat
                    </h2>
                    <button onClick={() => setSidebarOpen(false)} className="md:hidden text-gray-500 hover:text-gray-700">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-4">
                    <button
                        onClick={createNewChat}
                        className="w-full flex items-center justify-center gap-2 p-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition font-medium"
                    >
                        <Plus className="w-4 h-4" />
                        New Chat
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-2">
                    <p className="text-xs text-gray-500 uppercase font-bold mb-2 px-2">Chat History</p>
                    {conversations.map((conv) => (
                        <div
                            key={conv.id}
                            className={cn(
                                "group flex items-center gap-2 p-2 rounded-lg mb-1 cursor-pointer hover:bg-gray-100 transition",
                                conv.id === conversationId ? "bg-indigo-50" : ""
                            )}
                        >
                            <MessageSquare className="w-4 h-4 text-gray-400 shrink-0" />
                            <button
                                onClick={() => router.push(`/chat/${conv.id}`)}
                                className="flex-1 text-left text-sm text-gray-700 truncate"
                            >
                                {conv.title}
                            </button>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    openDeleteModal(conv.id);
                                }}
                                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 rounded text-red-600 transition"
                            >
                                <Trash2 className="w-3 h-3" />
                            </button>
                        </div>
                    ))}
                </div>

                <div className="p-4 border-t">
                    <button
                        onClick={() => router.push('/documents')}
                        className="w-full py-2 px-4 border border-gray-300 rounded hover:bg-gray-50 text-sm font-semibold text-gray-900"
                    >
                        Manage Documents
                    </button>
                </div>
            </aside>

            {/* Main Chat Area */}
            <main className="flex-1 flex flex-col w-full relative bg-white">
                <header className="h-16 bg-white border-b flex items-center px-4 justify-between shrink-0">
                    <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 md:hidden text-gray-900 hover:bg-gray-100 rounded-md">
                        <Menu className="w-5 h-5 text-gray-900" />
                    </button>
                    <span className="font-bold text-gray-900 truncate">{currentTitle}</span>
                    <button
                        onClick={() => setShowCitations(!showCitations)}
                        className={cn(
                            "p-2 rounded-lg transition-colors relative",
                            showCitations ? "bg-indigo-100 text-indigo-700" : "hover:bg-gray-100 text-gray-900"
                        )}
                    >
                        <BookOpen className="w-5 h-5" />
                        {citations.length > 0 && (
                            <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
                        )}
                    </button>
                </header>

                <div className="flex-1 overflow-y-auto p-4 space-y-6">
                    {messages.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-full text-gray-500">
                            <Bot className="w-12 h-12 mb-4 opacity-40" />
                            <p className="text-gray-900 font-medium">Ask a question about your documents...</p>
                        </div>
                    )}

                    {messages.map((m) => (
                        <div key={m.id} className={cn("flex gap-4 max-w-3xl mx-auto", m.role === 'user' ? "flex-row-reverse" : "")}>
                            <div
                                className={cn(
                                    "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                                    m.role === 'user' ? "bg-gray-800 text-white" : "bg-indigo-600 text-white"
                                )}
                            >
                                {m.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                            </div>

                            <div
                                className={cn(
                                    "rounded-2xl px-5 py-3 text-sm leading-relaxed shadow-sm max-w-[85%]",
                                    m.role === 'user'
                                        ? "bg-gray-800 text-white rounded-tr-none"
                                        : "bg-white text-gray-800 border border-gray-100 rounded-tl-none"
                                )}
                            >
                                <ReactMarkdown>{m.content}</ReactMarkdown>
                            </div>
                        </div>
                    ))}

                    {isLoading && (
                        <div className="flex gap-4 max-w-3xl mx-auto">
                            <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0">
                                <Bot className="w-4 h-4" />
                            </div>
                            <div className="bg-white border p-4 rounded-2xl rounded-tl-none w-16">
                                <div className="flex gap-1">
                                    <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" />
                                    <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce delay-100" />
                                    <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce delay-200" />
                                </div>
                            </div>
                        </div>
                    )}
                    {error && (
                        <div className="max-w-3xl mx-auto mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                            <span className="font-bold">Error:</span> {error.message}
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                <div className="p-4 bg-white border-t">
                    <form onSubmit={customHandleSubmit} className="max-w-3xl mx-auto flex gap-2">
                        <input
                            className="flex-1 bg-white border-2 border-gray-300 rounded-full px-5 py-3 focus:ring-2 focus:ring-indigo-500 outline-none transition text-black placeholder:text-gray-500 font-medium"
                            value={input}
                            onChange={handleInputChange}
                            placeholder="Ask anything about your documents..."
                        />
                        <button
                            type="submit"
                            disabled={isLoading || !input.trim()}
                            className="w-12 h-12 flex items-center justify-center bg-indigo-600 hover:bg-indigo-700 text-white rounded-full transition disabled:opacity-50"
                        >
                            <Send className="w-5 h-5" />
                        </button>
                    </form>
                </div>
            </main>

            {/* Citations Panel */}
            {showCitations && (
                <div className="absolute inset-0 z-50 pointer-events-none overflow-hidden flex flex-col justify-end md:flex-row md:justify-end">
                    <div className="absolute inset-0 bg-black/20 md:hidden pointer-events-auto" onClick={() => setShowCitations(false)} />

                    <div className="w-full md:w-96 bg-white shadow-2xl flex flex-col h-[70vh] md:h-full pointer-events-auto rounded-t-2xl md:rounded-none transform transition-transform">
                        <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                            <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                                <BookOpen className="w-4 h-4" /> Citations
                            </h3>
                            <button onClick={() => setShowCitations(false)}>
                                <X className="w-5 h-5 text-gray-500" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/50">
                            {citations.length === 0 ? (
                                <p className="text-gray-700 text-sm text-center mt-10">No citations available.</p>
                            ) : (
                                citations.map((cite: any, i: number) => (
                                    <div key={i} className="bg-white p-4 rounded-lg border shadow-sm text-sm">
                                        <div className="flex items-center gap-2 text-indigo-600 font-medium mb-1">
                                            <FileText className="w-3 h-3" />
                                            <span>Page {cite.page_number}</span>
                                        </div>
                                        <p className="text-gray-600 leading-relaxed text-xs">
                                            "...{cite.content.substring(0, 150)}..."
                                        </p>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deleteModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-in zoom-in-95 duration-200">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                                <AlertTriangle className="w-6 h-6 text-red-600" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-gray-900">Delete Chat History?</h3>
                                <p className="text-sm text-gray-500">This action cannot be undone</p>
                            </div>
                        </div>

                        <p className="text-gray-700 mb-6">
                            Are you sure you want to delete this conversation? All messages will be permanently removed.
                        </p>

                        <div className="flex gap-3">
                            <button
                                onClick={cancelDelete}
                                className="flex-1 px-4 py-2.5 border-2 border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50 transition"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmDelete}
                                className="flex-1 px-4 py-2.5 bg-red-600 rounded-lg font-semibold text-white hover:bg-red-700 transition"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
