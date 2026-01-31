import { createClient } from '@/lib/supabase-server';
import { NextRequest } from 'next/server';

// POST /api/conversations/[id]/messages - Add message to conversation
export async function POST(
    req: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const params = await props.params;
    const supabase = await createClient();
    const { data: { session }, error: authError } = await supabase.auth.getSession();

    if (authError || !session) {
        return new Response('Unauthorized', { status: 401 });
    }

    const conversationId = params.id;
    const { role, content } = await req.json();

    // Verify conversation belongs to user
    const { data: conversation } = await supabase
        .from('conversations')
        .select('id')
        .eq('id', conversationId)
        .eq('user_id', session.user.id)
        .single();

    if (!conversation) {
        return new Response('Conversation not found', { status: 404 });
    }

    const { data: message, error } = await supabase
        .from('messages')
        .insert({
            conversation_id: conversationId,
            role,
            content
        })
        .select()
        .single();

    if (error) {
        console.error('Error creating message:', error);
        return new Response('Failed to create message', { status: 500 });
    }

    return Response.json(message);
}
