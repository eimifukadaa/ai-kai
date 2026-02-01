"use client";

import { useState, useCallback } from "react";
import * as tus from "tus-js-client";
import { Upload, X, FileText, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

interface UploadState {
    filename: string;
    progress: number;
    status: "pending" | "uploading" | "complete" | "error";
    error?: string;
    upload?: tus.Upload;
}

export default function TusUploader({ onUploadComplete }: { onUploadComplete?: () => void }) {
    const [uploads, setUploads] = useState<Record<string, UploadState>>({});
    const [isDragOver, setIsDragOver] = useState(false);

    const startUpload = async (file: File) => {
        const uploadId = Math.random().toString(36).substring(7);

        setUploads((prev) => ({
            ...prev,
            [uploadId]: {
                filename: file.name,
                progress: 0,
                status: "uploading",
            },
        }));

        try {
            // 1. Get auth session
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error("Please log in to upload");

            // 2. Create document record & get signed TUS URL
            const createRes = await fetch("/api/uploads/create", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({
                    filename: file.name,
                    size: file.size,
                    mime: file.type,
                }),
            });

            if (!createRes.ok) throw new Error("Failed to initialize upload");
            const { documentId, tusUploadUrl, storagePath } = await createRes.json();

            // 3. Start TUS upload
            const upload = new tus.Upload(file, {
                endpoint: tusUploadUrl,
                retryDelays: [0, 1000, 3000, 5000, 10000],
                headers: {
                    Authorization: `Bearer ${session.access_token}`,
                },
                metadata: {
                    bucketName: "kai_docs",
                    objectName: storagePath,
                    contentType: file.type,
                    cacheControl: "3600",
                },
                onProgress: (bytesUploaded, bytesTotal) => {
                    const percentage = (bytesUploaded / bytesTotal) * 100;
                    setUploads((prev) => ({
                        ...prev,
                        [uploadId]: {
                            ...prev[uploadId],
                            progress: percentage,
                        },
                    }));
                },
                onSuccess: async () => {
                    // 4. Notify server of completion
                    await fetch("/api/uploads/complete", {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${session.access_token}`,
                        },
                        body: JSON.stringify({ documentId }),
                    });

                    setUploads((prev) => ({
                        ...prev,
                        [uploadId]: {
                            ...prev[uploadId],
                            status: "complete",
                            progress: 100,
                        },
                    }));

                    if (onUploadComplete) onUploadComplete();
                },
                onError: (error) => {
                    console.error("Upload error:", error);
                    setUploads((prev) => ({
                        ...prev,
                        [uploadId]: {
                            ...prev[uploadId],
                            status: "error",
                            error: error.message,
                        },
                    }));
                },
            });

            setUploads((prev) => ({
                ...prev,
                [uploadId]: {
                    ...prev[uploadId],
                    upload: upload
                }
            }))

            upload.start();

        } catch (err: any) {
            setUploads((prev) => ({
                ...prev,
                [uploadId]: {
                    ...prev[uploadId],
                    status: "error",
                    error: err.message,
                },
            }));
        }
    };

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);

        Array.from(e.dataTransfer.files).forEach((file) => {
            const validTypes = [
                "application/pdf",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "application/msword"
            ];
            if (validTypes.includes(file.type) || file.name.endsWith('.docx') || file.name.endsWith('.doc')) {
                startUpload(file);
            } else {
                alert("Only PDF and Word (DOCX) files are supported");
            }
        });
    }, []);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            Array.from(e.target.files).forEach((file) => startUpload(file));
        }
    };

    return (
        <div className="w-full max-w-2xl mx-auto space-y-6">
            <div
                className={cn(
                    "border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer",
                    isDragOver ? "border-blue-500 bg-blue-50/10" : "border-gray-300 hover:border-blue-400"
                )}
                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleDrop}
                onClick={() => document.getElementById("file-input")?.click()}
            >
                <input
                    id="file-input"
                    type="file"
                    accept=".pdf,.docx,.doc"
                    multiple
                    className="hidden"
                    onChange={handleFileSelect}
                />
                <div className="flex flex-col items-center gap-3">
                    <div className="p-4 bg-blue-100 rounded-full text-blue-600">
                        <Upload className="w-8 h-8" />
                    </div>
                    <h3 className="text-xl font-semibold text-gray-900">Upload Documents</h3>
                    <p className="text-gray-900">
                        Drag & drop PDF or Word files here
                    </p>
                    <p className="text-xs text-black font-medium">
                        Max 100MB per file. Resumable uploads enabled.
                    </p>
                </div>
            </div>

            <div className="space-y-3">
                {Object.entries(uploads).map(([id, state]) => (
                    <div key={id} className="bg-white border rounded-lg p-4 shadow-sm border-gray-200">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-3 overflow-hidden">
                                <FileText className="w-5 h-5 text-gray-500 shrink-0" />
                                <span className="font-medium truncate text-gray-900">{state.filename}</span>
                            </div>
                            <div className="shrink-0">
                                {state.status === "uploading" && (
                                    <span className="text-xs text-blue-600 font-medium">{Math.round(state.progress)}%</span>
                                )}
                                {state.status === "complete" && <CheckCircle className="w-5 h-5 text-green-500" />}
                                {state.status === "error" && <AlertCircle className="w-5 h-5 text-red-500" />}
                            </div>
                        </div>

                        {state.status === "uploading" && (
                            <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-blue-500 transition-all duration-300"
                                    style={{ width: `${state.progress}%` }}
                                />
                            </div>
                        )}

                        {state.status === "error" && (
                            <p className="text-sm text-red-500 mt-1">{state.error}</p>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
