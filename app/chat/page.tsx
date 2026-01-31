'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ChatRedirect() {
    const router = useRouter();

    useEffect(() => {
        // Create a new conversation and redirect
        async function createNewChat() {
            try {
                const res = await fetch('/api/conversations', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title: 'New Chat' })
                });

                if (res.ok) {
                    const conversation = await res.json();
                    router.replace(`/chat/${conversation.id}`);
                } else {
                    console.error('Failed to create conversation');
                }
            } catch (error) {
                console.error('Error creating conversation:', error);
            }
        }

        createNewChat();
    }, [router]);

    return (
        <div className="flex items-center justify-center min-h-screen">
            <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
                <p className="mt-4 text-gray-600">Creating new chat...</p>
            </div>
        </div>
    );
}
