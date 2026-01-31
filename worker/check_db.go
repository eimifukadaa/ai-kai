package main

import (
	"fmt"
	"log"
	"os"

	"github.com/joho/godotenv"
	"github.com/supabase-community/supabase-go"
)

func main() {
	// Load .env.local
	_ = godotenv.Load("../.env.local")
	apiUrl := os.Getenv("NEXT_PUBLIC_SUPABASE_URL")
	serviceKey := os.Getenv("SUPABASE_SERVICE_ROLE_KEY")

	if apiUrl == "" || serviceKey == "" {
		log.Fatal("Missing Supabase credentials")
	}

	supaClient, err := supabase.NewClient(apiUrl, serviceKey, nil)
	if err != nil {
		log.Fatal("Supabase init failed:", err)
	}

	fmt.Println("=== Database Status Check ===\n")

	// Check document_chunks count
	var chunks []struct {
		ID      string `json:"id"`
		Content string `json:"content"`
	}
	_, err = supaClient.From("document_chunks").Select("id,content", "exact", false).Limit(5, "").ExecuteTo(&chunks)
	if err != nil {
		fmt.Println("❌ Error checking chunks:", err)
	} else {
		fmt.Printf("✅ Found chunks in database (showing first 5):\n")
		for i, c := range chunks {
			sample := c.Content
			if len(sample) > 100 {
				sample = sample[:100] + "..."
			}
			fmt.Printf("   [%d] %s\n", i, sample)
		}
		
		// Check embeddings
		var embedCount int64
		_, embedCount, _ = supaClient.From("document_chunks").Select("id", "exact", true).Not("embedding", "is", "null").Execute()
		
		var totalCount int64
		_, totalCount, _ = supaClient.From("document_chunks").Select("id", "exact", true).Execute()
		
		fmt.Printf("✅ Chunks with embeddings: %d / %d\n", embedCount, totalCount)
		
		if len(chunks) == 0 {
			fmt.Println("⚠️  WARNING: No chunks found! PDF processing may have failed.")
		}
	}

	// Check documents
	var docs []struct {
		ID     string `json:"id"`
		Name   string `json:"name"`
		Status string `json:"status"`
	}
	_, err = supaClient.From("documents").Select("id,name,status", "exact", false).Limit(10, "").ExecuteTo(&docs)
	if err != nil {
		fmt.Println("❌ Error checking documents:", err)
	} else {
		fmt.Printf("\n📄 Found %d documents:\n", len(docs))
		for _, doc := range docs {
			fmt.Printf("   - %s (Status: %s)\n", doc.Name, doc.Status)
		}
	}

	// Check jobs
	var jobs []struct {
		ID         string `json:"id"`
		DocumentID string `json:"document_id"`
		Status     string `json:"status"`
		LastError  string `json:"last_error"`
		Attempts   int    `json:"attempts"`
	}
	_, err = supaClient.From("jobs").Select("id,document_id,status,last_error,attempts", "exact", false).Limit(10, "").ExecuteTo(&jobs)
	if err != nil {
		fmt.Println("❌ Error checking jobs:", err)
	} else {
		fmt.Printf("\n⚙️  Found %d jobs:\n", len(jobs))
		for _, job := range jobs {
			fmt.Printf("   - Job %s (Status: %s, Attempts: %d)\n     Error: %s\n", job.ID[:8], job.Status, job.Attempts, job.LastError)
			
			// RESET FAILED/STUCK JOBS
			if job.Status == "processing" || job.Status == "failed" {
				fmt.Printf("   Build fix: Resetting job %s to 'queued' (Attempts: 0)...\n", job.ID[:8])
				_, _, err := supaClient.From("jobs").Update(map[string]interface{}{"status": "queued", "attempts": 0}, "", "").Eq("id", job.ID).Execute()
				
				// Also reset document to 'uploading' or 'queued' so UI shows progress? 
				// Worker updates it to 'ready' or 'error'.
				// If we reset job, we should probably reset document status from 'error' to 'uploading' (which triggers the queue?)
				// No, the UI status usually comes from 'documents'.
				
				if err != nil {
					fmt.Printf("   ❌ Failed to reset job: %v\n", err)
				} else {
					fmt.Printf("   ✅ Job reset successfully!\n")
				}
			}
		}
	}
	
	// Reset Documents in Error
	for _, doc := range docs {
	    if doc.Status == "error" {
	         fmt.Printf("   Resetting document %s from error to uploaded...\n", doc.Name)
	         supaClient.From("documents").Update(map[string]interface{}{"status": "uploaded"}, "", "").Eq("id", doc.ID).Execute()
	    }
	}
}
