"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import TusUploader from "@/components/TusUploader";
import { FileText, Clock, CheckCircle, AlertTriangle, Loader2, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

interface Document {
    id: string;
    name: string;
    status: string;
    created_at: string;
    pages_done: number;
    pages_total: number;
}

export default function DocumentsPage() {
    const [documents, setDocuments] = useState<Document[]>([]);
    const [loading, setLoading] = useState(true);
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [docToDelete, setDocToDelete] = useState<Document | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [userEmail, setUserEmail] = useState<string | null>(null);
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const router = useRouter();

    const fetchDocuments = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            router.push("/login");
            return;
        }

        setUserEmail(session.user.email || "User");

        const { data, error } = await supabase
            .from("documents")
            .select("*")
            .order("created_at", { ascending: false });

        if (!error && data) {
            setDocuments(data);
        }
        setLoading(false);
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
        router.push("/login"); // Explicit redirect to login after sign out
    };

    useEffect(() => {
        fetchDocuments();

        // Simple polling for status updates
        const interval = setInterval(fetchDocuments, 5000);
        return () => clearInterval(interval);
    }, []);

    const handleDeleteClick = (doc: Document) => {
        setDocToDelete(doc);
        setDeleteModalOpen(true);
    };

    const confirmDelete = async () => {
        if (!docToDelete) return;
        setIsDeleting(true);

        try {
            const res = await fetch('/api/documents/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ documentId: docToDelete.id })
            });

            if (!res.ok) {
                const err = await res.json();
                alert(`Error deleting: ${err.error}`);
            } else {
                // Remove from local state immediately
                setDocuments(docs => docs.filter(d => d.id !== docToDelete.id));
                setDeleteModalOpen(false);
                setDocToDelete(null);
            }
        } catch (error) {
            console.error(error);
            alert("Failed to delete document");
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 p-4 md:p-8 relative">
            <div className="max-w-5xl mx-auto space-y-8">
                <header className="flex justify-between items-center bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <span>📄</span> Kai Docs AI
                    </h1>

                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => router.push("/chat")}
                            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition font-medium shadow-md hover:shadow-lg flex items-center gap-2"
                        >
                            <span>💬</span> Go to Chat
                        </button>

                        <div className="relative">
                            <button
                                onClick={() => setIsMenuOpen(!isMenuOpen)}
                                className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-full transition border border-gray-200"
                            >
                                <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700 font-bold border border-indigo-200">
                                    {userEmail ? userEmail[0].toUpperCase() : "U"}
                                </div>
                                <span className="text-sm font-medium text-gray-700 hidden md:block">
                                    {userEmail}
                                </span>
                            </button>

                            {isMenuOpen && (
                                <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden z-20 animate-in fade-in zoom-in-95 duration-100">
                                    <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                                        <p className="text-sm text-gray-500">Signed in as</p>
                                        <p className="text-sm font-semibold text-gray-900 truncate" title={userEmail || ""}>{userEmail}</p>
                                    </div>
                                    <button
                                        onClick={handleLogout}
                                        className="w-full text-left px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition flex items-center gap-2"
                                    >
                                        <div className="w-5 h-5 flex items-center justify-center">🚪</div>
                                        Log Out
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </header>

                <section className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                    <h2 className="text-lg font-semibold mb-6 text-gray-900">Upload New PDF</h2>
                    <TusUploader onUploadComplete={fetchDocuments} />
                </section>

                <section>
                    <h2 className="text-lg font-semibold mb-4 text-gray-900">Uploaded Files</h2>
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                            <Loader2 className="w-8 h-8 animate-spin mb-2" />
                            <p>Loading documents...</p>
                        </div>
                    ) : documents.length === 0 ? (
                        <div className="text-center py-12 text-gray-500 bg-white rounded-2xl border border-dashed border-gray-200">
                            <div className="mx-auto w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mb-3">
                                <FileText className="w-6 h-6 text-gray-300" />
                            </div>
                            <p>No documents found.</p>
                            <p className="text-sm mt-1">Upload a PDF to get started.</p>
                        </div>
                    ) : (
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                            {documents.map((doc) => (
                                <div key={doc.id} className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm hover:shadow-lg transition-all duration-300 relative group">
                                    <div className="flex items-start justify-between mb-3">
                                        <div className="p-2 bg-indigo-50 rounded-xl text-indigo-600">
                                            <FileText className="w-6 h-6" />
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <StatusBadge status={doc.status} />
                                            <button
                                                onClick={() => handleDeleteClick(doc)}
                                                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
                                                title="Delete Document"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                    <h3 className="font-semibold text-gray-900 truncate mb-1" title={doc.name}>
                                        {doc.name}
                                    </h3>
                                    <div className="text-sm text-gray-900 flex flex-col gap-2">
                                        <span className="text-gray-400 text-xs">{new Date(doc.created_at).toLocaleDateString()}</span>
                                        {doc.status === 'processing' && doc.pages_total > 0 && (
                                            <div className="w-full mt-1">
                                                <div className="flex justify-between text-xs mb-1 text-indigo-700 font-medium">
                                                    <span>Processing OCR...</span>
                                                    <span>{Math.round((doc.pages_done / doc.pages_total) * 100)}%</span>
                                                </div>
                                                <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden border border-gray-200">
                                                    <div
                                                        className="bg-indigo-600 h-full rounded-full transition-all duration-500 ease-out shadow-[0_0_10px_rgba(79,70,229,0.5)] animate-pulse"
                                                        style={{ width: `${(doc.pages_done / doc.pages_total) * 100}%` }}
                                                    ></div>
                                                </div>
                                                <div className="text-[10px] text-gray-400 mt-1 text-right">
                                                    {doc.pages_done} of {doc.pages_total} pages completed
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            </div>

            {/* DELETE MODAL */}
            {deleteModalOpen && docToDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 transform transition-all scale-100">
                        <div className="flex justify-between items-start mb-4">
                            <div className="p-3 bg-red-100 rounded-full">
                                <AlertTriangle className="w-6 h-6 text-red-600" />
                            </div>
                            <button
                                onClick={() => setDeleteModalOpen(false)}
                                className="text-gray-400 hover:text-gray-600 transition"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <h3 className="text-xl font-bold text-gray-900 mb-2">Delete Document?</h3>
                        <p className="text-gray-600 mb-6">
                            Are you sure you want to delete <span className="font-bold text-gray-900">"{docToDelete.name}"</span>?
                            This action cannot be undone.
                        </p>

                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => setDeleteModalOpen(false)}
                                className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors"
                                disabled={isDeleting}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmDelete}
                                disabled={isDeleting}
                                className="px-4 py-2 bg-red-600 text-white hover:bg-red-700 rounded-lg font-medium transition-colors flex items-center gap-2 shadow-sm"
                            >
                                {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                Delete Forever
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function StatusBadge({ status }: { status: string }) {
    switch (status) {
        case "uploading":
            return <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Uploading</span>;
        case "processing":
            return <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs rounded-full flex items-center gap-1"><Clock className="w-3 h-3" /> Processing</span>;
        case "ready":
            return <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Ready</span>;
        case "error":
            return <span className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded-full flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Error</span>;
        default:
            return <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-full">{status}</span>;
    }
}
