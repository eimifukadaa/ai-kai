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

	var docs []struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	}

	_, err = client.From("documents").Select("id, name", "exact", false).ExecuteTo(&docs)
	if err != nil {
		log.Fatal(err)
	}

	fmt.Println("=== Documents in Database ===")
	for _, d := range docs {
		var count int
		// Get chunk count for this doc
		// Note: executing a query just for count is better
		var chunks []struct{ ID string }
		_, _ = client.From("document_chunks").Select("id", "exact", false).Eq("document_id", d.ID).ExecuteTo(&chunks)
		count = len(chunks)
		fmt.Printf("ID: %s | Name: %s | Chunks: %d\n", d.ID, d.Name, count)
	}
}
