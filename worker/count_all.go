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

	var chunks []struct{ ID string }
	client.From("document_chunks").Select("id", "exact", true).ExecuteTo(&chunks)
	fmt.Printf("TOTAL CHUNKS IN DATABASE: %d\n", len(chunks))

	var docs []struct {
		ID     string `json:"id"`
		Name   string `json:"name"`
		Status string `json:"status"`
	}
	client.From("documents").Select("id, name, status", "exact", false).ExecuteTo(&docs)
	fmt.Printf("TOTAL DOCUMENTS: %d\n", len(docs))

	for _, d := range docs {
		var dChunks []struct{ ID string }
		client.From("document_chunks").Select("id", "exact", true).Eq("document_id", d.ID).ExecuteTo(&dChunks)
		fmt.Printf("- %s: %d chunks (Status: %s)\n", d.Name, len(dChunks), d.Status)
	}
}
