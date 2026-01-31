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

        // 1. Get Document Info (to know storage path and owner)
        const { data: doc, error: fetchError } = await supabaseAdmin
            .from('documents')
            .select('user_id, storage_path')
            .eq('id', documentId)
            .single();

        if (fetchError || !doc) {
            return NextResponse.json({ error: 'Document not found' }, { status: 404 });
        }

        if (doc.user_id !== session.user.id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // 2. Delete from Storage
        // Storage path is like "userId/docId/original.pdf"
        // We want to delete the whole folder usually, but Supabase Storage doesn't strictly have folders.
        // We'll delete the specific file.
        if (doc.storage_path && doc.storage_path !== 'pending') {
            const { error: storageError } = await supabaseAdmin
                .storage
                .from('kai_docs')
                .remove([doc.storage_path]);

            if (storageError) {
                console.error("Storage delete error:", storageError);
                // Proceed anyway to delete record
            }
        }

        // 3. Delete from Database
        // Cascading deletion should handle pages/chunks and jobs, but let's be explicit if needed.
        // Assuming cascade is ON for foreign keys.
        const { error: deleteError } = await supabaseAdmin
            .from('documents')
            .delete()
            .eq('id', documentId);

        if (deleteError) {
            return NextResponse.json({ error: deleteError.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });

    } catch (err: any) {
        console.error('Delete API Error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
