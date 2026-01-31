import { createClient } from '@/lib/supabase-server';
import { NextRequest } from 'next/server';

// GET /api/conversations/[id] - Get conversation with messages
export async function GET(
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

    // Get conversation
    const { data: conversation, error: convError } = await supabase
        .from('conversations')
        .select('*')
        .eq('id', conversationId)
        .eq('user_id', session.user.id)
        .single();

    if (convError || !conversation) {
        return new Response('Conversation not found', { status: 404 });
    }

    // Get messages
    const { data: messages, error: msgError } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

    if (msgError) {
        console.error('Error fetching messages:', msgError);
        return new Response('Failed to fetch messages', { status: 500 });
    }

    return Response.json({
        ...conversation,
        messages: messages || []
    });
}

// DELETE /api/conversations/[id] - Delete conversation
export async function DELETE(
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

    const { error } = await supabase
        .from('conversations')
        .delete()
        .eq('id', conversationId)
        .eq('user_id', session.user.id);

    if (error) {
        console.error('Error deleting conversation:', error);
        return new Response('Failed to delete conversation', { status: 500 });
    }

    return new Response('Deleted', { status: 200 });
}

// PATCH /api/conversations/[id] - Update conversation title
export async function PATCH(
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
    const { title } = await req.json();

    const { error } = await supabase
        .from('conversations')
        .update({ title })
        .eq('id', conversationId)
        .eq('user_id', session.user.id);

    if (error) {
        console.error('Error updating conversation:', error);
        return new Response('Failed to update conversation', { status: 500 });
    }

    return new Response('Updated', { status: 200 });
}
