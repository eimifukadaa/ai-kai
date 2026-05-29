import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { processDocument } from "@/lib/document-processor";

const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { documentId } = await req.json();

    if (!documentId) {
      return NextResponse.json(
        { error: "Missing documentId" },
        { status: 400 },
      );
    }

    const { error: docError } = await supabaseAdmin
      .from("documents")
      .update({ status: "processing" })
      .eq("id", documentId)
      .eq("user_id", session.user.id);

    if (docError) {
      return NextResponse.json({ error: docError.message }, { status: 500 });
    }

    await supabaseAdmin.from("jobs").delete().eq("document_id", documentId);

    const { error: jobError } = await supabaseAdmin.from("jobs").insert({
      document_id: documentId,
      user_id: session.user.id,
      status: "processing",
      stage: "serverless",
      attempts: 1,
    });

    if (jobError) {
      return NextResponse.json({ error: jobError.message }, { status: 500 });
    }

    const result = await processDocument(documentId);
    return NextResponse.json({ success: true, result });
  } catch (err: unknown) {
    console.error("API Error:", err);
    const message =
      err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
