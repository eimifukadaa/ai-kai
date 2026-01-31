import { createClient } from '@/lib/supabase-server';
import { NextRequest } from 'next/server';

// GET /api/conversations - List all conversations for the user
export async function GET() {
    const supabase = await createClient();
    const { data: { session }, error: authError } = await supabase.auth.getSession();

    if (authError || !session) {
        return new Response('Unauthorized', { status: 401 });
    }

    const { data: conversations, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('user_id', session.user.id)
        .order('updated_at', { ascending: false });

    if (error) {
        console.error('Error fetching conversations:', error);
        return new Response('Failed to fetch conversations', { status: 500 });
    }

    return Response.json(conversations);
}

// POST /api/conversations - Create a new conversation
export async function POST(req: NextRequest) {
    const supabase = await createClient();
    const { data: { session }, error: authError } = await supabase.auth.getSession();

    if (authError || !session) {
        return new Response('Unauthorized', { status: 401 });
    }

    const { title } = await req.json();

    const { data: conversation, error } = await supabase
        .from('conversations')
        .insert({
            user_id: session.user.id,
            title: title || 'New Chat'
        })
        .select()
        .single();

    if (error) {
        console.error('Error creating conversation:', error);
        return new Response('Failed to create conversation', { status: 500 });
    }

    return Response.json(conversation);
}
