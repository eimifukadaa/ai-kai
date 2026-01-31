import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
    try {
        const supabase = await createClient();
        const { data: { session } } = await supabase.auth.getSession();

        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { documentId } = await req.json();

        if (!documentId) {
            return NextResponse.json({ error: 'Missing documentId' }, { status: 400 });
        }

        // 1. Verify document ownership (optional if using user_id in insert, but good practice)
        // We already have user_id from session.

        // 2. Update document status
        const { error: docError } = await supabaseAdmin
            .from('documents')
            .update({ status: 'processing' })
            .eq('id', documentId)
            .eq('user_id', session.user.id); // Ensure ownership

        if (docError) {
            return NextResponse.json({ error: docError.message }, { status: 500 });
        }

        // 3. Enqueue Job
        const { error: jobError } = await supabaseAdmin
            .from('jobs')
            .insert({
                document_id: documentId,
                user_id: session.user.id,
                status: 'queued',
                stage: 'init',
                attempts: 0
            });

        if (jobError) {
            return NextResponse.json({ error: jobError.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });

    } catch (err: any) {
        console.error('API Error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
