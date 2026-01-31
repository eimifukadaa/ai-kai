import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

// Admin client for privileged operations
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

        const { filename, size, mime } = await req.json();

        // 1. Create document record
        const { data: doc, error: dbError } = await supabaseAdmin
            .from('documents')
            .insert({
                user_id: session.user.id,
                name: filename,
                storage_path: 'pending', // Will update with ID
                status: 'uploading',
                pages_total: 0,
            })
            .select()
            .single();

        if (dbError) {
            console.error('DB Error:', dbError);
            return NextResponse.json({ error: dbError.message }, { status: 500 });
        }

        // 2. Generate path and update record
        const storagePath = `${session.user.id}/${doc.id}/original.pdf`;

        const { error: updateError } = await supabaseAdmin
            .from('documents')
            .update({ storage_path: storagePath })
            .eq('id', doc.id);

        if (updateError) {
            return NextResponse.json({ error: updateError.message }, { status: 500 });
        }

        // 3. TUS parameters
        const projectId = process.env.NEXT_PUBLIC_SUPABASE_URL!.split('https://')[1].split('.')[0];
        const tusUploadUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/upload/resumable`;

        return NextResponse.json({
            documentId: doc.id,
            tusUploadUrl,
            storagePath,
        });

    } catch (err: any) {
        console.error('API Error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
