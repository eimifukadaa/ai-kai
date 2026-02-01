package main

import (
	"fmt"
	"log"
	"os"

	"github.com/joho/godotenv"
	"github.com/supabase-community/supabase-go"
)

func main() {
	_ = godotenv.Load("../.env.local")
	apiUrl := os.Getenv("NEXT_PUBLIC_SUPABASE_URL")
	serviceKey := os.Getenv("SUPABASE_SERVICE_ROLE_KEY")

	client, err := supabase.NewClient(apiUrl, serviceKey, nil)
	if err != nil {
		log.Fatal(err)
	}

	fmt.Println("=== Checking Page 95 Content ===")

	var results []struct {
		ID         string `json:"id"`
		DocID      string `json:"document_id"`
		Content    string `json:"content"`
	}

	_, err = client.From("document_chunks").
		Select("id, document_id, content", "exact", false).
		Eq("page_number", "95").
		ExecuteTo(&results)

	if err != nil {
		log.Fatal(err)
	}

	fmt.Printf("Found %d chunks for page 95\n", len(results))
    for _, r := range results {
        fmt.Printf("\nChunk ID: %s, Doc ID: %s\n", r.ID, r.DocID)
        fmt.Println(r.Content)
    }
}
