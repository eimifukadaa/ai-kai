package main

import (
	"log"
	"os"
	"time"

	"github.com/joho/godotenv"
	"github.com/supabase-community/postgrest-go"
	"github.com/supabase-community/supabase-go"
	"kai-worker/processor"
)

func main() {
	_ = godotenv.Load("../.env.local")

	apiUrl := os.Getenv("NEXT_PUBLIC_SUPABASE_URL")
	serviceKey := os.Getenv("SUPABASE_SERVICE_ROLE_KEY")

	if apiUrl == "" || serviceKey == "" {
		log.Fatal("Missing supabase credentials")
	}

	client, err := supabase.NewClient(apiUrl, serviceKey, nil)
	if err != nil {
		log.Fatal("Failed to init supabase client:", err)
	}

	log.Println("Worker started. Polling for jobs...")

	proc := processor.NewProcessor(client, apiUrl, serviceKey)

	for {
		// Poll for jobs
		// 1. Fetch a queued job
		var jobs []processor.Job
		// Order expects (column, *OrderOpts)
		// Limit expects (count, foreignTable) - passing "" for foreignTable
		_, err := client.From("jobs").
			Select("*", "exact", false).
			Eq("status", "queued").
			Order("created_at", &postgrest.OrderOpts{Ascending: true}).
			Limit(1, "").
			ExecuteTo(&jobs)

		if err != nil {
			log.Println("Error polling jobs:", err)
			time.Sleep(5 * time.Second)
			continue
		}

		if len(jobs) == 0 {
			time.Sleep(2 * time.Second) // Idle wait
			continue
		}

		job := jobs[0]

		// 2. Lock job (Optimistic handling)
		// Update: (value, count, returning) -> "representation"
		var updated []processor.Job
		_, err = client.From("jobs").
			Update(map[string]interface{}{
				"status": "processing", 
				"updated_at": time.Now(),
			}, "", "representation").
			Eq("id", job.ID).
			Eq("status", "queued"). // Safety check
			ExecuteTo(&updated)

		if err != nil || len(updated) == 0 {
			// Another worker took it or error
			continue
		}

		log.Printf("Processing job %s for document %s", job.ID, job.DocumentID)

		// 3. Process
		err = proc.ProcessJob(job)
		
		status := "completed"
		lastError := ""
		if err != nil {
		    log.Printf("Job %s failed: %v", job.ID, err)
			status = "failed"
			lastError = err.Error()
			
			if job.Attempts < 3 {
			    status = "queued" // Re-queue
			} else {
                 // Final failure, mark document as error
                 client.From("documents").Update(map[string]interface{}{
                    "status": "error",
                 }, "", "").Eq("id", job.DocumentID).Execute()
            }
		} else {
            // Success! Mark document as ready
            _, _, errDoc := client.From("documents").Update(map[string]interface{}{
                "status": "ready",
            }, "", "").Eq("id", job.DocumentID).Execute()
            
            if errDoc != nil {
                log.Println("Failed to update document status to ready:", errDoc)
            }
        }

		// 4. Update Final Status
		updateData := map[string]interface{}{
			"status": status,
			"updated_at": time.Now(),
		}
		if lastError != "" {
			updateData["last_error"] = lastError
		}
		if status == "queued" {
		    updateData["attempts"] = job.Attempts + 1
		}

		_, _, err = client.From("jobs").
			Update(updateData, "", "representation").
			Eq("id", job.ID).
			Execute()
            
        if err != nil {
            log.Println("Failed to update final job status:", err)
        }
	}
}
