package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/google/generative-ai-go/genai"
	"github.com/joho/godotenv"
	"github.com/supabase-community/postgrest-go"
	"github.com/supabase-community/supabase-go"
	"google.golang.org/api/option"
    "kai-worker/processor"
)

func main() {
	// Load env
	_ = godotenv.Load("../.env.local")
	apiUrl := os.Getenv("NEXT_PUBLIC_SUPABASE_URL")
	serviceKey := os.Getenv("SUPABASE_SERVICE_ROLE_KEY")
    apiKey := os.Getenv("GEMINI_API_KEY")

	fmt.Printf("API URL: %s\n", apiUrl)
    fmt.Printf("API Key Present: %v\n", apiKey != "")

	// Init Clients
	client, err := supabase.NewClient(apiUrl, serviceKey, nil)
	if err != nil {
		log.Fatal("Supabase init failed:", err)
	}
    
    ctx := context.Background()
    genClient, err := genai.NewClient(ctx, option.WithAPIKey(apiKey))
    if err != nil {
        log.Fatal("Gemini init failed:", err)
    }
    defer genClient.Close()

	// 1. Get Latest Document
	var docs []struct {
		ID          string    `json:"id"`
		StoragePath string    `json:"storage_path"`
        Status      string    `json:"status"`
        CreatedAt   time.Time `json:"created_at"`
	}
	_, err = client.From("documents").
		Select("*", "exact", false).
		Order("created_at", &postgrest.OrderOpts{Ascending: false}).
		Limit(1, "").
		ExecuteTo(&docs)

	if err != nil {
		log.Fatal("Fetch docs failed:", err)
	}
	if len(docs) == 0 {
		log.Fatal("No documents found in DB")
	}

	doc := docs[0]
	fmt.Printf("\nAnalyzing Latest Document:\nID: %s\nPath: %s\nStatus: %s\nCreated: %s\n", doc.ID, doc.StoragePath, doc.Status, doc.CreatedAt)

    // 2. Check existing chunks
    _, _, err = client.From("document_chunks").Select("count", "exact", false).Eq("document_id", doc.ID).Execute()
    // Cannot easily get count with this lib without struct, just checking error for now or query
    
    // 3. Download
    fmt.Println("\nDownloading file...")
    proc := processor.NewProcessor(client, apiUrl, serviceKey)
    // We'll manually download leveraging internal logic trigger or just replicate small part
    // Reusing processor logic by creating a dummy job? No, let's just use the Processor internal if possible or copy download logic.
    // Since Processor fields are private, we can't easily call internal methods if not exported. 
    // We will just try to run ProcessJob for this document directly!
    
    job := processor.Job{
        ID: "debug-job-" + time.Now().Format("20060102150405"),
        DocumentID: doc.ID,
        Status: "queued",
        Attempts: 0,
    }
    
    fmt.Println("Running Processor.ProcessJob() in Debug Mode...")
    err = proc.ProcessJob(job)
    if err != nil {
        fmt.Printf("❌ Processing Failed: %v\n", err)
    } else {
        fmt.Println("✅ Processing Success!")
    }
    
    fmt.Println("\nDone.")
}
